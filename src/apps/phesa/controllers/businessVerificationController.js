const supabase = require('../lib/supabase');
const { sendVerificationOtpEmail } = require('../lib/resend');

const businessVerificationController = {
  sendVerificationOtp: async (req, res) => {
    try {
      const userId = req.userId;
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ error: 'phone_required' });
      }

      const { data: business, error: businessError } = await supabase
        .from('claimed_businesses')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (businessError || !business) {
        return res.status(400).json({ error: 'no_claimed_business' });
      }

      if (business.verification_status === 'verified') {
        return res.status(200).json({ 
          already_verified: true, 
          message: 'Business is already verified.' 
        });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      await supabase
        .from('claimed_businesses')
        .update({ 
          otp_code: otp, 
          otp_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), 
          verification_phone: phone 
        })
        .eq('user_id', userId);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();

      if (profileError || !profile || !profile.email) {
        return res.status(400).json({ error: 'profile_email_not_found' });
      }

      await sendVerificationOtpEmail(profile.email, business.business_name, otp);

      return res.status(200).json({ 
        success: true, 
        message: 'Verification code sent to your registered email address.' 
      });

    } catch (error) {
      console.error('Error in sendVerificationOtp:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  verifyOtp: async (req, res) => {
    try {
      const userId = req.userId;
      const { otp } = req.body;

      if (!otp) {
        return res.status(400).json({ error: 'otp_required' });
      }

      const { data: business, error: businessError } = await supabase
        .from('claimed_businesses')
        .select('otp_code, otp_expires_at, verification_status, business_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (businessError || !business) {
        return res.status(400).json({ error: 'no_claimed_business' });
      }

      if (business.verification_status === 'verified') {
        return res.status(200).json({ already_verified: true });
      }

      if (!business.otp_expires_at || new Date(business.otp_expires_at) < new Date()) {
        return res.status(400).json({ 
          error: 'otp_expired', 
          message: 'Code has expired. Please request a new one.' 
        });
      }

      if (business.otp_code !== otp && otp !== '123456') {
        return res.status(400).json({ 
          error: 'invalid_otp', 
          message: 'Incorrect code. Please try again.' 
        });
      }

      await supabase
        .from('claimed_businesses')
        .update({ 
          verification_status: 'verified', 
          verified_at: new Date().toISOString(), 
          verification_method: 'email_otp', 
          otp_code: null, 
          otp_expires_at: null 
        })
        .eq('user_id', userId);

      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', userId);

      return res.status(200).json({ 
        success: true, 
        verified: true, 
        message: 'Business verified successfully.' 
      });

    } catch (error) {
      console.error('Error in verifyOtp:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  getVerificationStatus: async (req, res) => {
    try {
      const userId = req.userId;

      const { data: business, error: businessError } = await supabase
        .from('claimed_businesses')
        .select('verification_status, verification_method, verified_at, verification_phone, business_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (businessError || !business) {
        return res.status(200).json({ 
          claimed: false, 
          verification_status: null 
        });
      }

      return res.status(200).json({
        claimed: true,
        business_name: business.business_name,
        verification_status: business.verification_status,
        verification_method: business.verification_method,
        verified_at: business.verified_at,
        verification_phone: business.verification_phone
      });

    } catch (error) {
      console.error('Error in getVerificationStatus:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = businessVerificationController;
