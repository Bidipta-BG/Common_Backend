// ─── Plan pricing constants ───────────────────────────────────────────────────
// Amounts are in the smallest currency unit (paise for INR).
// Razorpay requires amounts in paise; we store them the same way in the DB
// so there is never floating-point rounding on monetary values.
//
// Confirm these numbers before going live — adjust here and the frontend.

const PLAN_PRICES_PAISE = {
  monthly: 4600  * 100,        // ₹4,600  → 460,000 paise
  yearly:  2400  * 12 * 100,   // ₹28,800 → 2,880,000 paise  (₹2,400/mo billed annually)
};

const PLAN_CURRENCY = 'INR';

// Human-readable labels — useful for Razorpay order descriptions / receipts.
const PLAN_LABELS = {
  monthly: 'StarTambola Monthly Plan',
  yearly:  'StarTambola Annual Plan',
};

const isValidPlan = (plan) => Object.prototype.hasOwnProperty.call(PLAN_PRICES_PAISE, plan);

module.exports = { PLAN_PRICES_PAISE, PLAN_CURRENCY, PLAN_LABELS, isValidPlan };
