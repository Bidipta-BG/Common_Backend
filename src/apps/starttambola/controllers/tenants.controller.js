const tenantsService = require('../services/tenants.service');

// ─── POST /internal/tenants ───────────────────────────────────────────────────
const createTenant = async (req, res, next) => {
  try {
    const result = await tenantsService.createTenant(req.body);
    return res.status(201).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /internal/tenants/check-availability ───────────────────────────────
// Pre-flight check: verifies email, phone, and domain are not already taken.
// Returns { data: { emailTaken, phoneTaken, domainTaken } } — no DB writes.
const checkAvailability = async (req, res, next) => {
  try {
    const result = await tenantsService.checkAvailability(req.body);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/by-domain/:domain ──────────────────────────────────────────
const getByDomain = async (req, res, next) => {
  try {
    const tenant = await tenantsService.getTenantByDomain(req.params.domain);
    return res.status(200).json({ data: tenant });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId (PUBLIC) ───────────────────────────────────────────────
const getTenantById = async (req, res, next) => {
  try {
    const tenant = await tenantsService.getTenantById(req.params.tenantId);
    return res.status(200).json({ data: tenant });
  } catch (err) {
    return next(err);
  }
};
// ─── PATCH /tenants/:tenantId ────────────────────────────────────────────────
const updateTenant = async (req, res, next) => {
  try {
    const result = await tenantsService.updateTenant(req.params.tenantId, req.body);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /internal/tenants ────────────────────────────────────────────────────
const getAllTenants = async (req, res, next) => {
  try {
    const tenants = await tenantsService.getAllTenants();
    return res.status(200).json({ data: tenants });
  } catch (err) {
    return next(err);
  }
};

// ─── PATCH /internal/tenants/:tenantId ───────────────────────────────────────
const adminUpdateTenant = async (req, res, next) => {
  try {
    const result = await tenantsService.adminUpdateTenant(req.params.tenantId, req.body);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /internal/tenants/:tenantId/mark-paid ──────────────────────────────
const markTenantAsPaid = async (req, res, next) => {
  try {
    const result = await tenantsService.markTenantAsPaid(req.params.tenantId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /internal/tenants/:tenantId/games ──────────────────────────────────
const getTenantGames = async (req, res, next) => {
  try {
    const games = await tenantsService.getTenantGames(req.params.tenantId);
    return res.status(200).json({ data: games });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /internal/tenants/:tenantId/games/:gameId/dividends ──────────────────
const getGameDividendsForAdmin = async (req, res, next) => {
  try {
    const result = await tenantsService.getGameDividendsForAdmin(
      req.params.tenantId,
      req.params.gameId
    );
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── PATCH /internal/tenants/:tenantId/games/:gameId/dividends ────────────────
const updateGameDividendsForAdmin = async (req, res, next) => {
  try {
    const result = await tenantsService.updateGameDividendsForAdmin(
      req.params.tenantId,
      req.params.gameId,
      req.body.dividends
    );
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  adminUpdateTenant,
  checkAvailability,
  createTenant,
  getAllTenants,
  getByDomain,
  getTenantById,
  markTenantAsPaid,
  updateTenant,
  getTenantGames,
  getGameDividendsForAdmin,
  updateGameDividendsForAdmin,
};
