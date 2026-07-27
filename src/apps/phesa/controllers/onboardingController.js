const supabase = require('../lib/supabase');
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const onboardingController = {
  // 1. GET /onboarding/status
  getStatus: async (req, res) => {
    try {
      const userId = req.userId;
      const { data: business, error } = await supabase
        .from('claimed_businesses')
        .select('cluster_key, cluster_answers')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // If business exists and cluster answers are fully populated (not empty JSON object)
      const isComplete = business && business.cluster_key && Object.keys(business.cluster_answers || {}).length > 0;
      
      return res.status(200).json({
        isComplete: !!isComplete,
        step: isComplete ? 'completed' : (business ? 'cluster_setup' : 'not_started'),
        business: business || null
      });
    } catch (error) {
      console.error('Error getting onboarding status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // 2. GET /import/onboarding/clusters (mounted as /onboarding/clusters usually)
  getClusters: async (req, res) => {
    try {
      const { data: clusters, error } = await supabase
        .from('business_clusters')
        .select('cluster_key, cluster_name')
        .eq('is_active', true);

      if (error) throw error;
      return res.status(200).json({ clusters: clusters || [] });
    } catch (error) {
      console.error('Error getting clusters:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // 3. GET /import/onboarding/questions/:cluster_key
  getQuestions: async (req, res) => {
    try {
      const { cluster_key } = req.params;
      const { data: questions, error } = await supabase
        .from('onboarding_questions')
        .select('*')
        .eq('cluster_key', cluster_key)
        .eq('is_required', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return res.status(200).json({ questions: questions || [] });
    } catch (error) {
      console.error('Error getting cluster questions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // 4. POST /import/onboarding/detect-cluster
  detectCluster: async (req, res) => {
    try {
      const { googleCategory } = req.body;
      if (!googleCategory) {
        return res.status(400).json({ error: 'googleCategory is required' });
      }

      // First check if it's already mapped in db
      const { data: existingMapping } = await supabase
        .from('google_category_mappings')
        .select('cluster_key')
        .eq('google_category', googleCategory)
        .single();

      if (existingMapping && existingMapping.cluster_key) {
        return res.status(200).json({ cluster_key: existingMapping.cluster_key, source: 'db' });
      }

      // Fetch active clusters to give Claude the valid list
      const { data: clusters } = await supabase.from('business_clusters').select('cluster_key').eq('is_active', true);
      const validKeys = (clusters || []).map(c => c.cluster_key);

      // Ask Claude
      const prompt = `You are a strict data classifier. Map the Google Category "${googleCategory}" to the single most appropriate cluster key from this exact list: [${validKeys.join(', ')}]. You must respond ONLY with a valid JSON object in this exact format: {"cluster_key": "selected_key"}. Do not include any other text, markdown blocks, greetings, or explanations.`;

      if (process.env.ANTHROPIC_API_KEY) {
        const message = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
          temperature: 0,
          system: "You are a rigid classification API that only outputs raw JSON objects.",
          messages: [{ role: 'user', content: prompt }]
        });

        const rawResponse = message.content[0].text;
        try {
          const parsed = JSON.parse(rawResponse.trim());
          const detectedKey = parsed.cluster_key;

          if (validKeys.includes(detectedKey)) {
            // Save it to the mappings table async so we don't have to ask Claude again next time
            supabase.from('google_category_mappings').insert({
              google_category: googleCategory,
              cluster_key: detectedKey,
              mapped_by: 'ai_auto'
            }).then();

            return res.status(200).json({ cluster_key: detectedKey, source: 'ai' });
          }
        } catch (parseError) {
          console.error("Claude returned invalid JSON:", rawResponse);
          // Fallback mechanism: check if response contains any of the keys
          const matchedKey = validKeys.find(key => rawResponse.includes(key));
          if (matchedKey) {
            return res.status(200).json({ cluster_key: matchedKey, source: 'ai_fallback' });
          }
        }
      }

      // Ultimate fallback if no API key or Claude fails completely
      return res.status(200).json({ cluster_key: 'other_general', source: 'fallback' });

    } catch (error) {
      console.error('Error detecting cluster:', error);
      res.status(500).json({ error: 'Internal server error', cluster_key: 'other_general' });
    }
  },

  // 5. POST /onboarding/complete
  completeOnboarding: async (req, res) => {
    try {
      const userId = req.userId;
      const { cluster_key, cluster_answers } = req.body;

      if (!cluster_key || !cluster_answers) {
        return res.status(400).json({ error: 'cluster_key and cluster_answers are required' });
      }

      const { error } = await supabase
        .from('claimed_businesses')
        .update({
          cluster_key,
          cluster_answers
        })
        .eq('user_id', userId);

      if (error) throw error;

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = onboardingController;
