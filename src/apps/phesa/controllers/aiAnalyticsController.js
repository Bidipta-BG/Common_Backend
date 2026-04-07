const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../lib/supabase');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const aiAnalyticsController = {
  /**
   * 1. GET /ai/eligibility (requireAuth)
   * Checks if user is eligible to run an AI analysis today.
   */
  checkEligibility: async (req, res) => {
    try {
      const userId = req.userId;

      // 1. Get user profile and handle monthly reset
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('plan, ai_analyses_used_lifetime, ai_analyses_used_this_month, ai_analyses_reset_at')
        .eq('id', userId)
        .single();
      
      if (profileError) throw profileError;

      let current_month_used = profile.ai_analyses_used_this_month || 0;
      const now = new Date();
      const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Monthly reset logic for Starter/Pro
      if (profile.ai_analyses_reset_at && new Date(profile.ai_analyses_reset_at) < firstOfCurrentMonth) {
        current_month_used = 0;
        await supabase
          .from('profiles')
          .update({ 
            ai_analyses_used_this_month: 0, 
            ai_analyses_reset_at: now.toISOString() 
          })
          .eq('id', userId);
      }

      // 2. Check Google Connection
      const { data: gbp } = await supabase
        .from('google_business_profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      const google_connected = !!gbp;

      // 3. Count Testimonials (Calculate both total and approved)
      const { data: testimonials } = await supabase
        .from('testimonials')
        .select('source, screenshot_url, status')
        .eq('user_id', userId);

      const approvedCount = testimonials.filter(t => t.status === 'approved').length;

      const counts = {
        total: testimonials.length,
        approved_total: approvedCount,
        google_reviews: testimonials.filter(t => t.source === 'google').length,
        form_testimonials: testimonials.filter(t => t.source === 'form').length,
        manual_count: testimonials.filter(t => t.source === 'manual').length,
        screenshots_count: testimonials.filter(t => t.screenshot_url).length
      };

      // 4. Plan Limits
      const plan = profile.plan || 'free';
      const limit = plan === 'pro' ? 3 : 1; 
      let calls_used = (plan === 'free') ? (profile.ai_analyses_used_lifetime || 0) : current_month_used;
      let calls_remaining = Math.max(0, limit - calls_used);

      // 5. Eligibility Decision
      let can_run = true;
      let reason = null;

      if (calls_remaining === 0) {
        can_run = false;
        reason = 'limit_reached';
      } else if (counts.total < 10) {
        can_run = false;
        reason = 'no_data';
      }

      const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      res.status(200).json({
        can_run,
        reason,
        google_connected,
        calls_remaining,
        resets_at: (plan === 'free') ? null : firstOfNextMonth.toISOString(),
        screenshots_will_be_included: (plan !== 'free' && counts.screenshots_count > 0),
        data_points: counts
      });
    } catch (error) {
      console.error('Error in checkEligibility AI:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * 2. POST /ai/run (requireAuth)
   * Executes the AI analysis using Anthropic Claude.
   */
  runAnalysis: async (req, res) => {
    try {
      const userId = req.userId;

      // 1. Internal Eligibility Re-Verification
      // (For brevity, re-running minimal version or using req.eligibility if possible)
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
      const plan = profile?.plan || 'free';
      const now = new Date();

      // (Basic sanity check before calling API)
      if (plan === 'free' && profile.ai_analyses_used_lifetime >= 1) {
        return res.status(403).json({ error: 'limit_reached' });
      }
      const limit = plan === 'pro' ? 3 : 1;
      if (plan !== 'free' && profile.ai_analyses_used_this_month >= limit) {
        // Double check reset_at
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (new Date(profile.ai_analyses_reset_at) >= firstOfMonth) {
          return res.status(403).json({ error: 'limit_reached' });
        }
      }

      // 2. Fetch Aggregated Data (Status agnostic for balanced analysis)
      const { data: testimonials } = await supabase
        .from('testimonials')
        .select('*')
        .eq('user_id', userId);

      if (testimonials.length < 10) {
        return res.status(403).json({ error: 'no_data' });
      }

      // 3. Format Context for Claude
      const businessName = profile.business_name || 'Our Premium Business';
      const formattedReviews = testimonials.map(t => 
        `[${t.source}] ${t.reviewer_name} (${t.reviewer_role || 'Customer'}): ${t.rating}/5 - ${t.text_content}`
      ).join('\n');

      const screenshotUrls = (plan !== 'free') 
                             ? testimonials.filter(t => t.screenshot_url).map(t => t.screenshot_url)
                             : [];

      const basePrompt = `You are a business analyst helping an Indian small business owner understand their customer feedback. Business: ${businessName}.
Total reviews: ${testimonials.length} (${testimonials.filter(t => t.source === 'google').length} Google, ${testimonials.filter(t => t.source === 'form').length} form submissions, ${testimonials.filter(t => t.source === 'manual').length} manual entries).

Reviews data:
${formattedReviews}

IMPORTANT: You MUST produce ALL of the following sections in the EXACT order listed below. Use the EXACT header text shown. Do NOT skip, merge, or rename any section. Each section header must start with '## '.

## Overall Sentiment
(Write 2-3 sentences summarising the average rating and overall tone)

## What Customers Love
(List exactly 3 bullet points using '- ' prefix)

## Areas to Improve
(List exactly 3 bullet points using '- ' prefix)

## Action Recommendations
(List exactly 3 numbered action items)

Be encouraging, specific, and write in simple English suitable for an Indian small business owner.`;

      const deepPromptAddon = `

For this Pro Deep Analysis, you MUST ALSO include ALL four of these additional sections below, in this EXACT order, with these EXACT headers:

## Sentiment by Source
(Create a table or bullet list comparing Google vs Form vs Manual reviews. If a source has 0 reviews, explicitly say so and explain the opportunity.)

## Customer Persona
(Describe 3-4 distinct customer personas based on the reviewer roles and feedback patterns. Use a table or structured bullets.)

## Priority Action Plan
(List EXACTLY 4 to 6 priority action items, ordered from highest to lowest business impact. Use numbered list format: 1. 2. 3. etc. THIS SECTION IS MANDATORY — do not skip it or merge it with Action Recommendations.)

## Follow-up Suggestions
(Name 3-5 specific customers from the reviews who should be approached for video testimonials, and explain why.)`;

      const finalPrompt = plan === 'pro' ? (basePrompt + deepPromptAddon) : basePrompt;

      // 5. Call Anthropic
      let apiResponse;
      if (plan === 'pro' && screenshotUrls.length > 0) {
        apiResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2500,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: finalPrompt },
              ...screenshotUrls.slice(0, 20).map(url => ({ // Limitation on number of images
                type: 'image',
                source: { type: 'url', url: url }
              }))
            ]
          }]
        });
      } else {
        apiResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: finalPrompt }]
        });
      }

      const analysisText = apiResponse.content[0].text;

      // 6. Save results to DB
      const { data: analysisRecord, error: saveError } = await supabase
        .from('ai_analyses')
        .insert({
          user_id: userId,
          analysis_text: analysisText,
          analysis_type: plan === 'pro' ? 'deep' : 'standard',
          google_reviews_count: testimonials.filter(t => t.source === 'google').length,
          form_testimonials_count: testimonials.filter(t => t.source === 'form').length,
          manual_count: testimonials.filter(t => t.source === 'manual').length,
          screenshots_count: screenshotUrls.length,
          screenshots_included: (plan !== 'free' && screenshotUrls.length > 0),
          total_data_points: testimonials.length,
          last_included_at: now.toISOString()
        })
        .select()
        .single();

      if (saveError) throw saveError;

      // 7. Update usage counters
      const updateFields = {};
      if (plan === 'free') {
        updateFields.ai_analyses_used_lifetime = (profile.ai_analyses_used_lifetime || 0) + 1;
      } else {
        updateFields.ai_analyses_used_this_month = (profile.ai_analyses_used_this_month || 0) + 1;
        updateFields.ai_analyses_reset_at = now.toISOString();
      }

      await supabase.from('profiles').update(updateFields).eq('id', userId);

      res.status(200).json({
        analysis: {
          id: analysisRecord.id,
          analysis_text: analysisRecord.analysis_text,
          analysis_type: analysisRecord.analysis_type,
          screenshots_included: analysisRecord.screenshots_included,
          data_used: {
            google_reviews: analysisRecord.google_reviews_count,
            form_testimonials: analysisRecord.form_testimonials_count,
            manual_entries: analysisRecord.manual_count,
            screenshots: analysisRecord.screenshots_count,
            total: analysisRecord.total_data_points
          },
          calls_remaining: 0, // Since we used it
          created_at: analysisRecord.created_at
        }
      });
    } catch (error) {
      console.error('Error in runAnalysis AI:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * 3. GET /ai/history (requireAuth)
   * Fetches history of AI analyses for the user.
   */
  getAnalysisHistory: async (req, res) => {
    try {
      const userId = req.userId;

      const { data, error, count } = await supabase
        .from('ai_analyses')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.status(200).json({
        analyses: data,
        total: count
      });
    } catch (error) {
      console.error('Error in getAnalysisHistory AI:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = aiAnalyticsController;
