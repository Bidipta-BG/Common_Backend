const gamesService = require('../services/games.service');

// ─── POST /tenants/:tenantId/games ────────────────────────────────────────────
const createGame = async (req, res, next) => {
  try {
    const game = await gamesService.createGame(req.params.tenantId, req.body);
    return res.status(201).json({ data: game });
  } catch (err) {
    return next(err);
  }
};

// ─── PATCH /tenants/:tenantId/games/:gameId ───────────────────────────────────
const updateGame = async (req, res, next) => {
  try {
    const game = await gamesService.updateGame(
      req.params.tenantId,
      req.params.gameId,
      req.body
    );
    return res.status(200).json({ data: game });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /tenants/:tenantId/games/:gameId/reset-tickets ─────────────────────
const resetTickets = async (req, res, next) => {
  try {
    const result = await gamesService.resetTickets(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /tenants/:tenantId/games/:gameId/reset-game ────────────────────────
const resetGame = async (req, res, next) => {
  try {
    const game = await gamesService.resetGame(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: game });
  } catch (err) {
    return next(err);
  }
};

// ─── DELETE /tenants/:tenantId/games/:gameId ─────────────────────────────────
const deleteGame = async (req, res, next) => {
  try {
    const result = await gamesService.deleteGame(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── PUT /tenants/:tenantId/games/:gameId/dividends ──────────────────────────
const upsertDividends = async (req, res, next) => {
  try {
    const dividends = await gamesService.upsertDividends(
      req.params.tenantId,
      req.params.gameId,
      req.body
    );
    return res.status(200).json({ data: dividends });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId/games/:gameId ────────────────────────────────────
const getGame = async (req, res, next) => {
  try {
    const game = await gamesService.getGame(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: game });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId/games/current (PUBLIC) ──────────────────────────────
// Returns the single most relevant game: running > next scheduled/booking_open
// > most recently completed. Returns null if the tenant has no games.
const getCurrentGame = async (req, res, next) => {
  try {
    const game = await gamesService.getCurrentGame(req.params.tenantId);
    return res.status(200).json({ data: game });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId/games (tenant_admin) ──────────────────────────────
// Returns all games for a tenant (used by admin dashboard list view).
const getGamesList = async (req, res, next) => {
  try {
    const games = await gamesService.getGamesList(req.params.tenantId);
    return res.status(200).json({ data: games });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createGame,
  updateGame,
  resetTickets,
  resetGame,
  deleteGame,
  upsertDividends,
  getGame,
  getCurrentGame,
  getGamesList,
};


