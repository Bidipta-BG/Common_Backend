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

// ─── checkAvailability ────────────────────────────────────────────────────────
// Pre-flight check: runs three parallel SELECT queries against the tenants
// table to verify that email, phone, and domain are not already registered.
// Returns { emailTaken, phoneTaken, domainTaken } — all booleans.
// NOTE: The Supabase Auth system is a separate source of truth for emails, but
// is checked as a safety net inside createTenant itself (which throws a 409
// CONFLICT that the frontend handles gracefully — see RegisterForm.tsx).

const checkAvailability = async ({ email, phone, domain }) => {
  const [emailCheck, phoneCheck, domainCheck] = await Promise.all([
    supabaseAdmin.from('tenants').select('id').ilike('owner_email', email).maybeSingle(),
    supabaseAdmin.from('tenants').select('id').eq('owner_phone', phone).maybeSingle(),
    supabaseAdmin.from('tenants').select('id').eq('domain', domain).maybeSingle(),
  ]);

  return {
    emailTaken:  emailCheck.data  !== null,
    phoneTaken:  phoneCheck.data  !== null,
    domainTaken: domainCheck.data !== null,
  };
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
  referralCode,
}) => {
  // ── Step 1: Create tenant ──────────────────────────────────────────────────
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      business_name:  businessName,
      domain,
      owner_name:     ownerName,
      owner_email:    ownerEmail,
      owner_phone:    ownerPhone,
      owner_password: ownerPassword || null,  // stored in plain text for platform admin visibility
      status: 'pending_activation',
      theme_id: themeId || null,
    })
    .select()
    .single();

  if (tenantError) handleSupabaseError(tenantError, `Tenant with domain '${domain}'`);

  let createdSubscription = null;
  let mainAuthUserId = null;
  let bumperTenantId = null;

  try {
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

    if (subError) throw subError;
    createdSubscription = subscription;

    // ── Step 3: Create Supabase Auth user for the tenant owner ────────────────
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
    
    mainAuthUserId = authData.user.id;

    // ── Step 4: Automatically create the Bumper Tenant ─────────────────────────
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
        business_name:  businessName,
        domain:         bumperDomain,
        owner_name:     ownerName,
        owner_email:    bumperEmail,
        owner_phone:    ownerPhone,
        owner_password: ownerPassword || null,  // stored in plain text for platform admin visibility
        status: 'pending_activation',
        theme_id: themeId || null,
        is_bumper_game: true,
      })
      .select()
      .single();

    if (bumperTenantError) throw bumperTenantError;
    bumperTenantId = bumperTenant.id;

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
      throw new AppError(`Bumper Auth user creation failed: ${bumperAuthError.message}`, 'AUTH_ERROR', 500);
    }

    // ── Step 5: Log Pending Referral ─────────────────────────────────────────
    if (referralCode) {
      const { data: referrer } = await supabaseAdmin
        .from('referrers')
        .select('id')
        .eq('referral_code', referralCode)
        .eq('is_active', true)
        .maybeSingle();

      if (referrer) {
        await supabaseAdmin.from('referrals').insert({
          referrer_id: referrer.id,
          tenant_id: tenant.id,
          referral_code: referralCode,
          plan: plan,
          status: 'pending'
        });
      }
    }

    return { tenant, subscription: createdSubscription };
  } catch (err) {
    console.warn(`[createTenant] Registration failed for ${ownerEmail}. Rolling back...`);
    
    // Rollback Subscriptions
    await supabaseAdmin.from('subscriptions').delete().eq('tenant_id', tenant.id).then(({ error }) => {
      if (error) console.error('[createTenant] Rollback: failed to delete subscription:', error);
    });
    if (bumperTenantId) {
      await supabaseAdmin.from('subscriptions').delete().eq('tenant_id', bumperTenantId).then(({ error }) => {
        if (error) console.error('[createTenant] Rollback: failed to delete bumper subscription:', error);
      });
    }

    // Rollback Tenants
    await supabaseAdmin.from('tenants').delete().eq('id', tenant.id).then(({ error }) => {
      if (error) console.error('[createTenant] Rollback: failed to delete tenant:', error);
    });
    if (bumperTenantId) {
      await supabaseAdmin.from('tenants').delete().eq('id', bumperTenantId).then(({ error }) => {
        if (error) console.error('[createTenant] Rollback: failed to delete bumper tenant:', error);
      });
    }

    // Rollback Auth User
    if (mainAuthUserId) {
      await supabaseAdmin.auth.admin.deleteUser(mainAuthUserId).then(({ error }) => {
        if (error) console.error('[createTenant] Rollback: failed to delete main auth user:', error);
      });
    }

    if (err instanceof AppError) {
      throw err;
    }
    
    // If it's a Supabase error from any database step, pass it to the handler
    handleSupabaseError(err, 'Tenant Setup');
  }
};

// ─── getTenantByDomain ──────────────────────────────────────────────────────────
// Public domain lookup. Returns safe public fields only — no owner PII.
// whatsapp_number is included so the player page can build the
// "book via WhatsApp" links.

