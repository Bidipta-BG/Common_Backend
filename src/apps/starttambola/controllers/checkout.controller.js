const checkoutService = require('../services/checkout.service');
const { validateBody, z } = require('../utils/validateBody');

// Zod schema reused here so the controller is self-contained for reading
const checkoutSchema = z.object({
  plan: z.string().min(1, 'plan is required'),
});

// ─── POST /tenants/:tenantId/checkout-session ─────────────────────────────────
// Creates a Razorpay order and returns the data the frontend needs to open
// Razorpay checkout.js. Protected by requireAuth + requireTenantMatch
// (applied in the route file) so only the tenant's own admin can initiate.

const createCheckoutSession = async (req, res, next) => {
  // validateBody middleware runs before this and puts the parsed body on req.body
  const { plan } = req.body;

  try {
    const orderDetails = await checkoutService.createCheckoutOrder(req.params.tenantId, plan);
    return res.status(201).json({ data: orderDetails });
  } catch (err) {
    return next(err);
  }
};

module.exports = { createCheckoutSession, checkoutSchema };
