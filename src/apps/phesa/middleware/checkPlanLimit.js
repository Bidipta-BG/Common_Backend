const supabase = require('../lib/supabase');
const { getPlanLimits, canDoAction } = require('../lib/plans');

const checkPlanLimit = (action, countFn) => {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get user plan from profiles table
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', req.userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is not found
        console.error('Error fetching user profile:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }

      const currentPlan = profile?.plan || 'free';
      
      // Call countFn to get current count if provided
      let currentCount = 0;
      if (typeof countFn === 'function') {
        currentCount = await countFn(req.userId);
      }

      // Check if user is over the limit for this action
      if (!canDoAction(currentPlan, action, currentCount)) {
        return res.status(403).json({ 
          error: 'plan_limit_reached', 
          plan: currentPlan 
        });
      }

      // If ok, call next
      next();
    } catch (error) {
      console.error('Check plan limit error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = checkPlanLimit;
