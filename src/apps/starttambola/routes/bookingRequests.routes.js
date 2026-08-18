const express = require('express');
const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');
const { listRequests, approveRequest, rejectRequest } = require('../controllers/bookingRequests.controller');

// ─── Shared guard: tenant_admin only ─────────────────────────────────────────
const adminAuth = [requireAuth, requireRole('tenant_admin'), requireTenantMatch];

// ─── Router (mounted at /api/starttambola/tenants in index.js) ────────────────
const router = express.Router();

// GET  /tenants/:tenantId/booking-requests?status=pending
// Lists booking requests for this tenant, optionally filtered by status.
router.get('/:tenantId/booking-requests', ...adminAuth, listRequests);

// POST /tenants/:tenantId/booking-requests/:requestId/approve
// Approves a pending request: books the ticket, copies player info.
router.post('/:tenantId/booking-requests/:requestId/approve', ...adminAuth, approveRequest);

// POST /tenants/:tenantId/booking-requests/:requestId/reject
// Rejects a pending request: releases the ticket back to 'available'.
router.post('/:tenantId/booking-requests/:requestId/reject', ...adminAuth, rejectRequest);

module.exports = router;
