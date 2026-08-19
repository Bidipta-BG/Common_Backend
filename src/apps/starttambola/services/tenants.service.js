const { supabaseAdmin } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');
const { handleSupabaseError } = require('../utils/supabaseError');

const attachDomainToVercel = async (domain) => {
  if (!process.env.VERCEL_PROJECT_ID || !process.env.VERCEL_ACCESS_TOKEN) {
    console.warn('[Vercel API] Skipping domain attachment because VERCEL_PROJECT_ID or VERCEL_ACCESS_TOKEN is missing.');
    return;
  }

  const response = await fetch(`https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VERCEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: domain }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Vercel API] Failed to attach domain ${domain}:`, errorBody);
    throw new AppError(`Failed to attach domain to hosting provider: ${response.statusText}`, 'VERCEL_ERROR', 500);
  }
};

// ─── createTenant ─────────────────────────────────────────────────────────────
// 1. Inserts a tenant row (status: 'pending_activation').
// 2. Inserts a subscription row (status: 'pending_activation', plan from body).
// 3. Creates a Supabase Auth user for the owner with app_metadata
//    { tenant_id, role: 'tenant_admin' } — email_confirm is set to true so the
//    owner can log in immediately after you send them their temporary password.
//
// NOTE: This does NOT roll back atomically if step 2 or 3 fails — implement a
// Postgres transaction / cleanup job if strict atomicity is required later.

const createTenant = async ({
  businessName,
  domain,
  ownerName,
  ownerEmail,
  ownerPhone,
  ownerPassword,
  plan,
  themeId,
}) => {
  // ── Step 1: Create tenant ──────────────────────────────────────────────────
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      business_name: businessName,
      domain,
      owner_name:  ownerName,
      owner_email: ownerEmail,
      owner_phone: ownerPhone,
      status: 'pending_activation',
      theme_id: themeId || null,
    })
    .select()
    .single();

  if (tenantError) handleSupabaseError(tenantError, `Tenant with domain '${domain}'`);

  // ── Step 1.5: Attach Domain to Vercel ──────────────────────────────────────
  await attachDomainToVercel(domain);

  // ── Step 2: Create subscription ───────────────────────────────────────────
  const { data: subscription, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .insert({
      tenant_id: tenant.id,
      plan,
      status: 'pending_activation',
    })
    .select()
    .single();

  if (subError) handleSupabaseError(subError, 'Subscription');

  // ── Step 3: Create Supabase Auth user for the tenant owner ────────────────
  // app_metadata is set server-side only — never editable by the user.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true, // mark email as confirmed so login works immediately
    password: ownerPassword || 'TempPassword123!', // fallback if no password provided
    user_metadata: {
      full_name: ownerName,
      phone:     ownerPhone,
    },
    app_metadata: {
      tenant_id: tenant.id,
      role: 'tenant_admin',
    },
  });

  if (authError) {
    if (authError.message?.toLowerCase().includes('already registered') ||
        authError.message?.toLowerCase().includes('already been registered')) {
      throw new AppError(
        `A Supabase Auth user with email '${ownerEmail}' already exists`,
        'CONFLICT',
        409
      );
    }
    throw new AppError(`Auth user creation failed: ${authError.message}`, 'AUTH_ERROR', 500);
  }

  // ── Step 4: Automatically create the Bumper Tenant ─────────────────────────
  try {
    const bumperDomain = `bumper.${domain}`;
    let bumperEmail = ownerEmail;
    
    // Create +bumper email (e.g., john@gmail.com -> john+bumper@gmail.com)
    if (ownerEmail.includes('@')) {
      const [userPart, domainPart] = ownerEmail.split('@');
      bumperEmail = `${userPart}+bumper@${domainPart}`;
    }

    // Insert Bumper Tenant
    const { data: bumperTenant, error: bumperTenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name: businessName,
        domain: bumperDomain,
        owner_name: ownerName,
        owner_email: bumperEmail,
        owner_phone: ownerPhone,
        status: 'pending_activation',
        theme_id: themeId || null,
        is_bumper_game: true,
      })
      .select()
      .single();

    if (bumperTenantError) throw bumperTenantError;

    // Attach Bumper Domain to Vercel
    await attachDomainToVercel(bumperDomain);

    // Create Bumper Subscription
    const { error: bumperSubError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        tenant_id: bumperTenant.id,
        plan,
        status: 'pending_activation',
      });

    if (bumperSubError) throw bumperSubError;

    // Create Supabase Auth User for Bumper Admin
    const { error: bumperAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: bumperEmail,
      email_confirm: true,
      password: ownerPassword || 'TempPassword123!',
      user_metadata: {
        full_name: ownerName,
        phone: ownerPhone,
      },
      app_metadata: {
        tenant_id: bumperTenant.id,
        role: 'tenant_admin',
      },
    });

    if (bumperAuthError) {
      console.error(`[Bumper Auth] Failed to create auth user for ${bumperEmail}:`, bumperAuthError.message);
    }

  } catch (err) {
    console.error('[Bumper Setup] Failed to auto-provision bumper environment:', err);
  }

  return { tenant, subscription };
};

