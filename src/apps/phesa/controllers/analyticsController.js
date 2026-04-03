const supabase = require('../lib/supabase');

const analyticsController = {
  getDashboardStats: async (req, res) => {
    try {
      const userId = req.userId;

      // Executing concurrent count queries for speed optimization
      const [
        { count: totalTestimonials },
        { count: approvedTestimonials },
        { count: pendingTestimonials },
        { count: pendingGoogle },
        { data: allApproved },
        { data: userWidgets }
      ] = await Promise.all([
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'approved'),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending'),
        supabase.from('testimonials').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending').eq('source', 'google'),
        supabase.from('testimonials').select('rating, created_at').eq('user_id', userId).eq('status', 'approved'),
        supabase.from('widgets').select('id').eq('user_id', userId)
      ]);

      const widgetIds = (userWidgets || []).map(w => w.id);

      // Now query widget_analytics
      let totalWidgetViews = 0;
      let thisMonthViews = 0;

      if (widgetIds.length > 0) {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const { count: totalViews } = await supabase
          .from('widget_analytics')
          .select('*', { count: 'exact', head: true })
          .in('widget_id', widgetIds);

        totalWidgetViews = totalViews || 0;

        const { count: monthViews } = await supabase
          .from('widget_analytics')
          .select('*', { count: 'exact', head: true })
          .in('widget_id', widgetIds)
          .gte('viewed_at', firstDayOfMonth);
          
        thisMonthViews = monthViews || 0;
      }

      // Calculate localized time-bound testimonial bounds 
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      let thisMonthTestimonials = 0;
      let totalRatingSum = 0;
      let ratedCount = 0;

      if (allApproved) {
        allApproved.forEach(t => {
          if (t.rating) {
            totalRatingSum += t.rating;
            ratedCount++;
          }
          if (new Date(t.created_at).getTime() >= firstDayOfMonth) {
            thisMonthTestimonials++;
          }
        });
      }

      const averageRating = ratedCount > 0 ? (totalRatingSum / ratedCount).toFixed(1) : 0;

      res.status(200).json({
        total_testimonials: totalTestimonials || 0,
        approved_testimonials: approvedTestimonials || 0,
        pending_testimonials: pendingTestimonials || 0,
        pending_google_reviews: pendingGoogle || 0,
        total_widget_views: totalWidgetViews,
        this_month_views: thisMonthViews,
        this_month_testimonials: thisMonthTestimonials,
        average_rating: Number(averageRating)
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
  }
};

module.exports = analyticsController;