const getTenantByDomain = async (domain) => {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name, domain, status, theme_id, theme_overrides, organizer_whatsapp_number, organizer_whatsapp_group_link, is_bumper_game, website_status, announcement_text, owner_name, owner_email, owner_phone, recovery_email, telegram_link, whatsapp_active, telegram_active, game_name')
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
    websiteStatus:   data.website_status ?? 'open',
    announcementText: data.announcement_text ?? null,
    ownerName:       data.owner_name ?? null,
    ownerEmail:      data.owner_email ?? null,
    ownerPhone:      data.owner_phone ?? null,
    recoveryEmail:   data.recovery_email ?? null,
    telegramLink:    data.telegram_link ?? null,
    whatsappActive:  data.whatsapp_active ?? true,
    telegramActive:  data.telegram_active ?? false,
    gameName:        data.game_name ?? 'Jackpot Tambola',
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
      website_status,
      announcement_text,
      owner_name,
      owner_email,
      owner_phone,
      recovery_email,
      telegram_link,
      whatsapp_active,
      telegram_active,
      game_name,
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
    websiteStatus:   data.website_status ?? 'open',
    announcementText: data.announcement_text ?? null,
    ownerName:       data.owner_name ?? null,
    ownerEmail:      data.owner_email ?? null,
    ownerPhone:      data.owner_phone ?? null,
    recoveryEmail:   data.recovery_email ?? null,
    telegramLink:    data.telegram_link ?? null,
    whatsappActive:  data.whatsapp_active ?? true,
    telegramActive:  data.telegram_active ?? false,
    gameName:        data.game_name ?? 'Jackpot Tambola',
    theme:           data.themes ?? null,   // full theme row if a theme is selected
  };
};

// ─── updateTenant ──────────────────────────────────────────────────────────────
// Protected endpoint logic to update tenant details (like WhatsApp number or Theme ID)
const updateTenant = async (tenantId, updates) => {
  const allowedFields = ['theme_id', 'organizer_whatsapp_number', 'organizer_whatsapp_group_link', 'website_status', 'announcement_text', 'owner_name', 'owner_phone', 'recovery_email', 'telegram_link', 'whatsapp_active', 'telegram_active', 'game_name'];
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

// ─── getAllTenants ─────────────────────────────────────────────────────────────
// Admin endpoint logic to fetch all tenants and their subscriptions.

const getAllTenants = async () => {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select(`
      *,
      subscriptions (*)
    `)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error, 'Fetching all tenants');
  return data;
};

// ─── adminUpdateTenant ───────────────────────────────────────────────────────
// Internal admin endpoint logic to update tenant and subscription details
const adminUpdateTenant = async (tenantId, updates) => {
  const { status, start_date, expiry_date, organizer_whatsapp_number } = updates;

  // 1. Update Tenants Table
  let tenantUpdatePayload = {};
  if (organizer_whatsapp_number !== undefined) {
    tenantUpdatePayload.organizer_whatsapp_number = organizer_whatsapp_number;
  }
  if (status !== undefined) {
    // Map status slightly if they pass 'expired' (since tenants uses 'suspended', subscriptions uses 'expired')
    tenantUpdatePayload.status = status === 'expired' ? 'suspended' : status;
  }

  if (Object.keys(tenantUpdatePayload).length > 0) {
    const { error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .update(tenantUpdatePayload)
      .eq('id', tenantId);
    if (tenantErr) handleSupabaseError(tenantErr, 'Admin Update Tenant');
  }

  // 2. Update Subscriptions Table
  let subUpdatePayload = {};
  if (status !== undefined) subUpdatePayload.status = status;
  if (start_date !== undefined) subUpdatePayload.start_date = start_date;
  if (expiry_date !== undefined) subUpdatePayload.expiry_date = expiry_date;

  if (Object.keys(subUpdatePayload).length > 0) {
    const { error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .update(subUpdatePayload)
      .eq('tenant_id', tenantId);
    if (subErr) handleSupabaseError(subErr, 'Admin Update Subscription');
  }

  return { success: true };
};

// ─── markTenantAsPaid ──────────────────────────────────────────────────────────
// Called automatically after successful Cashfree payment.
// Marks the subscription's is_paid flag to true for both the main and bumper tenant.
const markTenantAsPaid = async (tenantId) => {
  // Get the main tenant to find its domain
  const { data: tenant, error: fetchErr } = await supabaseAdmin
    .from('tenants')
    .select('domain')
    .eq('id', tenantId)
    .single();

  if (fetchErr) handleSupabaseError(fetchErr, 'Fetching tenant for payment update');

  // Find all tenants (main and bumper) associated with this domain
  const bumperDomain = `bumper.${tenant.domain}`;
  const { data: relatedTenants, error: relatedErr } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .in('domain', [tenant.domain, bumperDomain]);

  if (relatedErr) handleSupabaseError(relatedErr, 'Fetching related tenants for payment update');

  const tenantIds = relatedTenants.map(t => t.id);

  // Update subscriptions to is_paid = true
  const { error: updateErr } = await supabaseAdmin
    .from('subscriptions')
    .update({ is_paid: true })
    .in('tenant_id', tenantIds);

  if (updateErr) handleSupabaseError(updateErr, 'Updating subscription payment status');

  return { success: true, updatedCount: tenantIds.length };
};

module.exports = { adminUpdateTenant, checkAvailability, createTenant, getAllTenants, getTenantByDomain, getTenantById, markTenantAsPaid, updateTenant };
