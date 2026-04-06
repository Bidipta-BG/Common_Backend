const axios = require('axios');
const supabase = require('../lib/supabase');
const { getAuthUrl, getTokens, refreshAccessToken } = require('../lib/googleAuth');

const FRONTEND_URL = process.env.PHESA_FRONTEND_URL || 'http://localhost:3000';

const googleController = {
  /**
   * 1. GET /google/auth (requireAuth)
   * Initiates Google OAuth for Business Profile.
   */
  startGoogleAuth: async (req, res) => {
    try {
      const userId = req.userId;
      // Pass userId as the state parameter for secure callback identification
      const authUrl = getAuthUrl(userId);
      res.redirect(authUrl);
    } catch (error) {
      console.error('Error in startGoogleAuth:', error);
      res.redirect(`${FRONTEND_URL}/dashboard?google=error`);
    }
  },

  /**
   * 2. GET /google/callback (PUBLIC)
   * Handles the redirection from Google after user grants permission.
   */
  handleGoogleCallback: async (req, res) => {
    try {
      const { code, state: userId } = req.query;

      if (!code || !userId) {
        return res.redirect(`${FRONTEND_URL}/dashboard?google=error`);
      }

      // 1. Exchange code for tokens
      const { access_token, refresh_token, expiry_date } = await getTokens(code);

      // 2. Fetch Google Business Account
      const accountRes = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const accounts = accountRes.data.accounts;
      if (!accounts || accounts.length === 0) {
        throw new Error('No Google Business accounts found.');
      }
      const firstAccount = accounts[0];

      // 3. Fetch Location from the account
      const locationRes = await axios.get(`https://mybusinessbusinessinformation.googleapis.com/v1/${firstAccount.name}/locations?readMask=name,title,phoneNumbers,storefrontAddress,metadata`, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const locations = locationRes.data.locations;
      if (!locations || locations.length === 0) {
        throw new Error('No Google Business locations found.');
      }
      const firstLocation = locations[0];

      // 4. Extract details
      const businessData = {
        user_id: userId,
        access_token,
        refresh_token,
        token_expires_at: new Date(expiry_date).toISOString(),
        business_name: firstLocation.title,
        business_address: firstLocation.storefrontAddress 
                           ? `${firstLocation.storefrontAddress.addressLines.join(', ')}, ${firstLocation.storefrontAddress.locality}`
                           : null,
        business_phone: (firstLocation.phoneNumbers && firstLocation.phoneNumbers.primaryPhone) || null,
        google_account_id: firstAccount.name,
        google_place_id: (firstLocation.metadata && firstLocation.metadata.placeId) || null,
        updated_at: new Date().toISOString()
      };

      // 5. Upsert into database
      const { error: upsertError } = await supabase
        .from('google_business_profiles')
        .upsert(businessData, { onConflict: 'user_id' });

      if (upsertError) throw upsertError;

      res.redirect(`${FRONTEND_URL}/dashboard?google=connected`);
    } catch (error) {
      console.error('Error in handleGoogleCallback:', error);
      res.redirect(`${FRONTEND_URL}/dashboard?google=error`);
    }
  },

  /**
   * 3. GET /google/status (requireAuth)
   * Returns the connection and sync status.
   */
  getGoogleStatus: async (req, res) => {
    try {
      const userId = req.userId;

      // 1. Get GBP profile
      const { data: gbp, error: gbpError } = await supabase
        .from('google_business_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (gbpError && gbpError.code === 'PGRST116') {
        return res.status(200).json({ 
          connected: false, business_name: null, 
          last_synced_at: null, can_sync_now: false, next_sync_available_at: null 
        });
      }
      if (gbpError) throw gbpError;

      // 2. Get User Plan for sync calculation
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .single();
      
      const plan = profile?.plan || 'free';
      const lastSynced = gbp.last_synced_at ? new Date(gbp.last_synced_at) : null;
      const now = new Date();

      let can_sync_now = false;
      let next_sync_available_at = null;

      if (plan === 'pro') {
        can_sync_now = true;
      } else if (plan === 'starter') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        can_sync_now = !lastSynced || lastSynced < sevenDaysAgo;
        if (!can_sync_now) {
          next_sync_available_at = new Date(lastSynced.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        }
      } else { // free
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        can_sync_now = !lastSynced || lastSynced < thirtyDaysAgo;
        if (!can_sync_now) {
          next_sync_available_at = new Date(lastSynced.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }
      }

      res.status(200).json({
        connected: true,
        business_name: gbp.business_name,
        business_address: gbp.business_address,
        overall_rating: gbp.overall_rating,
        total_review_count: gbp.total_review_count,
        last_synced_at: gbp.last_synced_at,
        can_sync_now,
        next_sync_available_at
      });
    } catch (error) {
      console.error('Error in getGoogleStatus:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * 4. POST /google/sync (requireAuth)
   * Fetches latest reviews from Google and imports as testimonials.
   */
  syncGoogleReviews: async (req, res) => {
    try {
      const userId = req.userId;

      // 1. Get connection record
      const { data: gbp, error: gbpError } = await supabase
        .from('google_business_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (gbpError || !gbp) {
        return res.status(400).json({ error: 'google_not_connected' });
      }

      // 2. Check sync limits (same logic as status)
      // (Skipping detailed re-check here for brevity, assuming check logic applies)
      // [Implementation Detail: In real-world, sharing a utility for this is better]
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', userId).single();
      const plan = profile?.plan || 'free';
      const lastSynced = gbp.last_synced_at ? new Date(gbp.last_synced_at) : null;
      const now = new Date();
      let allowed = false;
      if (plan === 'pro') allowed = true;
      else if (plan === 'starter') allowed = !lastSynced || lastSynced < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else allowed = !lastSynced || lastSynced < new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (!allowed) {
        return res.status(403).json({ error: 'sync_limit_reached' });
      }

      // 3. Refresh token if expired
      let accessToken = gbp.access_token;
      if (new Date(gbp.token_expires_at) <= now) {
        const { access_token, expiry_date } = await refreshAccessToken(gbp.refresh_token);
        accessToken = access_token;
        await supabase
          .from('google_business_profiles')
          .update({ 
            access_token, 
            token_expires_at: new Date(expiry_date).toISOString() 
          })
          .eq('user_id', userId);
      }

      // 4. Fetch Reviews from Google (v4 API for reviews)
      // google_account_id is formatted as "accounts/{id}"
      // v4/{accountName}/{locationName}/reviews
      // Note: we need the location name which is also full path like "accounts/{id}/locations/{id}"
      // We get this during handleGoogleCallback step 3 (firstLocation.name)
      // I stored firstAccount.name as google_account_id but we need the location path.
      // Re-querying Google to find location name if not stored (stored in DB as google_location_id would be better)
      // For now, I'll fetch the location list again to get the name if I didn't store it explicitly.
      // ACTUALLY: Let's assume handleGoogleCallback stored the correct identifiers.
      const locationSearch = await axios.get(`https://mybusinessbusinessinformation.googleapis.com/v1/${gbp.google_account_id}/locations?readMask=name`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const locationName = locationSearch.data.locations[0].name;

      const reviewRes = await axios.get(`https://mybusiness.googleapis.com/v4/${locationName}/reviews`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const googleReviews = reviewRes.data.reviews || [];

      let newCount = 0;
      let duplicateCount = 0;

      // 5. Deduplicate and Insert
      const ratingMap = { 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 };

      for (const review of googleReviews) {
        if (!review.comment) continue;

        // Check for duplicates
        const { data: existing } = await supabase
          .from('testimonials')
          .select('id')
          .eq('user_id', userId)
          .eq('text_content', review.comment)
          .eq('source', 'google')
          .maybeSingle();

        if (existing) {
          duplicateCount++;
          continue;
        }

        // Insert new
        const { error: insertError } = await supabase
          .from('testimonials')
          .insert({
            user_id: userId,
            reviewer_name: review.reviewer.displayName,
            reviewer_photo_url: review.reviewer.profilePhotoUrl,
            rating: ratingMap[review.starRating] || 5,
            text_content: review.comment,
            source: 'google',
            status: 'pending',
            created_at: review.createTime // Use Google's timestamp
          });

        if (!insertError) newCount++;
      }

      // 6. Update last sync
      await supabase
        .from('google_business_profiles')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('user_id', userId);

      res.status(200).json({ synced: newCount, skipped: duplicateCount });
    } catch (error) {
      console.error('Error in syncGoogleReviews:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * 5. DELETE /google/disconnect (requireAuth)
   * Removes Google connection but keeps testimonials.
   */
  disconnectGoogle: async (req, res) => {
    try {
      const userId = req.userId;
      const { error } = await supabase
        .from('google_business_profiles')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      res.status(200).json({ success: true, message: "Google Business disconnected. Your imported reviews are kept." });
    } catch (error) {
      console.error('Error in disconnectGoogle:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = googleController;
