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
      const [ { data: testimonials }, { data: platformReviews } ] = await Promise.all([
        supabase.from('testimonials').select('source, screenshot_url').eq('user_id', userId),
        supabase.from('platform_reviews').select('platform').eq('user_id', userId)
      ]);

      const testData = testimonials || [];
      const platData = platformReviews || [];

      const totalCount = testData.length + platData.length;
      const googleCount = testData.filter(t => t.source === 'google').length + platData.filter(p => p.platform === 'google').length;

      const counts = {
        total: totalCount,
        google_reviews: googleCount,
        form_testimonials: testData.filter(t => t.source === 'form').length,
        manual_count: testData.filter(t => t.source === 'manual').length,
        screenshots_count: testData.filter(t => t.screenshot_url).length
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
      } else if (counts.total < 50) {
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
      const [ { data: testimonialsData }, { data: platformReviewsData } ] = await Promise.all([
        supabase.from('testimonials').select('*').eq('user_id', userId),
        supabase.from('platform_reviews').select('*').eq('user_id', userId)
      ]);

      const testimonials = testimonialsData || [];
      const platformReviews = platformReviewsData || [];

      if (testimonials.length + platformReviews.length < 50) {
        return res.status(403).json({ error: 'no_data' });
      }

      // Unify data
      let allReviews = [
        ...testimonials.map(t => ({
          type: 'testimonial',
          source: t.source,
          reviewer_name: t.reviewer_name,
          reviewer_role: t.reviewer_role,
          reviewer_company: t.reviewer_company,
          rating: t.rating,
          text_content: t.text_content,
          created_at: t.created_at
        })),
        ...platformReviews.map(p => ({
          type: 'platform',
          source: p.platform,
          reviewer_name: p.reviewer_name,
          reviewer_role: null,
          reviewer_company: null,
          rating: p.rating,
          text_content: p.review_text,
          created_at: p.review_date || p.created_at || new Date()
        }))
      ];

      // Sort by newest
      allReviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Apply limits — capped to prevent oversized API payloads
      if (plan === 'free') {
        allReviews = allReviews.slice(0, 50);
      } else if (plan === 'starter') {
        allReviews = allReviews.slice(0, 300);
      } else {
        // pro — top 500 most recent reviews
        allReviews = allReviews.slice(0, 500);
      }

      const totalCount = allReviews.length;
      const googleCount = allReviews.filter(r => r.source === 'google').length;
      const formCount = allReviews.filter(r => r.source === 'form').length;
      const manualCount = allReviews.filter(r => r.source === 'manual').length;

      // 3. Format Context for Claude
      const businessName = profile.business_name || 'Our Premium Business';
      const businessCategory = ''; 
      
      function formatReviews(reviews) {
        return reviews.map((t, i) => {
          const source = t.source === 'google' ? 'Google Review' 
                       : t.source === 'form'   ? 'Feedback Form' 
                       : t.source === 'manual' ? 'Manual Entry'
                       : (t.source && typeof t.source === 'string' ? t.source.charAt(0).toUpperCase() + t.source.slice(1) + ' Review' : 'Unknown Source');
          const role = t.reviewer_role ? ` · ${t.reviewer_role}` : '';
          const company = t.reviewer_company ? ` at ${t.reviewer_company}` : '';
          const date = t.created_at 
            ? new Date(t.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
            : '';
          
          return `[${i + 1}] ${t.reviewer_name || 'Customer'}${role}${company} | ${t.rating}/5 stars | ${source} | ${date}\n"${(t.text_content || 'No written review provided').slice(0, 300)}"`;
        }).join('\n\n');
      }

      const formattedReviews = formatReviews(allReviews);

      // Build Prompt
      let systemPrompt = '';
      let userPrompt = '';

      if (plan === 'pro' || plan === 'starter') {
        const priorityCount = totalCount >= 20 ? 5 : 4;
        systemPrompt = `You are a senior business analyst specialising in Indian small businesses. Your job is to read customer feedback and produce a comprehensive, data-driven analysis that helps a business owner understand their market position and take strategic action.

Writing style rules:
- Write as if presenting to an intelligent Indian entrepreneur who wants real insights, not flattery
- Be specific — reference actual reviewer names, quotes, and patterns from the data
- Be honest — if something is genuinely bad, say so clearly
- Use tables where comparison is needed (use markdown table format)
- CRITICAL: You MUST complete ALL 7 sections. Never leave the last section incomplete. If you are running long in early sections, trim them — do NOT sacrifice the final sections.
- CRITICAL: Strict word budget per section — follow exactly:
  • Overall Sentiment: 80-100 words
  • What Customers Love: 150-200 words (3 bullets, ~50-65 words each)
  • Areas to Improve: 150-200 words (3 bullets, ~50-65 words each)
  • Action Recommendations: 200-250 words (3 items, ~65-80 words each)
  • Sentiment by Source: 150-180 words
  • Customer Persona: 350-400 words (2-3 personas, ~120-130 words each)
  • Priority Action Plan: 400-500 words (${priorityCount} items, ~80-100 words each)
- Total response must not exceed 2,200 words.`;

        userPrompt = `Analyse the customer feedback below for this business and produce a comprehensive deep analysis report.

BUSINESS DETAILS:
Name: ${businessName}
Category: ${businessCategory || "Small business"}
Total reviews analysed: ${totalCount}
Breakdown: ${googleCount} Google · ${formCount} Collection Form · ${manualCount} Manual

CUSTOMER FEEDBACK:
${formattedReviews}

---

Produce your analysis in EXACTLY this structure. Use these exact section headers with ## prefix. Do not skip any section. Do not add any extra sections.

## Overall Sentiment
Start with exactly this format: SCORE: X/100 (where X is the calculated overall sentiment score out of 100).
Then write 2-3 sentences covering: average rating, dominant emotional tone, and the single most important takeaway from this feedback.

## What Customers Love
Exactly 3 bullet points starting with -
Each point names one specific strength with a supporting quote or reference from the actual reviews above.

## Areas to Improve
Exactly 3 bullet points starting with -
Each point names one specific problem. Reference how many reviewers mentioned it if more than one.

## Action Recommendations
Exactly 3 numbered items (1. 2. 3.)
Each: one concrete action the owner can take this week. Specific, not generic. Max 1-2 sentences each.

## Sentiment by Source
Compare feedback quality across sources using this structure:
- Google Reviews (${googleCount} reviews): [summary + avg rating if calculable]
- Collection Form (${formCount} reviews): [summary + tone]
- Manual Entries (${manualCount} reviews): [summary + tone]
If any source has 0 reviews, note it in one sentence only.

## Customer Persona
Identify 2-3 distinct customer types. For each: who they are + what they care about + how to win more of them. Max 2 sentences per persona.

## Priority Action Plan
Exactly ${priorityCount} numbered actions ordered by business impact. Each item: action + why it matters + one first step. Max 2 sentences each.

## Priority Action Plan ends here.
Do not add any other sections beyond what is listed above.`;

      } else {
        systemPrompt = `You are a friendly and insightful business analyst specialising in Indian small businesses. Your job is to read customer feedback and produce a clear, actionable analysis report.

Writing style rules:
- Write as if speaking to a first-generation Indian entrepreneur
- Use simple, direct English — no jargon, no corporate language
- Be honest but encouraging
- CRITICAL: You MUST complete ALL 4 sections. Never leave the last section incomplete.
- CRITICAL: Strict word budget — follow exactly:
  • Overall Sentiment: 50-70 words
  • What Customers Love: 150-180 words (3 bullets, ~50-60 words each)
  • Areas to Improve: 150-180 words (3 bullets, ~50-60 words each)
  • Action Recommendations: 200-250 words (3 items, ~65-80 words each)
- Total response must not exceed 850 words.`;

        userPrompt = `Analyse the customer feedback below for this business and produce a structured report.

BUSINESS DETAILS:
Name: ${businessName}
Category: ${businessCategory || "Small business"}
Total reviews analysed: ${totalCount} (${googleCount} from Google, ${formCount} from collection form, ${manualCount} manual entries)

CUSTOMER FEEDBACK:
${formattedReviews}

---

Produce your analysis in EXACTLY this structure. Use these exact section headers with ## prefix:

## Overall Sentiment
Start with exactly this format: SCORE: X/100 (where X is the calculated overall sentiment score out of 100).
Then write 2-3 sentences. State the average rating, the general mood of customers, and one key standout observation.

## What Customers Love
Exactly 3 bullet points starting with - 
Each point: one specific thing customers praised. Quote a real phrase from the reviews if possible.

## Areas to Improve
Exactly 3 bullet points starting with -
Each point: one specific complaint or gap. Be direct — do not sugarcoat.

## Action Recommendations
Exactly 3 numbered items (1. 2. 3.)
Each item: one concrete action the owner can take THIS WEEK. Be specific, not generic.`;
      }

      // 5. Call Anthropic SDK
      const combinedPrompt = systemPrompt + "\n\n" + userPrompt;
      const apiResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: (plan === 'pro' || plan === 'starter') ? 4000 : 1500,
        messages: [{ role: 'user', content: combinedPrompt }]
      });

      const analysisText = apiResponse.content[0].text;

      // Log token usage for monitoring
      const usage = apiResponse.usage;
      console.log(`[AI Analysis] Plan: ${plan} | Reviews sent: ${totalCount} | Tokens — Input: ${usage.input_tokens}, Output: ${usage.output_tokens}, Total: ${usage.input_tokens + usage.output_tokens}`);

      // 6. Save results to DB
      const { data: analysisRecord, error: saveError } = await supabase
        .from('ai_analyses')
        .insert({
          user_id: userId,
          analysis_text: analysisText,
          analysis_type: (plan === 'pro' || plan === 'starter') ? 'deep' : 'standard',
          google_reviews_count: googleCount,
          form_testimonials_count: formCount,
          manual_count: manualCount,
          screenshots_count: 0,
          screenshots_included: false,
          total_data_points: totalCount,
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
      res.status(500).json({ error: error.message || 'Internal server error', stack: error.stack });
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
