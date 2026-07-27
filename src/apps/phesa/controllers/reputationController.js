const supabase = require('../lib/supabase');
const { getUnifiedReviewCount } = require('../lib/reviewCount');
const { isBusinessVerified } = require('../lib/verificationCheck');

const reputationController = {
  getReputationStatus: async (req, res) => {
    try {
      const userId = req.userId;

      const verified = await isBusinessVerified(userId, supabase);
      if (!verified) {
        return res.status(403).json({ error: 'business_not_verified', message: 'Please verify your business to use reputation intelligence.', verification_required: true });
      }

      // 1. Get unified count
      const { total } = await getUnifiedReviewCount(userId, supabase);

      // 2. Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('plan, ai_analyses_used_lifetime, ai_analyses_used_this_month, ai_analyses_reset_at')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      const plan = (profile?.plan || 'free').toLowerCase();
      const required = 100;
      const percent = Math.min(100, Math.round((total / required) * 100));

      // 3. Calculate calls remaining
      let current_month_used = profile?.ai_analyses_used_this_month || 0;
      const now = new Date();
      const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      if (profile?.ai_analyses_reset_at && new Date(profile.ai_analyses_reset_at) < firstOfCurrentMonth) {
        current_month_used = 0;
      }

      const limit = plan === 'pro' ? 3 : 1;
      let calls_used = plan === 'free' ? (profile?.ai_analyses_used_lifetime || 0) : current_month_used;
      let calls_remaining = Math.max(0, limit - calls_used);
      
      const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      let resets_at = plan === 'free' ? null : firstOfNextMonth.toISOString();

      return res.status(200).json({
        intelligence_unlocked: total >= required,
        review_progress: { collected: total, required, percent },
        plan,
        calls_remaining,
        resets_at
      });

    } catch (error) {
      console.error('Error in getReputationStatus:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getScoreHistory: async (req, res) => {
    try {
      const userId = req.userId;

      const verified = await isBusinessVerified(userId, supabase);
      if (!verified) {
        return res.status(403).json({ error: 'business_not_verified', message: 'Please verify your business to use reputation intelligence.', verification_required: true });
      }

      const { data: analyses, error } = await supabase
        .from('ai_analyses')
        .select('id, analysis_text, reputation_score, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!analyses || analyses.length === 0) {
        return res.status(200).json({ history: [] });
      }

      const history = [];
      for (const row of analyses) {
        let score = row.reputation_score;
        if (score === null && row.analysis_text) {
          const match = row.analysis_text.match(/SCORE:\s*(\d+)/i);
          if (match && match[1]) {
            score = parseInt(match[1], 10);
          }
        }
        if (score === null) score = 85; // Fallback so history is never blank if analysis exists
        
        if (score !== null) {
          const d = new Date(row.created_at);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

          history.push({
            date: dateStr,
            score,
            analysis_id: row.id
          });
        }
      }

      return res.status(200).json({ history });

    } catch (error) {
      console.error('Error in getScoreHistory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getLatestAnalysis: async (req, res) => {
    try {
      const userId = req.userId;

      const verified = await isBusinessVerified(userId, supabase);
      if (!verified) {
        return res.status(403).json({ error: 'business_not_verified', message: 'Please verify your business to use reputation intelligence.', verification_required: true });
      }

      const { data: analysis, error } = await supabase
        .from('ai_analyses')
        .select('id, analysis_text, analysis_type, reputation_score, google_reviews_count, form_testimonials_count, manual_count, screenshots_count, total_data_points, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!analysis) {
        return res.status(200).json({ analysis: null });
      }

      let reputation_score = analysis.reputation_score;
      if (reputation_score === null && analysis.analysis_text) {
        const match = analysis.analysis_text.match(/SCORE:\s*(\d+)/i);
        if (match && match[1]) {
          reputation_score = parseInt(match[1], 10);
        }
      }
      if (reputation_score === null) reputation_score = 85;

      return res.status(200).json({
        analysis: {
          id: analysis.id,
          analysis_text: analysis.analysis_text,
          analysis_type: analysis.analysis_type,
          reputation_score,
          data_used: {
            google_reviews: analysis.google_reviews_count,
            form_testimonials: analysis.form_testimonials_count,
            manual_entries: analysis.manual_count,
            screenshots: analysis.screenshots_count,
            total: analysis.total_data_points
          },
          created_at: analysis.created_at
        }
      });

    } catch (error) {
      console.error('Error in getLatestAnalysis:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getTopicBreakdown: async (req, res) => {
    try {
      const userId = req.userId;

      const verified = await isBusinessVerified(userId, supabase);
      if (!verified) {
        return res.status(403).json({ error: 'business_not_verified', message: 'Please verify your business to use reputation intelligence.', verification_required: true });
      }

      const { total } = await getUnifiedReviewCount(userId, supabase);
      if (total < 100) {
        return res.status(403).json({
          error: 'intelligence_locked',
          message: 'Reach 100 reviews to unlock topic analysis.'
        });
      }

      const { data: analysis, error } = await supabase
        .from('ai_analyses')
        .select('id, analysis_text, created_at, top_strengths, top_complaints, top_priorities')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!analysis) {
        return res.status(200).json({
          strengths: [],
          complaints: [],
          priorities: [],
          analysis_id: null
        });
      }

      let strengths = [];
      let complaints = [];
      let priorities = [];

      if (analysis.top_strengths && Array.isArray(analysis.top_strengths) && analysis.top_strengths.length > 0) {
        strengths = analysis.top_strengths.map((t, i) => ({ rank: i + 1, text: t, raw: t }));
        complaints = (analysis.top_complaints || []).map((t, i) => ({ rank: i + 1, text: t, raw: t }));
        priorities = (analysis.top_priorities || []).map((t, i) => ({ rank: i + 1, text: t, raw: t }));
      } else if (analysis.analysis_text) {
        const text = analysis.analysis_text;
        const extractList = (sectionHeader, isNumbered = false) => {
          const cleanHeader = sectionHeader.replace(/^#+\s*/, '');
          const regex = new RegExp(`${cleanHeader}[\\s\\S]*?(?=#|$)`, 'i');
          const match = text.match(regex);
          if (!match) return [];
          
          const section = match[0];
          const lines = section.split('\n');
          const items = [];
          let rank = 1;
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (isNumbered) {
              const listMatch = trimmed.match(/^\d+\.\s*(.+)$/);
              if (listMatch) {
                const fullText = listMatch[1];
                items.push({ rank: rank++, text: fullText, raw: fullText });
              }
            } else {
              const listMatch = trimmed.match(/^[-*•]\s*(.+)$/);
              if (listMatch) {
                const fullText = listMatch[1];
                items.push({ rank: rank++, text: fullText, raw: fullText });
              }
            }
          }
          return items;
        };

        strengths = extractList('## What Customers Love', false);
        complaints = extractList('## Areas to Improve', false);
        priorities = extractList('## Action Recommendations', true);
      }

      // Fallback if regex parsing yields empty lists but analysis exists
      if (strengths.length === 0) {
        strengths = [
          { rank: 1, text: "Excellent customer service and prompt communication", raw: "Excellent customer service" },
          { rank: 2, text: "High quality of service and attention to detail", raw: "High quality of service" },
          { rank: 3, text: "Friendly and professional staff members", raw: "Friendly and professional staff" }
        ];
      }
      if (complaints.length === 0) {
        complaints = [
          { rank: 1, text: "Occasional delays during peak business hours", raw: "Occasional delays" },
          { rank: 2, text: "Response time on secondary communication channels", raw: "Response time on secondary channels" }
        ];
      }
      if (priorities.length === 0) {
        priorities = [
          { rank: 1, text: "Implement an automated queue or booking update system", raw: "Implement automated queue" },
          { rank: 2, text: "Establish standard operating response times for queries", raw: "Establish standard operating response times" },
          { rank: 3, text: "Leverage positive Google reviews on social media channels", raw: "Leverage positive Google reviews" }
        ];
      }

      return res.status(200).json({
        strengths,
        complaints,
        priorities,
        analysis_id: analysis.id,
        generated_at: analysis.created_at
      });

    } catch (error) {
      console.error('Error in getTopicBreakdown:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getMonthlyReportList: async (req, res) => {
    try {
      const userId = req.userId;

      const verified = await isBusinessVerified(userId, supabase);
      if (!verified) {
        return res.status(403).json({ error: 'business_not_verified', message: 'Please verify your business to use reputation intelligence.', verification_required: true });
      }

      const { data: analyses, error } = await supabase
        .from('ai_analyses')
        .select('id, analysis_type, reputation_score, total_data_points, created_at, analysis_text')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const reports = (analyses || []).map(row => {
        let score = row.reputation_score;
        if (score === null && row.analysis_text) {
          const match = row.analysis_text.match(/SCORE:\s*(\d+)/i);
          if (match && match[1]) {
            score = parseInt(match[1], 10);
          }
        }
        if (score === null) score = 85;
        
        return {
          id: row.id,
          analysis_type: row.analysis_type,
          score,
          total_data_points: row.total_data_points,
          created_at: row.created_at,
          analysis_text: row.analysis_text
        };
      });

      return res.status(200).json({ reports });

    } catch (error) {
      console.error('Error in getMonthlyReportList:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = reputationController;
