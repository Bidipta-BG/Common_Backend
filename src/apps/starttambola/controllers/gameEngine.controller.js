const { startGame, stopGame, getGameState, pauseGame, resumeGame, updateGameInterval, resetCallNumbers } = require('../services/gameEngine');

// ─── POST /tenants/:tenantId/games/:gameId/run ────────────────────────────────
const runGame = async (req, res, next) => {
  try {
    const result = await startGame(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /tenants/:tenantId/games/:gameId/pause ──────────────────────────────
const pauseGameHandler = async (req, res, next) => {
  try {
    const result = await pauseGame(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /tenants/:tenantId/games/:gameId/resume ─────────────────────────────
const resumeGameHandler = async (req, res, next) => {
  try {
    const result = await resumeGame(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /tenants/:tenantId/games/:gameId/update-interval ────────────────────
const updateIntervalHandler = async (req, res, next) => {
  try {
    const result = await updateGameInterval(req.params.tenantId, req.params.gameId, req.body.intervalSeconds);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /tenants/:tenantId/games/:gameId/stop ───────────────────────────────
const stopGameHandler = async (req, res, next) => {
  try {
    const result = await stopGame(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId/games/:gameId/state (PUBLIC) ─────────────────────
const getState = async (req, res, next) => {
  try {
    const state = await getGameState(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: state });
  } catch (err) {
    return next(err);
  }
};
// ─── POST /tenants/:tenantId/games/:gameId/reset-call ────────────────────────
const resetCallHandler = async (req, res, next) => {
  try {
    const result = await resetCallNumbers(req.params.tenantId, req.params.gameId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

module.exports = { runGame, pauseGameHandler, resumeGameHandler, updateIntervalHandler, stopGameHandler, getState, resetCallHandler };
