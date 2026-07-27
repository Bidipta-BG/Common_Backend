/**
 * Utility to get the unified review count across testimonials and platform_reviews.
 * Used for the X/100 reviews progress gate.
 */
const getUnifiedReviewCount = async (userId, supabase) => {
  try {
    // Run both count queries concurrently for performance
    const [
      { count: formAndManualCount },
      { count: platformCount }
    ] = await Promise.all([
      supabase
        .from('testimonials')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'approved'),
      supabase
        .from('platform_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_deleted', false)
    ]);

    const form_and_manual_count = formAndManualCount || 0;
    const platform_count = platformCount || 0;
    const total = form_and_manual_count + platform_count;

    return { total, form_and_manual_count, platform_count };
  } catch (error) {
    console.error('Error in getUnifiedReviewCount:', error);
    return { total: 0, form_and_manual_count: 0, platform_count: 0 };
  }
};

module.exports = {
  getUnifiedReviewCount
};
