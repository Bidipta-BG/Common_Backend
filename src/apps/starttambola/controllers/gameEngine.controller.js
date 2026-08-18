const { startGame, stopGame, getGameState } = require('../services/gameEngine');

// ─── POST /tenants/:tenantId/games/:gameId/run ────────────────────────────────
const runGame = async (req, res, next) => {
  try {
    const result = await startGame(req.params.tenantId, req.params.gameId);
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

module.exports = { runGame, stopGameHandler, getState };
