const agentsService = require('../services/agents.service');

// ─── POST /tenants/:tenantId/agents ──────────────────────────────────────────
const createAgent = async (req, res, next) => {
  try {
    const agent = await agentsService.createAgent(
      req.params.tenantId,
      req.body,
      req.auth.userId  // created_by
    );
    return res.status(201).json({ data: agent });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId/agents ────────────────────────────────────────────
const listAgents = async (req, res, next) => {
  try {
    const agents = await agentsService.listAgents(req.params.tenantId);
    return res.status(200).json({ data: agents });
  } catch (err) {
    return next(err);
  }
};

// ─── PATCH /tenants/:tenantId/agents/:agentId ─────────────────────────────────
const updateAgent = async (req, res, next) => {
  try {
    const agent = await agentsService.updateAgent(
      req.params.tenantId,
      req.params.agentId,
      req.body
    );
    return res.status(200).json({ data: agent });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId/agents/me/performance ─────────────────────────────
// Agent-only. Returns from agent_performance_self — never admin view.
const getMyPerformance = async (req, res, next) => {
  try {
    const result = await agentsService.getMyPerformance(
      req.params.tenantId,
      req.auth.userId
    );
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId/agents/me/tickets ─────────────────────────────────
// Agent-only. Returns tickets booked by this agent.
const getMyTickets = async (req, res, next) => {
  try {
    const tickets = await agentsService.getMyTickets(
      req.params.tenantId,
      req.auth.userId
    );
    return res.status(200).json({ data: tickets });
  } catch (err) {
    return next(err);
  }
};

module.exports = { createAgent, listAgents, updateAgent, getMyPerformance, getMyTickets };

