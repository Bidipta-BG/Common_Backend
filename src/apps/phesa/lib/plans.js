// ─────────────────────────────────────────────────────────
// Form styles available per plan (cumulative — higher plans
// unlock everything from lower plans too).
// ─────────────────────────────────────────────────────────
const STYLE_PLAN_MAP = {
  classic:      'free',
  social:       'free',
  video_first:  'starter',
  quick_rating: 'starter',
  brand_story:  'starter',
  luxury:       'pro',
};

// Plan hierarchy used to compare entitlements
const PLAN_RANK = { free: 0, starter: 1, pro: 2 };

const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    limits: {
      testimonials: 10,
      forms: 1,
      widgets: 1,
      video: false,
      screenshot: false,
      branding: true,
      ai_analysis: 1,
    }
  },
  starter: {
    name: 'Starter',
    price: 499, // INR
    limits: {
      testimonials: 50,
      forms: 5,
      widgets: 3,
      video: false,
      screenshot: true,
      branding: false,
      ai_analysis: 1,
    }
  },
  pro: {
    name: 'Pro',
    price: 999, // INR
    limits: {
      testimonials: Infinity,
      forms: Infinity,
      widgets: Infinity,
      video: true,
      screenshot: true,
      branding: false,
    }
  }
};

const getPlanLimits = (planId) => {
  const plan = PLANS[planId] || PLANS.free;
  return plan.limits;
};

const canDoAction = (planId, action, currentCount = 0) => {
  const limits = getPlanLimits(planId);

  switch (action) {
    case 'add_testimonial':
      return currentCount < limits.testimonials;
    case 'add_form':
      return limits.forms === Infinity ? true : currentCount < limits.forms;
    case 'add_widget':
      return limits.widgets === Infinity ? true : currentCount < limits.widgets;
    case 'upload_video':
      return limits.video === true;
    case 'upload_screenshot':
      return limits.screenshot === true;
    default:
      return false;
  }
};

/**
 * Checks whether a given plan is allowed to use a specific form style.
 * @param {string} planId  - 'free' | 'starter' | 'pro'
 * @param {string} styleId - e.g. 'classic', 'luxury'
 * @returns {boolean}
 */
const canUseStyle = (planId, styleId) => {
  const requiredPlan = STYLE_PLAN_MAP[styleId];
  if (!requiredPlan) return false; // unknown style → reject
  const userRank    = PLAN_RANK[planId]    ?? 0;
  const requiredRank = PLAN_RANK[requiredPlan] ?? 99;
  return userRank >= requiredRank;
};

module.exports = {
  PLANS,
  STYLE_PLAN_MAP,
  PLAN_RANK,
  getPlanLimits,
  canDoAction,
  canUseStyle,
};
