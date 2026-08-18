const { listThemes, updateTenantTheme, listPosterTemplates } = require('../services/themes.service');

// ─── GET /themes (PUBLIC) ─────────────────────────────────────────────────────
const getThemes = async (req, res, next) => {
  try {
    const themes = await listThemes();
    return res.status(200).json({ data: themes });
  } catch (err) {
    return next(err);
  }
};

// ─── PATCH /tenants/:tenantId/theme (tenant_admin) ────────────────────────────
const updateTheme = async (req, res, next) => {
  try {
    const result = await updateTenantTheme(req.params.tenantId, req.body);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /poster-templates (PUBLIC) ──────────────────────────────────────────
const getPosterTemplates = async (req, res, next) => {
  try {
    const templates = await listPosterTemplates();
    return res.status(200).json({ data: templates });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getThemes, updateTheme, getPosterTemplates };
