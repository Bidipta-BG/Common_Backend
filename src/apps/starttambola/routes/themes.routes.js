const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../utils/validateBody');
const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');
const { getThemes, updateTheme, updateThemeByDomain, getPosterTemplates } = require('../controllers/themes.controller');

// ─── Zod schema ────────────────────────────────────────────────────────────────
const updateThemeSchema = z.object({
  themeId: z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, 'themeId must be a valid UUID'),
  // Arbitrary key-value overrides (colours, fonts, etc.) stored as JSONB.
  // null/undefined means "use theme defaults with no overrides".
  themeOverrides: z.record(z.any()).nullable().optional(),
});

const updateThemeByDomainSchema = z.object({
  domain: z.string().min(1, 'domain is required'),
  themeId: z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, 'themeId must be a valid UUID'),
  themeOverrides: z.record(z.any()).nullable().optional(),
});

// ─── Router ────────────────────────────────────────────────────────────────────
// This router uses explicit full paths (not a shared mount prefix) because its
// three routes span two different mount points: /themes, /poster-templates, and
// /tenants/:tenantId/theme. Mounted at the root with router.use(themesRoutes)
// in index.js.
const router = express.Router();

// GET  /themes  (PUBLIC)
// Returns all is_active themes from the shared library.
router.get('/themes', getThemes);

// PATCH /tenants/:tenantId/theme  (tenant_admin)
// Validates themeId is active before updating tenant.theme_id + theme_overrides.
router.patch(
  '/tenants/:tenantId/theme',
  requireAuth,
  requireRole('tenant_admin'),
  requireTenantMatch,
  validateBody(updateThemeSchema),
  updateTheme
);

// POST /themes/update-by-domain (tenant_admin)
// Updates theme_id + theme_overrides using the domain to identify the tenant.
router.post(
  '/themes/update-by-domain',
  requireAuth,
  requireRole('tenant_admin'),
  validateBody(updateThemeByDomainSchema),
  updateThemeByDomain
);

// GET  /poster-templates  (PUBLIC)
// Returns all is_active poster templates from the shared library.
// Poster rendering happens client-side (canvas) — this only serves metadata.
router.get('/poster-templates', getPosterTemplates);

module.exports = router;