// ─── getTenantByDomain ──────────────────────────────────────────────────────────
// Public domain lookup. Returns safe public fields only — no owner PII.
// whatsapp_number is included so the player page can build the
// "book via WhatsApp" links.

const getTenantByDomain = async (domain) => {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name, domain, status, theme_id, theme_overrides, organizer_whatsapp_number, organizer_whatsapp_group_link, is_bumper_game')
    .eq('domain', domain)
    .single();

  if (error) handleSupabaseError(error, `Tenant with domain '${domain}'`);

  return {
    id:              data.id,
    businessName:    data.business_name,
    domain:          data.domain,
    status:          data.status,
    themeId:         data.theme_id,
    themeOverrides:  data.theme_overrides,
    whatsappNumber:  data.organizer_whatsapp_number ?? null,
    whatsappGroupLink: data.organizer_whatsapp_group_link ?? null,
    is_bumper_game:  data.is_bumper_game ?? false,
  };
};

// ─── getTenantById ─────────────────────────────────────────────────────────────
// Public endpoint. Used when the player page already knows the tenant id
// (from middleware) and needs branding details without re-hitting the
// domain lookup. Returns the same safe public fields as getTenantByDomain.
// Also joins the tenant's current theme row so the frontend can use
// colours/fonts directly without a second GET /themes fetch.

const getTenantById = async (tenantId) => {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select(`
      id,
      business_name,
      domain,
      status,
      theme_id,
      theme_overrides,
      organizer_whatsapp_number,
      organizer_whatsapp_group_link,
      is_bumper_game,
      themes (
        id,
        name,
        preview_image_url,
        config
      )
    `)
    .eq('id', tenantId)
    .single();

  if (error) handleSupabaseError(error, 'Tenant');

  return {
    id:              data.id,
    businessName:    data.business_name,
    domain:          data.domain,
    status:          data.status,
    themeId:         data.theme_id,
    themeOverrides:  data.theme_overrides,
    whatsappNumber:  data.organizer_whatsapp_number ?? null,
    whatsappGroupLink: data.organizer_whatsapp_group_link ?? null,
    is_bumper_game:  data.is_bumper_game ?? false,
    theme:           data.themes ?? null,   // full theme row if a theme is selected
  };
};

// ─── updateTenant ──────────────────────────────────────────────────────────────
// Protected endpoint logic to update tenant details (like WhatsApp number or Theme ID)
const updateTenant = async (tenantId, updates) => {
  const allowedFields = ['theme_id', 'organizer_whatsapp_number', 'organizer_whatsapp_group_link'];
  const updateData = {};

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      updateData[key] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError('No valid fields provided for update', 'VALIDATION_ERROR', 400);
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(updateData)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) handleSupabaseError(error, 'Tenant Update');
  return data;
};

module.exports = { createTenant, getTenantByDomain, getTenantById, updateTenant };
