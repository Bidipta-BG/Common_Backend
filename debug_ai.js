const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function debug() {
  try {
    // Find the user who has "Pro plus 999 plan" and 301 google reviews
    const { data: profiles } = await supabase.from('profiles').select('*').eq('plan', 'pro');
    if (!profiles || profiles.length === 0) {
      console.log('No pro users found');
      return;
    }
    
    // Just pick the first one for debugging, or one that has testimonials
    let userId = profiles[0].id;

    // Simulate runAnalysis
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
    const plan = profile?.plan || 'free';
    const now = new Date();

    const limit = plan === 'pro' ? 3 : 1;

    const [ { data: testimonialsData }, { data: platformReviewsData } ] = await Promise.all([
      supabase.from('testimonials').select('*').eq('user_id', userId),
      supabase.from('platform_reviews').select('*').eq('user_id', userId)
    ]);

    const testimonials = testimonialsData || [];
    const platformReviews = platformReviewsData || [];

    console.log(`Found ${testimonials.length} testimonials, ${platformReviews.length} platform reviews`);

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

    allReviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (plan === 'free') {
      allReviews = allReviews.slice(0, 50);
    } else if (plan === 'starter') {
      allReviews = allReviews.slice(0, 300);
    }

    const totalCount = allReviews.length;
    const googleCount = allReviews.filter(r => r.source === 'google').length;
    const formCount = allReviews.filter(r => r.source === 'form').length;
    const manualCount = allReviews.filter(r => r.source === 'manual').length;

    console.log(`Total: ${totalCount}, Google: ${googleCount}, Form: ${formCount}, Manual: ${manualCount}`);

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
        
        return `[${i + 1}] ${t.reviewer_name}${role}${company} | ${t.rating}/5 stars | ${source} | ${date}\n"${t.text_content || 'No written review provided'}"`;
      }).join('\n\n');
    }

    const formattedReviews = formatReviews(allReviews);
    console.log('Reviews formatted successfully.');

    // Build Prompt
    let systemPrompt = '';
    let userPrompt = '';

    if (plan === 'pro') {
      const priorityCount = totalCount >= 20 ? '5-6' : '4-5';
      systemPrompt = `You are a senior business analyst...`;
      userPrompt = `Analyse...`;
    }

    console.log('Calling Anthropic...');
    const apiResponse = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      system: systemPrompt,
      max_tokens: plan === 'pro' ? 2500 : 1500,
      messages: [{ role: 'user', content: userPrompt }]
    });

    console.log('Anthropic success:', apiResponse.content[0].text.substring(0, 50));

    // Simulate DB insert
    const analysisText = apiResponse.content[0].text;
    const { data: analysisRecord, error: saveError } = await supabase
      .from('ai_analyses')
      .insert({
        user_id: userId,
        analysis_text: analysisText,
        analysis_type: plan === 'pro' ? 'deep' : 'standard',
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

    if (saveError) {
      console.log('Save Error:', saveError);
    } else {
      console.log('DB Save Success:', analysisRecord.id);
    }

  } catch (error) {
    console.error('DEBUG ERROR CAUGHT:', error);
  }
}

debug();
