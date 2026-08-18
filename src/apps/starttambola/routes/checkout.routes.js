const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireTenantMatch } = require('../middleware/auth');
const { validateBody } = require('../utils/validateBody');
const { createCheckoutSession, checkoutSchema } = require('../controllers/checkout.controller');

const router = express.Router();

// ─── POST /tenants/:tenantId/checkout-session ─────────────────────────────────
// Requires requireAuth (valid Supabase JWT) + requireTenantMatch (caller can
// only create an order for their own tenant). Validates body with Zod.
//
// Body: { plan: 'monthly' | 'yearly' }
// Returns: Razorpay order details the frontend passes to checkout.js
router.post(
  '/:tenantId/checkout-session',
  requireAuth,
  requireTenantMatch,
  validateBody(checkoutSchema),
  createCheckoutSession
);

module.exports = router;
