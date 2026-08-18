const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../utils/validateBody');
const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');
const { createAgent, listAgents, updateAgent, getMyPerformance, getMyTickets } = require('../controllers/agents.controller');

// ─── Shared auth guards ────────────────────────────────────────────────────────
const adminAuth = [requireAuth, requireRole('tenant_admin'), requireTenantMatch];
const agentAuth = [requireAuth, requireRole('agent'),        requireTenantMatch];

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const loginIdentifier = z
  .string()
  .min(3, 'Username must be at least 3 characters long');

const createAgentSchema = z.object({
  name:                 z.string().min(1, 'name is required'),
  phone:                loginIdentifier,
  password:             z.string().min(6, 'password must be at least 6 characters'),
  commissionPerTicket:  z.number({ required_error: 'commissionPerTicket is required' })
                          .nonnegative('commissionPerTicket must be ≥ 0'),
});

const updateAgentSchema = z.object({
  name:                z.string().min(1).optional(),
  phone:               loginIdentifier.optional(),
  commissionPerTicket: z.number().nonnegative().optional(),
  status:              z.enum(['active', 'disabled']).optional(),
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided for update' }
);

// ─── Router (mounted at /api/starttambola/tenants in index.js) ────────────────
const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: GET /:tenantId/agents/me/performance MUST be registered BEFORE
// any route with /:agentId to avoid 'me' being captured as an agentId.
// (These two patterns have different path depths so Express wouldn't actually
// confuse them, but explicit ordering makes the intent clear.)
// ─────────────────────────────────────────────────────────────────────────────

// GET /tenants/:tenantId/agents/me/performance  (agent-only)
// Returns the calling agent's own performance data from agent_performance_self.
// NEVER touches agent_performance_admin — the service layer enforces this too.
router.get('/:tenantId/agents/me/performance', ...agentAuth, getMyPerformance);

// GET /tenants/:tenantId/agents/me/tickets  (agent-only)
// Returns all tickets booked by the calling agent.
router.get('/:tenantId/agents/me/tickets', ...agentAuth, getMyTickets);

// POST /tenants/:tenantId/agents  (tenant_admin)
router.post('/:tenantId/agents', ...adminAuth, validateBody(createAgentSchema), createAgent);

// GET  /tenants/:tenantId/agents  (tenant_admin)
router.get('/:tenantId/agents', ...adminAuth, listAgents);

// PATCH /tenants/:tenantId/agents/:agentId  (tenant_admin)
// Registered AFTER /me/performance — safe since path depths differ anyway.
router.patch('/:tenantId/agents/:agentId', ...adminAuth, validateBody(updateAgentSchema), updateAgent);

module.exports = router;
