const axios = require('axios');
const supabase = require('../lib/supabase');
const { getUnifiedReviewCount } = require('../lib/reviewCount');
const { isBusinessVerified } = require('../lib/verificationCheck');

const OUTSCRAPER_API_KEY = process.env.OUTSCRAPER_API_KEY;

// Helper to check plan and lock
const checkAccess = async (userId) => {
  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', userId).single();
  const plan = profile?.plan || 'free';
  
  if (plan === 'free') {
    return { error: 'plan_upgrade_required', message: 'Competitor intelligence requires a Starter or Pro plan.' };
  }

  const verified = await isBusinessVerified(userId, supabase);
  if (!verified) {
    return { error: 'business_not_verified', message: 'Please verify your business to use competitor intelligence.', status: 403 };
  }

  const { total } = await getUnifiedReviewCount(userId, supabase);
  if (total < 100) {
    return { error: 'intelligence_locked', message: 'Reach 100 reviews to unlock competitor intelligence.' };
  }

  const limit = plan === 'pro' ? 5 : 2;
  return { plan, limit };
};

const competitorController = {
  getCompetitorSuggestions: async (req, res) => {
    try {
      const { category, city } = req.query;
      if (!category || !city) {
        return res.status(400).json({ error: 'category and city are required' });
      }

      if (OUTSCRAPER_API_KEY) {
        try {
          const query = `${category} in ${city}`;
          const response = await axios.get('https://api.outscraper.com/maps/search-v2', {
            headers: { 'X-API-KEY': OUTSCRAPER_API_KEY },
            params: {
              query: query,
              limit: 5,
              language: 'en'
            }
          });

          const results = response.data.data?.[0] || [];
          const suggestions = results.map(r => ({
            name: r.name,
            address: r.full_address || r.city || city,
            rating: r.rating || 0,
            reviews: r.reviews || 0,
            place_id: r.place_id
          }));

          return res.status(200).json({ suggestions });
        } catch (apiError) {
          console.error('Outscraper Suggestion Error:', apiError.message);
        }
      }

      // Fallback/Mock if API fails or key is missing
      const mockSuggestions = Array.from({ length: 5 }).map((_, i) => ({
        name: `Local ${category} ${i + 1}`,
        address: `${city}`,
        rating: (Math.random() * (5 - 3.5) + 3.5).toFixed(1),
        reviews: Math.floor(Math.random() * 500) + 50,
        place_id: `mock_place_${i}`
      }));
      return res.status(200).json({ suggestions: mockSuggestions });

    } catch (error) {
      console.error('Error in getCompetitorSuggestions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getCompetitors: async (req, res) => {
    try {
      const userId = req.userId;
      const access = await checkAccess(userId);
      if (access.error) {
        return res.status(403).json(access);
      }

      const { data: competitors, error } = await supabase
        .from('competitors')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: profile } = await supabase.from('profiles').select('last_competitor_sync').eq('id', userId).single();

      return res.status(200).json({ 
        competitors: competitors || [], 
        limit: access.limit,
        last_competitor_sync: profile?.last_competitor_sync || null 
      });
    } catch (error) {
      console.error('Error in getCompetitors:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  addCompetitor: async (req, res) => {
    try {
      const userId = req.userId;
      const { name, google_place_id, address, overall_rating, total_review_count } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const access = await checkAccess(userId);
      if (access.error) {
        return res.status(403).json(access);
      }

      const { count } = await supabase
        .from('competitors')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if ((count || 0) >= access.limit) {
        return res.status(403).json({ error: 'competitor_limit_reached', message: `You have reached your limit of ${access.limit} competitors for this plan.` });
      }

      const { data: competitor, error } = await supabase
        .from('competitors')
        .insert({
          user_id: userId,
          name,
          google_place_id,
          address,
          overall_rating: overall_rating || null,
          total_review_count: total_review_count || 0,
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({ competitor });
    } catch (error) {
      console.error('Error in addCompetitor:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  removeCompetitor: async (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const { data: competitor, error: fetchError } = await supabase
        .from('competitors')
        .select('user_id')
        .eq('id', id)
        .single();

      if (fetchError || !competitor) {
        return res.status(404).json({ error: 'Competitor not found' });
      }

      if (competitor.user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const { error } = await supabase
        .from('competitors')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error in removeCompetitor:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  syncAllCompetitors: async (req, res) => {
    try {
      const userId = req.userId;

      const access = await checkAccess(userId);
      if (access.error) {
        return res.status(403).json(access);
      }

      // Check 30-day lock
      const { data: profile } = await supabase.from('profiles').select('last_competitor_sync').eq('id', userId).single();
      if (profile && profile.last_competitor_sync) {
        const lastSync = new Date(profile.last_competitor_sync);
        const now = new Date();
        const diffDays = (now - lastSync) / (1000 * 60 * 60 * 24);
        if (diffDays < 30) {
          return res.status(429).json({ error: 'rate_limit', message: `Sync is locked for another ${Math.ceil(30 - diffDays)} days.` });
        }
      }

      // Get all competitors for user
      const { data: competitors, error: fetchError } = await supabase
        .from('competitors')
        .select('*')
        .eq('user_id', userId);

      if (fetchError || !competitors || competitors.length === 0) {
        return res.status(404).json({ error: 'No competitors found' });
      }

      const results = [];

      // Process each competitor
      for (const competitor of competitors) {
        let overall_rating = competitor.overall_rating;
        let total_review_count = competitor.total_review_count;
        let newReviewsCount = 0;

        const query = `${competitor.name} ${competitor.address || ''}`.trim();
        const lastFetchedAt = competitor.last_fetched_at ? new Date(competitor.last_fetched_at) : null;

        if (OUTSCRAPER_API_KEY) {
          try {
            const response = await axios.get('https://api.outscraper.com/maps/reviews-v3', {
              headers: { 'X-API-KEY': OUTSCRAPER_API_KEY },
              params: {
                query: query,
                reviewsLimit: 100,
                sort: 'newest',
                ignoreEmpty: true,
                language: 'en'
              }
            });

            const data = response.data.data?.[0];
            if (data) {
              overall_rating = data.rating;
              total_review_count = data.reviews;
              
              let reviewsToInsert = [];
              const fetchedReviews = data.reviews_data || [];
              
              for (const r of fetchedReviews) {
                const reviewDate = new Date(r.review_datetime_utc);
                // Smart Fetch: Stop if we hit a review older than or equal to our last_fetched_at
                if (lastFetchedAt && reviewDate <= lastFetchedAt) {
                  break; 
                }
                reviewsToInsert.push({
                  competitor_id: competitor.id,
                  user_id: userId,
                  platform_review_id: r.review_id,
                  reviewer_name: r.author_title,
                  rating: r.review_rating,
                  review_text: r.review_text,
                  review_date: r.review_datetime_utc
                });
              }

              if (reviewsToInsert.length > 0) {
                const { error: upsertError } = await supabase
                  .from('competitor_reviews')
                  .upsert(reviewsToInsert, { onConflict: 'platform_review_id' });
                
                if (!upsertError) {
                  newReviewsCount = reviewsToInsert.length;
                }
              }
            }
          } catch (apiError) {
            console.error(`Outscraper API Error for ${competitor.name}:`, apiError.message);
          }
        } else {
          // Mock data for testing if no API key
          overall_rating = (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1);
          total_review_count = Math.floor(Math.random() * 500) + 50;
          newReviewsCount = 5; // mock fetch count
        }

        // Update competitor stats
        await supabase
          .from('competitors')
          .update({
            overall_rating,
            total_review_count,
            last_fetched_at: new Date().toISOString()
          })
          .eq('id', competitor.id);

        results.push({ id: competitor.id, newReviewsCount, overall_rating, total_review_count });
      }

      // Update global sync timestamp
      await supabase.from('profiles').update({ last_competitor_sync: new Date().toISOString() }).eq('id', userId);

      return res.status(200).json({ success: true, results });

    } catch (error) {
      console.error('Error in syncAllCompetitors:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getCompetitorComparison: async (req, res) => {
    try {
      const userId = req.userId;

      const access = await checkAccess(userId);
      if (access.error) {
        return res.status(403).json(access);
      }

      const { data: competitors, error: compError } = await supabase
        .from('competitors')
        .select('name, overall_rating, total_review_count, last_fetched_at')
        .eq('user_id', userId);

      if (compError) throw compError;

      const { data: myBusiness } = await supabase
        .from('claimed_businesses')
        .select('business_name')
        .eq('user_id', userId)
        .single();

      let my_business = null;
      if (myBusiness) {
        // Calculate rating from imported reviews + ALL testimonials
        const { data: pReviews } = await supabase.from('platform_reviews').select('rating').eq('user_id', userId).eq('is_deleted', false);
        const { data: tReviews } = await supabase.from('testimonials').select('rating').eq('user_id', userId).eq('status', 'approved');
        
        const allRatings = [...(pReviews || []).map(r => r.rating), ...(tReviews || []).map(r => r.rating)].filter(r => typeof r === 'number');
        const totalCount = allRatings.length;
        const avgRating = totalCount > 0 ? (allRatings.reduce((a, b) => a + b, 0) / totalCount).toFixed(1) : 0;

        my_business = {
          name: myBusiness.business_name,
          overall_rating: parseFloat(avgRating),
          total_review_count: totalCount
        };
      }

      return res.status(200).json({
        my_business,
        competitors: competitors || []
      });

    } catch (error) {
      console.error('Error in getCompetitorComparison:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = competitorController;
