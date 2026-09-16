const { supabaseAdmin } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');
const { handleSupabaseError } = require('../utils/supabaseError');

// ─── listThemes ───────────────────────────────────────────────────────────────
// Returns all active themes from the shared library.

const listThemes = async () => {
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) handleSupabaseError(error, 'Themes');
  return data ?? [];
};

// ─── updateTenantTheme ────────────────────────────────────────────────────────
// Validates that the chosen themeId exists and is active before persisting.
// themeOverrides is an arbitrary JSON object stored alongside the theme_id
// so the tenant's frontend can layer custom colours / fonts on top of the
// base theme without forking it.

const updateTenantTheme = async (tenantId, { themeId, themeOverrides }) => {
  // Verify theme exists and is active (don't let tenants select deprecated themes)
  const { data: theme, error: themeErr } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .eq('id', themeId)
    .eq('is_active', true)
    .maybeSingle();

  if (themeErr) handleSupabaseError(themeErr, 'Theme');

  if (!theme) {
    throw new AppError(
      `Theme '${themeId}' does not exist or is not active.`,
      'NOT_FOUND',
      404
    );
  }

  const updateData = {
    theme_id: themeId,
  };
  
  if (themeOverrides !== undefined) {
    updateData.theme_overrides = themeOverrides ?? {};
  }

  const { data: tenant, error: updateErr } = await supabaseAdmin
    .from('tenants')
    .update(updateData)
    .eq('id', tenantId)
    .select('id, theme_id, theme_overrides')
    .single();

  if (updateErr) handleSupabaseError(updateErr, 'Tenant');

  return { tenant, theme };
};

// ─── listPosterTemplates ──────────────────────────────────────────────────────
// Returns all active poster templates from the shared library.
// Rendering (text compositing onto the template image) happens client-side
// in the Next.js app via canvas — this endpoint only serves the metadata.

const listPosterTemplates = async () => {
  const { data, error } = await supabaseAdmin
    .from('poster_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) handleSupabaseError(error, 'PosterTemplates');
  return data ?? [];
};

// ─── updateTenantThemeByDomain ────────────────────────────────────────────────
// Finds a tenant by domain, verifies it belongs to the authenticated user's tenantId,
// and updates the theme.

const updateTenantThemeByDomain = async (authTenantId, { domain, themeId, themeOverrides }) => {
  const { data: tenant, error: domainErr } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('domain', domain)
    .maybeSingle();

  if (domainErr) handleSupabaseError(domainErr, 'Tenant');
  
  if (!tenant) {
    throw new AppError(`No tenant found for domain '${domain}'`, 'NOT_FOUND', 404);
  }

  // Security check: ensure they can only update their own tenant
  if (tenant.id !== authTenantId) {
    throw new AppError('You do not have permission to update this tenant.', 'FORBIDDEN', 403);
  }

  // Reuse existing update logic
  return await updateTenantTheme(tenant.id, { themeId, themeOverrides });
};

module.exports = { listThemes, updateTenantTheme, listPosterTemplates, updateTenantThemeByDomain };
