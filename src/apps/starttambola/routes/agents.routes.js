const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../utils/validateBody');
const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');
const { createAgent, listAgents, updateAgent, getMyPerformance, getMyTickets, deleteAgent, deleteAllAgents } = require('../controllers/agents.controller');

// ─── Shared auth guards ────────────────────────────────────────────────────────
const adminAuth = [requireAuth, requireRole('tenant_admin'), requireTenantMatch];
const agentAuth = [requireAuth, requireRole('agent'),        requireTenantMatch];

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createAgentSchema = z.object({
  name:     z.string().min(1, 'Agent Name is required'),
  password: z.string().min(1, 'password is required'),
});

const updateAgentSchema = z.object({
  name:   z.string().min(1).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  whatsapp_number: z.string().optional().nullable(),
  telegram_username: z.string().optional().nullable(),
  sms_number: z.string().optional().nullable(),
  email_id: z.string().optional().nullable(),
  facebook_id: z.string().optional().nullable(),
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

// PATCH /tenants/:tenantId/agents/me (agent-only)
router.patch('/:tenantId/agents/me', ...agentAuth, validateBody(updateAgentSchema), require('../controllers/agents.controller').updateMyAgent);

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

// DELETE /tenants/:tenantId/agents (tenant_admin)
router.delete('/:tenantId/agents', ...adminAuth, deleteAllAgents);

// DELETE /tenants/:tenantId/agents/:agentId (tenant_admin)
router.delete('/:tenantId/agents/:agentId', ...adminAuth, deleteAgent);

// PATCH /tenants/:tenantId/agents/:agentId  (tenant_admin)
// Registered AFTER /me/performance — safe since path depths differ anyway.
router.patch('/:tenantId/agents/:agentId', ...adminAuth, validateBody(updateAgentSchema), updateAgent);

module.exports = router;
