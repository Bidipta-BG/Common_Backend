const supabase = require('../lib/supabase');
const { sendWelcomeEmail } = require('../lib/resend');
const { getUnifiedReviewCount } = require('../lib/reviewCount');

const userController = {
  // POST /welcome
  welcome: async (req, res) => {
    try {
      const { email, fullName } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      await sendWelcomeEmail(email, fullName);

      return res.status(200).json({ success: true, message: 'Welcome email sent successfully' });
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  // GET /profile
  getProfile: async (req, res) => {
    try {
      const userId = req.userId;
      
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      const { data: claimedBusiness } = await supabase
        .from('claimed_businesses')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const { data: googleProfile } = await supabase
        .from('google_business_profiles')
        .select('business_name, last_synced_at')
        .eq('user_id', userId)
        .maybeSingle();

      const { data: platformConnections } = await supabase
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId);

      const { total } = await getUnifiedReviewCount(userId, supabase);

      res.status(200).json({
        profile,
        claimed_business: claimedBusiness || null,
        google_connected: !!googleProfile,
        google_business_name: googleProfile?.business_name || null,
        google_last_synced_at: googleProfile?.last_synced_at || null,
        platform_connections: platformConnections || [],
        review_progress: {
          collected: total,
          required: 100,
          percent: Math.min(100, Math.round((total / 100) * 100))
        },
        intelligence_unlocked: total >= 100
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = userController;
