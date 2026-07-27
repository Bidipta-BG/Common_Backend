const supabase = require('../lib/supabase');
const { getUnifiedReviewCount } = require('../lib/reviewCount');

const analyticsController = {
  getDashboardIntelligence: async (req, res) => {
    try {
      const userId = req.userId;

      // 1. Get unified review count
      const { total } = await getUnifiedReviewCount(userId, supabase);

      // 2. Fetch user's plan
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }
      
      const plan = profile?.plan || 'free';
      const required = 100;
      const percent = Math.min(100, Math.round((total / required) * 100));
      const review_progress = { collected: total, required, percent };

      // 3. Check if unlocked
      if (total < required) {
        return res.status(200).json({
          intelligence_unlocked: false,
          review_progress,
          plan
        });
      }

      // 4. If unlocked, fetch latest analysis
      const { data: analysis, error: analysisError } = await supabase
        .from('ai_analyses')
        .select('analysis_text, created_at, reputation_score, top_strengths, top_complaints, top_priorities')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (analysisError) {
        throw analysisError;
      }

      let reputation_score = null;
      let top_strength = null;
      let top_complaint = null;
      let top_priority = null;

      if (analysis) {
        if (analysis.reputation_score !== undefined && analysis.reputation_score !== null) {
          reputation_score = analysis.reputation_score;
          top_strength = (analysis.top_strengths && analysis.top_strengths.length > 0) ? analysis.top_strengths[0] : null;
          top_complaint = (analysis.top_complaints && analysis.top_complaints.length > 0) ? analysis.top_complaints[0] : null;
          top_priority = (analysis.top_priorities && analysis.top_priorities.length > 0) ? analysis.top_priorities[0] : null;
        } else if (analysis.analysis_text) {
          // Fallback for old records
          const match = analysis.analysis_text.match(/SCORE:\s*(\d+)\/100/);
          if (match && match[1]) {
            reputation_score = parseInt(match[1], 10);
          }
        }
      }

      return res.status(200).json({
        intelligence_unlocked: true,
        review_progress,
        plan,
        reputation_score,
        top_complaint,
        top_strength,
        top_priority,
        last_analysis_at: analysis ? analysis.created_at : null
      });

    } catch (error) {
      console.error('Error in getDashboardIntelligence:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getDashboardStats: async (req, res) => {
    try {
      const userId = req.userId;

      const now = new Date();
      const firstDayOfMonthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const firstDayOfLastMonthIso = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

      function calcPct(current, previous) {
        if (previous === 0) return current > 0 ? '+100%' : '0%';
        const diff = current - previous;
        const pct = (diff / Math.abs(previous)) * 100;
        return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
      }

      // Executing concurrent count queries for speed optimization
      const [
        { count: totalTestimonials },
        { count: approvedTestimonials },
        { count: pendingTestimonials },
        { count: pendingGoogle },
        { data: allApproved },
        { data: userWidgets },
        { data: userForms },
        { count: formSubmissionsThisMonth },
        { count: totalNewThisMonth },
        { count: lastMonthSubmissions },
        { count: lastMonthNewTotal }
      ] = await Promise.all([
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'approved'),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending'),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending').eq('source', 'google'),
        supabase.from('testimonials').select('rating, created_at').eq('user_id', userId).eq('status', 'approved'),
        supabase.from('widgets').select('id').eq('user_id', userId),
        supabase.from('collection_forms').select('id').eq('user_id', userId),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('source', 'form').gte('created_at', firstDayOfMonthIso),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', firstDayOfMonthIso),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('source', 'form').gte('created_at', firstDayOfLastMonthIso).lt('created_at', firstDayOfMonthIso),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', firstDayOfLastMonthIso).lt('created_at', firstDayOfMonthIso)
      ]);

      const widgetIds = (userWidgets || []).map(w => w.id);
      const formIds = (userForms || []).map(f => f.id);

      // Now query widget_analytics
      let totalWidgetViews = 0;
      let thisMonthViews = 0;
      let lastMonthViews = 0;

      if (widgetIds.length > 0) {
        const { count: totalViews } = await supabase
          .from('widget_analytics')
          .select('*', { count: 'exact', head: true })
          .in('widget_id', widgetIds);

        totalWidgetViews = totalViews || 0;

        const { count: monthViews } = await supabase
          .from('widget_analytics')
          .select('*', { count: 'exact', head: true })
          .in('widget_id', widgetIds)
          .gte('viewed_at', firstDayOfMonthIso);
          
        thisMonthViews = monthViews || 0;

        const { count: lMonthViews } = await supabase
          .from('widget_analytics')
          .select('*', { count: 'exact', head: true })
          .in('widget_id', widgetIds)
          .gte('viewed_at', firstDayOfLastMonthIso)
          .lt('viewed_at', firstDayOfMonthIso);
          
        lastMonthViews = lMonthViews || 0;
      }

      // Now query form_analytics
      let totalFormViews = 0;
      let thisMonthFormViews = 0;
      let lastMonthFormViews = 0;

      if (formIds.length > 0) {
        const { count: totalFViews } = await supabase
          .from('form_analytics')
          .select('*', { count: 'exact', head: true })
          .in('form_id', formIds);
          
        totalFormViews = totalFViews || 0;

        const { count: monthFViews } = await supabase
          .from('form_analytics')
          .select('*', { count: 'exact', head: true })
          .in('form_id', formIds)
          .gte('viewed_at', firstDayOfMonthIso);

        thisMonthFormViews = monthFViews || 0;

        const { count: lMonthFViews } = await supabase
          .from('form_analytics')
          .select('*', { count: 'exact', head: true })
          .in('form_id', formIds)
          .gte('viewed_at', firstDayOfLastMonthIso)
          .lt('viewed_at', firstDayOfMonthIso);

        lastMonthFormViews = lMonthFViews || 0;
      }

      // Calculate localized time-bound testimonial bounds 
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      let totalRatingSum = 0;
      let ratedCount = 0;
      let thisMonthApprovedTestimonials = 0;

      if (allApproved) {
        allApproved.forEach(t => {
          if (t.rating) {
            totalRatingSum += t.rating;
            ratedCount++;
          }
          if (new Date(t.created_at).getTime() >= firstDayOfMonth) {
            thisMonthApprovedTestimonials++;
          }
        });
      }

      // Fetch recent 10 widget interactions for the Live Feed
      const { data: recentViewsData } = await supabase
        .from('widget_analytics')
        .select(`
          id, 
          viewed_at, 
          referrer, 
          widgets (name)
        `)
        .eq('user_id', userId)
        .order('viewed_at', { ascending: false })
        .limit(10);

      const recentViews = (recentViewsData || []).map(row => ({
        id: row.id,
        date: row.viewed_at,
        referrer: row.referrer || 'Direct Link',
        widget: row.widgets?.name || 'Unknown Widget'
      }));

      const averageRating = ratedCount > 0 ? (totalRatingSum / ratedCount).toFixed(1) : 0;
      
      const currentConvRaw = thisMonthFormViews > 0 ? ((formSubmissionsThisMonth || 0) / thisMonthFormViews) * 100 : 0;
      const lastConvRaw = lastMonthFormViews > 0 ? ((lastMonthSubmissions || 0) / lastMonthFormViews) * 100 : 0;
      const convDiff = currentConvRaw - lastConvRaw;
      
      const conversionRate = currentConvRaw.toFixed(1) + '%';
      const conversionTrend = (convDiff > 0 ? '+' : '') + convDiff.toFixed(1) + '%';

      const { total } = await getUnifiedReviewCount(userId, supabase);

      res.status(200).json({
        total_testimonials: totalTestimonials || 0,
        total_trend: calcPct(totalTestimonials, totalTestimonials - totalNewThisMonth),
        
        approved_testimonials: approvedTestimonials || 0,
        approved_trend: calcPct(approvedTestimonials, approvedTestimonials - thisMonthApprovedTestimonials),
        
        pending_testimonials: pendingTestimonials || 0,
        pending_google_reviews: pendingGoogle || 0,
        
        total_widget_views: totalWidgetViews,
        this_month_views: thisMonthViews,
        views_trend: calcPct(thisMonthViews, lastMonthViews),
        
        this_month_testimonials: totalNewThisMonth || 0,
        new_trend: calcPct(totalNewThisMonth, lastMonthNewTotal),
        
        average_rating: Number(averageRating),
        recent_views: recentViews,
        
        form_views: thisMonthFormViews,
        form_views_trend: calcPct(thisMonthFormViews, lastMonthFormViews),
        
        conversion_rate: conversionRate,
        conversion_trend: conversionTrend,

        review_progress: {
          collected: total,
          required: 100,
          percent: Math.min(100, Math.round((total / 100) * 100))
        },
        intelligence_unlocked: total >= 100
      });
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  trackView: async (req, res) => {
    try {
      const { widget_id } = req.body;
      const referrer = req.headers.referer || req.headers.referrer || null;

      if (!widget_id) {
        return res.status(400).json({ error: 'widget_id is required' });
      }

      // Fire and forget
      supabase.from('widget_analytics').insert({
        widget_id,
        referrer
      }).then().catch(error => console.error('Silent tracking error:', error));

      // Quick 200 payload returned asynchronously to avert rendering lag
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(200).json({ success: false }); // Failsafing non-fatal errors
    }
  },

  trackFormView: async (req, res) => {
    try {
      const { form_id, user_id } = req.body;
      const referrer = req.headers.referer || req.headers.referrer || null;

      if (!form_id || !user_id) {
        return res.status(400).json({ error: 'form_id and user_id are required' });
      }

      // Fire and forget
      supabase.from('form_analytics').insert({
        form_id,
        user_id,
        referrer
      }).then().catch(error => console.error('Silent form tracking error:', error));

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(200).json({ success: false });
    }
  }
};

module.exports = analyticsController;