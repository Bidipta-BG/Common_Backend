const supabase = require('../lib/supabase');

const businessProfileController = {
  /**
   * PATCH /
   * Updates the business profile fields in the profiles table.
   */
  updateBusinessProfile: async (req, res) => {
    try {
      const userId = req.userId;
      const {
        business_name,
        business_logo_url,
        business_address,
        business_phone,
        business_website,
        business_tagline
      } = req.body;

      // Build safe updates object (only truthy/defined values)
      const updates = {};
      if (business_name !== undefined) updates.business_name = business_name;
      if (business_logo_url !== undefined) updates.business_logo_url = business_logo_url;
      if (business_address !== undefined) updates.business_address = business_address;
      if (business_phone !== undefined) updates.business_phone = business_phone;
      if (business_website !== undefined) updates.business_website = business_website;
      if (business_tagline !== undefined) updates.business_tagline = business_tagline;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided to update.' });
      }

      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      res.status(200).json({ profile: updatedProfile });
    } catch (error) {
      console.error('Error in updateBusinessProfile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * GET /status
   * Calculates business profile completeness and returns status.
   */
  getBusinessProfileStatus: async (req, res) => {
    try {
      const userId = req.userId;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('business_name, business_logo_url, business_address, business_phone, business_website, business_tagline')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const fields = [
        'business_name',
        'business_logo_url',
        'business_address',
        'business_phone',
        'business_website',
        'business_tagline'
      ];

      const missing_fields = fields.filter(field => !profile[field]);
      const filledCount = fields.length - missing_fields.length;
      const completeness_percent = Math.round((filledCount / fields.length) * 100);

      // Business is considered complete if name AND logo are present
      const is_complete = !!(profile.business_name && profile.business_logo_url);

      res.status(200).json({
        is_complete,
        missing_fields,
        completeness_percent,
        profile
      });
    } catch (error) {
      console.error('Error in getBusinessProfileStatus:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = businessProfileController;
