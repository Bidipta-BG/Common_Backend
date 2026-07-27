// ─────────────────────────────────────────────────────────
// Form styles available per plan (cumulative — higher plans
// unlock everything from lower plans too).
// ─────────────────────────────────────────────────────────
const STYLE_PLAN_MAP = {
  classic:      'free',
  social:       'starter',
  video_first:  'starter',
  quick_rating: 'starter',
  brand_story:  'pro',
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
      ai_analysis_lifetime: 1,
      ai_analysis_monthly: 0,
      fetch_limit_initial: 100,
      fetch_limit_ongoing: 0,
      ai_analysis_reviews_limit: 100,
      competitor_limit: 0,
      suggestion_pool_per_star: 2,
      suggestions_shown: 1,
      suggestion_refresh: 0
    }
  },
  starter: {
    name: 'Starter',
    price: 499, // INR
    limits: {
      testimonials: 50,
      forms: 4,
      widgets: 4,
      video: false,
      screenshot: true,
      branding: false,
      ai_analysis_monthly: 1,
      fetch_limit_initial: 500,
      fetch_limit_ongoing: 150,
      ai_analysis_reviews_limit: 500,
      competitor_limit: 2,
      suggestion_pool_per_star: 4,
      suggestions_shown: 2,
      suggestion_refresh_days: 90
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
      ai_analysis_monthly: 3,
      fetch_limit_initial: 1000,
      fetch_limit_ongoing: 300,
      ai_analysis_reviews_limit: 1000,
      competitor_limit: 5,
      suggestion_pool_per_star: 6,
      suggestions_shown: 3,
      suggestion_refresh_days: 0
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
