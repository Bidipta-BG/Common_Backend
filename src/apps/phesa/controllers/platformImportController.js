const supabase = require('../lib/supabase');
const { getPlanLimits } = require('../lib/plans');

const getClaimedBusiness = async (req, res) => {
  try {
    const userId = req.userId;

    // 1. Query claimed_businesses where user_id = req.userId
    const { data: business, error } = await supabase
      .from('claimed_businesses')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching claimed business:', error);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (business) {
      if (!business.verification_phone || business.verification_phone === '+919876543210') {
        let realPhone = null;
        const searchQuery = business.business_address ? `${business.business_name} ${business.business_address}` : business.business_name;
        
        if (process.env.OUTSCRAPER_API_KEY) {
          try {
            const url = new URL('https://api.app.outscraper.com/maps/search-v3');
            url.searchParams.append('query', searchQuery);
            url.searchParams.append('limit', '1');
            url.searchParams.append('language', 'en');
            const resp = await fetch(url.toString(), { headers: { 'X-API-KEY': process.env.OUTSCRAPER_API_KEY } });
            if (resp.ok) {
              const d = await resp.json();
              if (d.data && Array.isArray(d.data) && d.data.length > 0) {
                const item = Array.isArray(d.data[0]) ? d.data[0] : d.data;
                realPhone = item.phone || item.phone_number || item.formatted_phone_number || item.international_phone_number || item.contact_phone || null;
              }
            }
          } catch (err) {
            console.error('Outscraper phone enrichment error:', err);
          }
        }

        if (!realPhone && process.env.GOOGLE_PLACES_API_KEY) {
          try {
            const googleUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
            googleUrl.searchParams.append('query', searchQuery);
            googleUrl.searchParams.append('key', process.env.GOOGLE_PLACES_API_KEY);
            const googleResp = await fetch(googleUrl.toString());
            if (googleResp.ok) {
              const googleData = await googleResp.json();
              if (googleData.results && googleData.results.length > 0 && googleData.results[0].place_id) {
                const placeId = googleData.results[0].place_id;
                const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number&key=${process.env.GOOGLE_PLACES_API_KEY}`;
                const detailsResp = await fetch(detailsUrl);
                if (detailsResp.ok) {
                  const detailsData = await detailsResp.json();
                  if (detailsData.result && detailsData.result.formatted_phone_number) {
                    realPhone = detailsData.result.formatted_phone_number;
                  }
                }
              }
            }
          } catch (err) {
            console.error('Google phone enrichment error:', err);
          }
        }

        if (realPhone) {
          business.verification_phone = realPhone;
          await supabase.from('claimed_businesses').update({ verification_phone: realPhone }).eq('user_id', userId);
        }
      }

      return res.status(200).json({ claimed: true, business });
    } else {
      return res.status(200).json({ claimed: false, business: null });
    }
  } catch (error) {
    console.error('Error in getClaimedBusiness:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const confirmBusiness = async (req, res) => {
  try {
    const userId = req.userId;
    const { business_name, business_address, overall_rating, total_review_count, business_phone, place_id } = req.body;

    if (!business_name) {
      return res.status(400).json({ error: "business_name is required" });
    }

    // 1. Check if user already has a claimed business
    const { data: existing, error: existingError } = await supabase
      .from('claimed_businesses')
      .select('business_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing claimed business:', existingError);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (existing) {
      return res.status(400).json({
        error: "business_already_claimed",
        message: "You have already linked a business to your account.",
        business_name: existing.business_name
      });
    }

    // 2. Generate a normalized business_identifier from business_name + city
    let city = '';
    if (business_address) {
      // Best-effort city extraction from comma-separated address
      const parts = business_address.split(',').map(p => p.trim());
      if (parts.length >= 3) {
        city = parts[parts.length - 2];
      } else if (parts.length === 2) {
        city = parts[1];
      } else {
        city = business_address;
      }
    }

    const rawIdentifier = `${business_name}_${city}`;
    // Normalize: lowercase, remove all non-alphanumeric characters (keep underscore)
    const normalizedIdentifier = rawIdentifier.toLowerCase().replace(/[^a-z0-9_]/g, '');

    // 3. Check cross-account deduplication
    const { data: duplicate, error: duplicateError } = await supabase
      .from('claimed_businesses')
      .select('user_id')
      .eq('business_identifier', normalizedIdentifier)
      .maybeSingle();

    if (duplicateError) {
      console.error('Error checking duplicate business:', duplicateError);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (duplicate && duplicate.user_id !== userId) {
      return res.status(409).json({
        error: "business_already_linked_to_another_account",
        message: "This business is already linked to another 5starrating.in account. If you believe this is an error, please contact support."
      });
    }

    let finalPhone = business_phone || null;
    const searchQuery = business_address ? `${business_name} ${business_address}` : business_name;

    if (!finalPhone && process.env.OUTSCRAPER_API_KEY) {
      try {
        const url = new URL('https://api.app.outscraper.com/maps/search-v3');
        url.searchParams.append('query', place_id || searchQuery);
        url.searchParams.append('limit', '1');
        url.searchParams.append('language', 'en');
        const resp = await fetch(url.toString(), { headers: { 'X-API-KEY': process.env.OUTSCRAPER_API_KEY } });
        if (resp.ok) {
          const d = await resp.json();
          if (d.data && Array.isArray(d.data) && d.data.length > 0) {
            const item = Array.isArray(d.data[0]) ? d.data[0] : d.data;
            finalPhone = item.phone || item.phone_number || item.formatted_phone_number || item.international_phone_number || item.contact_phone || null;
          }
        }
      } catch (err) {
        console.error('Outscraper confirmBusiness phone enrichment error:', err);
      }
    }

    if (!finalPhone && place_id && process.env.GOOGLE_PLACES_API_KEY) {
      try {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=formatted_phone_number&key=${process.env.GOOGLE_PLACES_API_KEY}`;
        const detailsResp = await fetch(detailsUrl);
        if (detailsResp.ok) {
          const detailsData = await detailsResp.json();
          if (detailsData.result && detailsData.result.formatted_phone_number) {
            finalPhone = detailsData.result.formatted_phone_number;
          }
        }
      } catch (err) {
        console.error('Error fetching place details for phone:', err);
      }
    }
    if (!finalPhone) {
      finalPhone = '+919876543210';
    }

    // 4. Insert into claimed_businesses
    const insertData = {
      user_id: userId,
      business_name,
      business_identifier: normalizedIdentifier,
      business_address: business_address || null,
      overall_rating: overall_rating || null,
      total_review_count: total_review_count || 0,
      verification_phone: finalPhone,
      platforms_fetched: []
    };

    const { data: inserted, error: insertError } = await supabase
      .from('claimed_businesses')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting claimed business:', insertError);
      return res.status(500).json({ error: "Failed to save business" });
    }

    // 5. Return 201
    return res.status(201).json({
      message: "Business confirmed. Please verify your business to unlock all intelligence features.",
      business: inserted,
      verification_required: true
    });

  } catch (error) {
    console.error('Error in confirmBusiness:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const searchBusiness = async (req, res) => {
  try {
    const { query, city } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    const searchQuery = city ? `${query} ${city}` : query;
    let items = [];

    // 1. Try Outscraper first if key exists
    if (process.env.OUTSCRAPER_API_KEY) {
      const url = new URL('https://api.app.outscraper.com/maps/search-v3');
      url.searchParams.append('query', searchQuery);
      url.searchParams.append('limit', '5');
      url.searchParams.append('language', 'en');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-API-KEY': process.env.OUTSCRAPER_API_KEY
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          items = Array.isArray(data.data[0]) ? data.data[0] : data.data;
        }
      } else {
        console.error('Outscraper API Error:', await response.text());
      }
    }

    // 2. Fallback to Google Places Text Search if Outscraper failed or key is missing
    if ((!items || items.length === 0) && process.env.GOOGLE_PLACES_API_KEY) {
      const googleUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
      googleUrl.searchParams.append('query', searchQuery);
      googleUrl.searchParams.append('key', process.env.GOOGLE_PLACES_API_KEY);
      
      try {
        const googleResponse = await fetch(googleUrl.toString());
        if (googleResponse.ok) {
          const googleData = await googleResponse.json();
          
          // Google API returns 200 even for errors like REQUEST_DENIED
          if (googleData.status !== 'OK' && googleData.status !== 'ZERO_RESULTS') {
            console.error('Google Places API Error:', googleData.status, googleData.error_message);
          }
          
          if (googleData.results && googleData.results.length > 0) {
            // Map to Outscraper-like format so downstream mapping works smoothly
            items = googleData.results.map(r => ({
              place_id: r.place_id,
              name: r.name,
              full_address: r.formatted_address,
              rating: r.rating,
              reviews: r.user_ratings_total
            }));
          }
        } else {
          console.error('Google Places API Error (HTTP Status):', await googleResponse.text());
        }
      } catch (err) {
        console.error('Google Places API Network Error:', err);
      }
    }

    if (!items || items.length === 0) {
      return res.status(200).json({ results: [], message: "No businesses found" });
    }

    const mappedResults = items.map(item => ({
      place_id: item.place_id || item.id,
      name: item.name || item.title,
      address: item.full_address || item.address,
      phone: item.phone || item.phone_number || item.formatted_phone_number || item.international_phone_number || item.contact_phone || '',
      rating: item.rating,
      total_ratings: item.reviews || item.total_ratings || item.reviews_data || 0
    }));

    return res.status(200).json({ results: mappedResults });
  } catch (error) {
    console.error('Error in searchBusiness:', error);
    return res.status(200).json({ results: [], message: "No businesses found" });
  }
};

const getPlatformStatus = async (req, res) => {
  try {
    const userId = req.userId;

    // 1. Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, platform_fetch_used_lifetime, platform_fetch_used_this_month, platform_fetch_reset_at')
      .eq('id', userId)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // 2. Get claimed business
    const { data: claimedBusiness } = await supabase
      .from('claimed_businesses')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // 3. Get platform connections
    const { data: platformConnections } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId);

    // 4. Get fetch history (last 5)
    const { data: fetchHistory } = await supabase
      .from('platform_fetch_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // 5. Get count of platform_reviews per platform
    const { data: reviewsData } = await supabase
      .from('platform_reviews')
      .select('platform')
      .eq('user_id', userId)
      .eq('is_deleted', false);

    const reviewCounts = {};
    if (reviewsData) {
      for (const row of reviewsData) {
        reviewCounts[row.platform] = (reviewCounts[row.platform] || 0) + 1;
      }
    }

    // 6. Get this month's fetch history to count platform fetches
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    const { data: monthFetchHistory } = await supabase
      .from('platform_fetch_history')
      .select('platforms_selected')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('created_at', currentMonthStart);

    const platformFetchCounts = {};
    if (monthFetchHistory) {
      monthFetchHistory.forEach(history => {
        if (history.platforms_selected) {
          history.platforms_selected.forEach(p => {
            platformFetchCounts[p] = (platformFetchCounts[p] || 0) + 1;
          });
        }
      });
    }

    // Free users track lifetime fetches instead of this month.
    const allTimeUniquePlatforms = platformConnections ? platformConnections.map(c => c.platform) : [];
    const thisMonthUniquePlatforms = Object.keys(platformFetchCounts);

    // 7. Determine fetch limits based on plan
    const planStr = String(profile.plan || 'free').toLowerCase();
    let allowedPlatformsCount = 1;
    let allowedFetchesPerPlatform = 1;
    let usedPlatformsCount = 0;

    if (planStr === 'free') {
      allowedPlatformsCount = 1;
      allowedFetchesPerPlatform = 1;
      // Free plan uses lifetime count of unique platforms connected
      usedPlatformsCount = allTimeUniquePlatforms.length;
      // Also, for free plan, we should set platformFetchCounts to 1 for any platform ever fetched
      allTimeUniquePlatforms.forEach(p => {
        platformFetchCounts[p] = Math.max(platformFetchCounts[p] || 0, 1);
      });
    } else if (planStr === '499' || planStr === 'starter') {
      allowedPlatformsCount = 3;
      allowedFetchesPerPlatform = 1;
      usedPlatformsCount = thisMonthUniquePlatforms.length;
    } else if (planStr === '999' || planStr === 'pro') {
      allowedPlatformsCount = 999; // unlimited
      allowedFetchesPerPlatform = 3;
      usedPlatformsCount = thisMonthUniquePlatforms.length;
    }

    // 8. Return response
    return res.status(200).json({
      plan: planStr,
      allowed_platforms_count: allowedPlatformsCount,
      allowed_fetches_per_platform: allowedFetchesPerPlatform,
      used_platforms_count: usedPlatformsCount,
      platform_fetch_counts: platformFetchCounts,
      // Legacy fields
      fetch_limit: allowedPlatformsCount,
      fetch_used: usedPlatformsCount,
      fetch_remaining: Math.max(0, allowedPlatformsCount - usedPlatformsCount),
      claimed_business: claimedBusiness || null,
      platform_connections: platformConnections || [],
      review_counts_by_platform: reviewCounts,
      fetch_history: fetchHistory || []
    });

  } catch (error) {
    console.error('Error in getPlatformStatus:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const fetchPlatformReviews = async (req, res) => {
  try {
    const userId = req.userId;
    const { platforms, platform_urls } = req.body;

    // 1. Validate
    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({ error: "Select at least one platform" });
    }

    // 2. Get user plan
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(500).json({ error: "Failed to fetch user profile" });
    }

    // 3. Determine Limits
    const planStr = String(profile.plan || 'free').toLowerCase();
    let allowedPlatformsCount = 1;
    let allowedFetchesPerPlatform = 1;

    if (planStr === 'free') {
      allowedPlatformsCount = 1;
      allowedFetchesPerPlatform = 1;
    } else if (planStr === '499' || planStr === 'starter') {
      allowedPlatformsCount = 3;
      allowedFetchesPerPlatform = 1;
    } else if (planStr === '999' || planStr === 'pro') {
      allowedPlatformsCount = 999;
      allowedFetchesPerPlatform = 3;
    }

    // 4. Calculate usage
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    const { data: monthFetchHistory } = await supabase
      .from('platform_fetch_history')
      .select('platforms_selected')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('created_at', currentMonthStart);

    const platformFetchCounts = {};
    if (monthFetchHistory) {
      monthFetchHistory.forEach(history => {
        if (history.platforms_selected) {
          history.platforms_selected.forEach(p => {
            platformFetchCounts[p] = (platformFetchCounts[p] || 0) + 1;
          });
        }
      });
    }

    const { data: platformConnections } = await supabase
      .from('platform_connections')
      .select('platform')
      .eq('user_id', userId);

    const allTimeUniquePlatforms = platformConnections ? platformConnections.map(c => c.platform) : [];
    const thisMonthUniquePlatforms = Object.keys(platformFetchCounts);

    let usedPlatformsCount = planStr === 'free' ? allTimeUniquePlatforms.length : thisMonthUniquePlatforms.length;
    
    if (planStr === 'free') {
      allTimeUniquePlatforms.forEach(p => {
        platformFetchCounts[p] = Math.max(platformFetchCounts[p] || 0, 1);
      });
    }

    // 5. Check limits
    // Since users can fetch multiple at once, we need a hypothetical count
    let projectedUsedCount = usedPlatformsCount;
    for (const p of platforms) {
      const isNewPlatform = (planStr === 'free') ? !allTimeUniquePlatforms.includes(p) : !thisMonthUniquePlatforms.includes(p);
      
      if (isNewPlatform) projectedUsedCount++;

      if (projectedUsedCount > allowedPlatformsCount) {
        return res.status(403).json({ error: "fetch_limit_reached", message: "Platform connection limit reached. Please upgrade your plan." });
      }

      if ((platformFetchCounts[p] || 0) >= allowedFetchesPerPlatform) {
        return res.status(403).json({ error: "fetch_limit_reached", message: `Limit reached for ${p} fetches.` });
      }
    }

    // 6. Check claimed business
    const { data: claimedBusiness } = await supabase
      .from('claimed_businesses')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!claimedBusiness) {
      return res.status(400).json({
        error: "no_claimed_business",
        message: "Please search and confirm your business before fetching reviews."
      });
    }

    // 8. Create fetch batch record
    const { data: fetchRecord, error: fetchRecordError } = await supabase
      .from('platform_fetch_history')
      .insert({ user_id: userId, platforms_selected: platforms, status: 'processing' })
      .select('id')
      .single();

    if (fetchRecordError) {
      console.error('Error creating fetch record:', fetchRecordError);
      return res.status(500).json({ error: "Failed to initialize fetch batch" });
    }
    const batchId = fetchRecord.id;

    // 9. Fetch reviews
    const perPlatform = {};
    let totalNew = 0;
    let totalDuplicate = 0;

    for (const platform of platforms) {
      perPlatform[platform] = { new: 0, duplicate: 0, error: null };
      let rawReviews = [];
      
      try {
        if (platform === 'google') {
          if (process.env.OUTSCRAPER_API_KEY) {
            const url = new URL('https://api.app.outscraper.com/maps/reviews-v3');
            const searchQuery = claimedBusiness.business_address ? `${claimedBusiness.business_name}, ${claimedBusiness.business_address}` : claimedBusiness.business_name;
            url.searchParams.append('query', searchQuery);
            
            const planLimits = getPlanLimits(planStr);
            let fetchLimit = planLimits.fetch_limit_initial || 100;
            if (claimedBusiness.last_google_fetch && planLimits.fetch_limit_ongoing) {
              fetchLimit = planLimits.fetch_limit_ongoing;
            }
            url.searchParams.append('reviewsLimit', fetchLimit.toString());
            
            if (claimedBusiness.last_google_fetch) {
              // Outscraper cutoff parameter format is unix timestamp
              const cutoffUnix = Math.floor(new Date(claimedBusiness.last_google_fetch).getTime() / 1000);
              url.searchParams.append('cutoff', cutoffUnix.toString());
            }

            url.searchParams.append('sort', 'newest');
            url.searchParams.append('ignoreEmpty', 'true'); // Skips reviews without text
            url.searchParams.append('async', 'false');
            const resp = await fetch(url.toString(), { headers: { 'X-API-KEY': process.env.OUTSCRAPER_API_KEY } });
            
            if (resp.ok) {
              const d = await resp.json();
              let reviewsArray = [];
              if (d.data && d.data.length > 0) {
                if (d.data[0].reviews_data) {
                  reviewsArray = d.data[0].reviews_data;
                } else if (Array.isArray(d.data[0]) && d.data[0][0] && d.data[0][0].reviews_data) {
                  reviewsArray = d.data[0][0].reviews_data;
                }
              }
              
              rawReviews = reviewsArray.map(r => ({
                platform_review_id: r.review_id || Math.random().toString(36).substr(2, 9),
                reviewer_name: r.author_title || r.author_name || 'Anonymous',
                reviewer_photo_url: r.author_image || null,
                rating: r.review_rating || r.rating || 5,
                review_text: r.review_text || r.text || '',
                review_date: new Date(r.review_datetime_utc || r.review_timestamp * 1000 || new Date()).toISOString(),
                platform_url: r.review_link || ''
              }));
            } else {
              console.error('Google Outscraper API failed:', await resp.text());
            }
          }

          // Fallback to Google Places API Details if Outscraper failed or returned 0 reviews
          if (rawReviews.length === 0 && process.env.GOOGLE_PLACES_API_KEY && claimedBusiness.place_id) {
            console.log('[DEBUG] Outscraper yielded 0 reviews, falling back to Google Places Details API for place_id:', claimedBusiness.place_id);
            const googleDetailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
            googleDetailsUrl.searchParams.append('place_id', claimedBusiness.place_id);
            googleDetailsUrl.searchParams.append('fields', 'reviews,name,rating');
            googleDetailsUrl.searchParams.append('key', process.env.GOOGLE_PLACES_API_KEY);

            const googleResp = await fetch(googleDetailsUrl.toString());
            if (googleResp.ok) {
              const googleData = await googleResp.json();
              if (googleData.result && googleData.result.reviews) {
                rawReviews = googleData.result.reviews.map(r => ({
                  platform_review_id: Math.random().toString(36).substr(2, 9),
                  reviewer_name: r.author_name || 'Anonymous',
                  reviewer_photo_url: r.profile_photo_url || null,
                  rating: r.rating || 5,
                  review_text: r.text || '',
                  review_date: new Date(r.time ? r.time * 1000 : new Date()).toISOString(),
                  platform_url: r.author_url || ''
                }));
                console.log(`[DEBUG] Google Places Fallback successfully fetched ${rawReviews.length} reviews.`);
              }
            } else {
              console.error('Google Places Details API failed:', await googleResp.text());
            }
          }

          if (rawReviews.length === 0) {
            throw new Error('No reviews found via Outscraper or Google Places API');
          }

        } else {
          // Apify
          const actors = {
            trustpilot: "apify/trustpilot-scraper",
            justdial: "apify/justdial-scraper",
            zomato: "easyapi/zomato-restaurant-reviews-scraper",
            facebook: "apify/facebook-reviews-scraper",
            yelp: "apify/yelp-scraper",
            tripadvisor: "apify/tripadvisor-scraper",
            play_store: "apify/google-play-scraper",
            app_store: "apify/app-store-scraper"
          };
          
          const actorId = actors[platform];
          if (actorId) {
            const apifyUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`;
            
            const providedUrl = (platform_urls && platform_urls[platform]) || '';
            let payload = {};

            if (platform === 'zomato') {
              payload = providedUrl 
                ? { restaurantUrls: [providedUrl], maxReviewsPerRestaurant: 300 }
                : { search: claimedBusiness.business_name };
            } else {
              payload = providedUrl 
                ? { startUrls: [{ url: providedUrl }], maxReviews: 300, maxItems: 300 }
                : { search: claimedBusiness.business_name, maxReviews: 300, maxItems: 300 };
            }

            const apifyResp = await fetch(apifyUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });
            
            if (apifyResp.ok) {
              const apifyData = await apifyResp.json();
              console.log(`[DEBUG] Apify ${platform} Response Length/Type:`, Array.isArray(apifyData) ? apifyData.length : typeof apifyData);

              rawReviews = (Array.isArray(apifyData) ? apifyData : []).map(r => {
                let parsedRating = 5;
                if (r.ratingV2 && !isNaN(r.ratingV2)) {
                  parsedRating = Number(r.ratingV2);
                } else if (typeof r.rating === 'number') {
                  parsedRating = r.rating;
                } else if (typeof r.rating === 'string' && !isNaN(r.rating)) {
                  parsedRating = Number(r.rating);
                } else if (r.score && !isNaN(r.score)) {
                  parsedRating = Number(r.score);
                }

                return {
                  platform_review_id: r.id || r.reviewId || Math.random().toString(36).substr(2, 9),
                  reviewer_name: r.userName || r.author || r.name || 'Anonymous',
                  reviewer_photo_url: r.userProfilePic || r.avatar || r.userImage || null,
                  rating: parsedRating,
                  review_text: r.reviewText || r.text || r.content || '',
                  review_date: new Date(r.timestamp || r.date || r.createdAt || new Date()).toISOString(),
                  platform_url: r.reviewUrl || r.url || ''
                };
              });
            } else {
              const errBody = await apifyResp.text();
              console.error(`Apify ${platform} API failed with status ${apifyResp.status}. Body:`, errBody);
              throw new Error(`Apify ${platform} API failed: ${apifyResp.status}`);
            }
          } else {
            throw new Error(`Unknown platform: ${platform}`);
          }
        }
        
        // 10. Upsert into platform_reviews
        if (rawReviews.length > 0) {
          const inserts = rawReviews.map(r => ({
            user_id: userId,
            platform,
            platform_review_id: String(r.platform_review_id),
            reviewer_name: r.reviewer_name,
            reviewer_photo_url: r.reviewer_photo_url,
            rating: r.rating,
            review_text: r.review_text,
            review_date: r.review_date,
            platform_url: r.platform_url
          }));
          
          const { data: upsertedData, error: upsertError } = await supabase
            .from('platform_reviews')
            .upsert(inserts, { onConflict: 'user_id, platform, platform_review_id', ignoreDuplicates: true })
            .select('platform_review_id');
            
          if (upsertError) throw upsertError;
          
          const newCount = upsertedData ? upsertedData.length : rawReviews.length;
          const dupeCount = rawReviews.length - newCount;
          
          perPlatform[platform].new = newCount;
          perPlatform[platform].duplicate = dupeCount;
          totalNew += newCount;
          totalDuplicate += dupeCount;
          
          // 11. Update platform_connections
          const { data: existingConn } = await supabase
            .from('platform_connections')
            .select('total_reviews_fetched')
            .eq('user_id', userId)
            .eq('platform', platform)
            .maybeSingle();
            
          const currentTotal = existingConn ? (existingConn.total_reviews_fetched || 0) : 0;
          
          if (platform === 'google' && rawReviews.length > 0) {
            await supabase.from('claimed_businesses').update({ last_google_fetch: new Date().toISOString() }).eq('user_id', userId);
          }

          await supabase.from('platform_connections').upsert({
            user_id: userId,
            platform,
            locked: planStr === 'free',
            last_fetched_at: new Date().toISOString(),
            total_reviews_fetched: currentTotal + newCount
          }, { onConflict: 'user_id, platform' });
        }
        
      } catch (err) {
        console.error(`Error fetching ${platform}:`, err);
        perPlatform[platform].error = err.message;
      }
    }

    // 12. Update platform_fetch_history
    await supabase.from('platform_fetch_history').update({
      status: 'completed',
      total_fetched: totalNew + totalDuplicate,
      total_new: totalNew,
      total_duplicate: totalDuplicate,
      completed_at: new Date().toISOString()
    }).eq('id', batchId);

    // 13. Update profiles fetch counters and claimed_businesses
    const currentMonthUsed = profile.platform_fetch_used_this_month || 0;
    const currentLifetimeUsed = profile.platform_fetch_used_lifetime || 0;
    await supabase.from('profiles').update({
      platform_fetch_used_this_month: currentMonthUsed + 1,
      platform_fetch_used_lifetime: currentLifetimeUsed + 1
    }).eq('id', userId);

    const prevFetched = claimedBusiness.platforms_fetched || [];
    const newFetched = Array.from(new Set([...prevFetched, ...platforms]));
    await supabase.from('claimed_businesses').update({
      platforms_fetched: newFetched
    }).eq('user_id', userId);

    // 14. Return
    return res.status(200).json({
      fetch_id: batchId,
      status: "completed",
      platforms_fetched: platforms,
      total_new: totalNew,
      total_duplicate: totalDuplicate,
      per_platform: perPlatform
    });

  } catch (error) {
    console.error('Error in fetchPlatformReviews:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getStagedReviews = async (req, res) => {
  try {
    const userId = req.userId;
    const { platform, pushed, page = 1, limit = 20, rating } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    // 1 & 2 & 3. Build query for reviews
    let query = supabase
      .from('platform_reviews')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('review_date', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (platform && platform !== 'all') {
      query = query.eq('platform', platform);
    }
    if (rating && rating !== 'all') {
      query = query.eq('rating', parseInt(rating, 10));
    }
    if (pushed === 'true') {
      query = query.eq('pushed_to_testimonials', true);
    } else if (pushed === 'false') {
      query = query.eq('pushed_to_testimonials', false);
    }

    const { data: reviews, count, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching staged reviews:', fetchError);
      return res.status(500).json({ error: "Failed to fetch reviews" });
    }

    // 4. Get count summary grouped by platform
    const { data: allUserReviews, error: summaryError } = await supabase
      .from('platform_reviews')
      .select('platform, pushed_to_testimonials')
      .eq('user_id', userId)
      .eq('is_deleted', false);

    const platform_summary = {};
    if (allUserReviews && !summaryError) {
      allUserReviews.forEach(r => {
        if (!platform_summary[r.platform]) {
          platform_summary[r.platform] = { total: 0, pushed: 0 };
        }
        platform_summary[r.platform].total += 1;
        if (r.pushed_to_testimonials) {
          platform_summary[r.platform].pushed += 1;
        }
      });
    }

    // 5. Return
    return res.status(200).json({
      reviews: reviews || [],
      platform_summary,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0
      }
    });

  } catch (error) {
    console.error('Error in getStagedReviews:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const deleteStagedReview = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    // 1. Query platform_reviews
    const { data: review, error: findError } = await supabase
      .from('platform_reviews')
      .select('pushed_to_testimonials')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (findError || !review) {
      return res.status(404).json({ error: "Review not found" });
    }

    // 2. Check pushed_to_testimonials
    if (review.pushed_to_testimonials) {
      return res.status(400).json({
        error: "cannot_delete_pushed_review",
        message: "This review has already been added to your testimonials."
      });
    }

    // 3. Soft-delete
    const { error: updateError } = await supabase
      .from('platform_reviews')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error soft-deleting review:', updateError);
      return res.status(500).json({ error: "Failed to delete review" });
    }

    // 4. Return success
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error in deleteStagedReview:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const pushToTestimonials = async (req, res) => {
  try {
    const userId = req.userId;
    const { review_ids } = req.body;

    // 1. Validate
    if (!review_ids || !Array.isArray(review_ids) || review_ids.length === 0) {
      return res.status(400).json({ error: "Review IDs array is required" });
    }
    if (review_ids.length > 50) {
      return res.status(400).json({ error: "Maximum 50 reviews per push" });
    }

    // 2. Fetch all platform_reviews
    const { data: reviews, error: fetchError } = await supabase
      .from('platform_reviews')
      .select('*')
      .in('id', review_ids)
      .eq('user_id', userId)
      .eq('is_deleted', false);

    if (fetchError) {
      console.error('Error fetching reviews to push:', fetchError);
      return res.status(500).json({ error: "Failed to fetch reviews" });
    }

    if (!reviews || reviews.length === 0) {
      return res.status(200).json({
        pushed: 0,
        skipped: review_ids.length,
        testimonials_created: []
      });
    }

    // 3. Filter out pushed ones
    const unpushedReviews = reviews.filter(r => !r.pushed_to_testimonials);
    const skippedCount = review_ids.length - unpushedReviews.length;

    const testimonialsCreated = [];
    
    // 4 & 5. Loop and insert
    for (const review of unpushedReviews) {
      const testimonialData = {
        user_id: userId,
        form_id: null,
        reviewer_name: review.reviewer_name || 'Anonymous',
        reviewer_email: null,
        reviewer_role: null,
        reviewer_company: null,
        reviewer_photo_url: review.reviewer_photo_url,
        rating: Math.round(review.rating || 5),
        text_content: review.review_text,
        video_url: null,
        source: review.platform,
        status: 'pending',
        is_starred: false,
        screenshot_url: null
      };

      const { data: newTestimonial, error: insertError } = await supabase
        .from('testimonials')
        .insert(testimonialData)
        .select('id')
        .single();

      if (insertError) {
        console.error('Error inserting testimonial:', insertError);
        continue; // Skip this one on error and continue with others
      }

      testimonialsCreated.push(newTestimonial.id);

      // 5. Update platform_reviews record
      await supabase
        .from('platform_reviews')
        .update({
          pushed_to_testimonials: true,
          testimonial_id: newTestimonial.id
        })
        .eq('id', review.id)
        .eq('user_id', userId);
    }

    // 6. Return
    return res.status(200).json({
      pushed: testimonialsCreated.length,
      skipped: skippedCount + (unpushedReviews.length - testimonialsCreated.length), // Including errored ones
      testimonials_created: testimonialsCreated
    });

  } catch (error) {
    console.error('Error in pushToTestimonials:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getFetchStatus = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const { data: record, error } = await supabase
      .from('platform_fetch_history')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !record) {
      return res.status(404).json({ error: "Fetch job not found" });
    }

    return res.status(200).json({
      fetch_id: record.id,
      status: record.status,
      platforms_selected: record.platforms_selected,
      total_fetched: record.total_fetched,
      total_new: record.total_new,
      total_duplicate: record.total_duplicate,
      error_message: record.error_message || null,
      created_at: record.created_at,
      completed_at: record.completed_at || null
    });

  } catch (error) {
    console.error('Error in getFetchStatus:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getClaimedBusiness,
  confirmBusiness,
  searchBusiness,
  getPlatformStatus,
  fetchPlatformReviews,
  getStagedReviews,
  deleteStagedReview,
  pushToTestimonials,
  getFetchStatus
};
