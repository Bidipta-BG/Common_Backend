const supabase = require('../lib/supabase');
const { sendWelcomeEmail } = require('../lib/resend');

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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = userController;
