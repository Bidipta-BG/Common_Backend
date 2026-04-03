const axios = require('axios');
const supabase = require('../lib/supabase');
const { canDoAction } = require('../lib/plans');

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const importController = {
  searchBusiness: async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
      }

      if (!GOOGLE_PLACES_API_KEY) {
        return res.status(500).json({ error: 'Google Places API key is missing. Please configure it in .env' });
      }

      const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
        params: {
          query,
          key: GOOGLE_PLACES_API_KEY
        }
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
         console.error('Google API Error:', response.data.status);
         return res.status(500).json({ error: 'Failed to search Google Places' });
      }

      const results = (response.data.results || []).map(place => ({
        place_id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating,
        total_ratings: place.user_ratings_total
      }));

      res.status(200).json({ results });
    } catch (error) {
      console.error('Error in searchBusiness:', error);
      res.status(500).json({ error: 'Internal server error during search' });
    }
  },

  importReviews: async (req, res) => {
    try {
      const { place_id } = req.body;
      const userId = req.userId;

      if (!place_id) {
        return res.status(400).json({ error: 'place_id is required' });
      }

      if (!GOOGLE_PLACES_API_KEY) {
        return res.status(500).json({ error: 'Google Places API key is missing. Please configure it in .env' });
      }

      // 1. Fetch user profile for limits
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', userId).single();
      const currentPlan = profile?.plan || 'free';

      const { count: testimonialCount } = await supabase
        .from('testimonials')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Early bailout if at absolute limit before doing API calls
      if (!canDoAction(currentPlan, 'add_testimonial', testimonialCount || 0)) {
        return res.status(403).json({ error: 'plan_limit_reached' });
      }

      // 2. Fetch Places Details specific reviews snippet
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
        params: {
          place_id,
          fields: 'reviews,name,rating',
          key: GOOGLE_PLACES_API_KEY
        }
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
         console.error('Google API Error:', response.data.status);
         return res.status(500).json({ error: 'Failed to fetch Google Place details' });
      }

      const reviews = response.data.result?.reviews || [];

      if (reviews.length === 0) {
        return res.status(200).json({ imported: 0, skipped: 0, message: 'no_reviews' });
      }

      // 3. Fetch existing google reviews for this user to check duplicates by exact text
      const { data: existingReviews } = await supabase
        .from('testimonials')
        .select('text_content')
        .eq('user_id', userId)
        .eq('source', 'google');

      const existingTexts = new Set((existingReviews || []).map(r => r.text_content));

      let imported = 0;
      let skipped = 0;
      const toInsert = [];
      let simulatedCount = testimonialCount || 0;

      for (const review of reviews) {
        if (!review.text) {
          skipped++;
          continue;
        }

        if (existingTexts.has(review.text)) {
          skipped++;
          continue;
        }

        // Check plan limits progressively inside loop
        if (!canDoAction(currentPlan, 'add_testimonial', simulatedCount)) {
          // Stop accumulating - hit cap midway
          break;
        }

        toInsert.push({
          user_id: userId,
          form_id: null,
          reviewer_name: review.author_name,
          reviewer_photo_url: review.profile_photo_url,
          rating: review.rating,
          text_content: review.text,
          source: 'google',
          status: 'pending'
        });

        simulatedCount++;
        imported++;
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('testimonials')
          .insert(toInsert);
          
        if (insertError) {
          console.error("Bulk insert failed:", insertError);
          return res.status(500).json({ error: 'Database error storing reviews' });
        }
      }

      const resData = { imported, skipped };
      if (imported === 0 && skipped === 0) {
        resData.message = 'no_reviews';
      }

      res.status(200).json(resData);
    } catch (error) {
      console.error('Error in importReviews:', error);
      res.status(500).json({ error: 'Internal server error during import' });
    }
  }
};

module.exports = importController;