const supabase = require('../lib/supabase');
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const getSuggestions = async (req, res) => {
  try {
    const { id } = req.params;
    let { rating } = req.query;

    // 1. Validate rating
    if (!rating) {
      return res.status(400).json({ error: "Invalid rating. Must be 1 to 5." });
    }

    rating = parseInt(rating, 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Invalid rating. Must be 1 to 5." });
    }

    // 2. Check that the form exists and is active
    const { data: form, error: formError } = await supabase
      .from('collection_forms')
      .select('user_id, is_active')
      .eq('id', id)
      .single();

    if (formError || !form || !form.is_active) {
      return res.status(404).json({ error: "Form not found" });
    }

    // 3. Get the user's plan from profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', form.user_id)
      .single();

    if (profileError || !profile) {
      return res.status(500).json({ error: "Failed to fetch user profile." });
    }

    // 4. Determine how many suggestions to return based on plan
    const plan = profile.plan || 'free';
    let limit = 1;
    if (plan === 'starter') limit = 2;
    if (plan === 'pro') limit = 3;

    // 5. Query form_review_suggestions
    const { data: suggestions, error: suggestionsError } = await supabase
      .from('form_review_suggestions')
      .select('suggestion_text')
      .eq('form_id', id)
      .eq('star_rating', rating);

    if (suggestionsError) {
      return res.status(500).json({ error: "Failed to fetch suggestions." });
    }

    // 6. If no suggestions found
    if (!suggestions || suggestions.length === 0) {
      return res.status(200).json({ suggestions: [] });
    }

    const validSuggestions = suggestions.filter(s => !s.suggestion_text.startsWith('__HISTORY__:'));

    // Shuffle suggestions to simulate "Order by RANDOM()" and apply limit
    const shuffled = validSuggestions.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, limit).map(s => s.suggestion_text);

    // 7. Return the suggestions
    return res.status(200).json({ suggestions: selected });
  } catch (error) {
    console.error('Error in getSuggestions:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const regenerateSuggestions = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // 2. Verify form belongs to logged-in user
    const { data: form, error: formError } = await supabase
      .from('collection_forms')
      .select('user_id, business_category')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (formError || !form) {
      return res.status(404).json({ error: "Form not found" });
    }

    // 3. Get plan and check limits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(500).json({ error: "Failed to fetch user profile" });
    }

    const plan = profile.plan || 'free';

    if (plan === 'free') {
      return res.status(403).json({
        error: "plan_upgrade_required",
        message: "Upgrade to Starter or Pro to refresh suggestions"
      });
    }

    let limit = 0;
    if (plan === 'starter') limit = 1;
    if (plan === 'pro') limit = 3;

    // Fetch history row (star_rating = 1, suggestion_text starts with __HISTORY__:)
    const { data: historyRows } = await supabase
      .from('form_review_suggestions')
      .select('id, suggestion_text')
      .eq('form_id', id)
      .eq('star_rating', 1)
      .like('suggestion_text', '__HISTORY__:%')
      .limit(1);

    const historyRow = historyRows && historyRows.length > 0 ? historyRows[0] : null;

    let history = [];
    if (historyRow && historyRow.suggestion_text) {
      try {
        history = JSON.parse(historyRow.suggestion_text.replace('__HISTORY__:', ''));
      } catch (e) {
        history = [];
      }
    }

    // Filter to last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    history = history.filter(dateStr => new Date(dateStr) > thirtyDaysAgo);

    if (history.length >= limit) {
      const oldestDate = new Date(history[0]);
      const nextAvailable = new Date(oldestDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      return res.status(403).json({
        error: "refresh_limit_reached",
        message: `You have reached your limit of ${limit} refreshes per 30 days for this plan.`,
        next_available_at: nextAvailable.toISOString()
      });
    }

    // Add current generation to history
    history.push(new Date().toISOString());

    // 4. Get business category
    const businessCategory = form.business_category || 'other';

    // 5. Determine pool size and tones
    let suggestionsPerStar = 4; // starter default
    let useVariedTones = false;

    if (plan === 'pro') {
      suggestionsPerStar = 6;
      useVariedTones = true;
    }

    // 6. Call Claude API
    const basePrompt = `You are helping generate review suggestions for a ${businessCategory} business. Generate short, natural-sounding customer reviews (40-70 words each).

Generate ${suggestionsPerStar} reviews for each star rating:

1 star (very unhappy):
2 star (disappointed):
3 star (average):
4 star (good):
5 star (excellent):

Format your response as JSON only, no markdown:
{
  "1": ["review text", "review text"],
  "2": ["review text", "review text"],
  "3": ["review text", "review text"],
  "4": ["review text", "review text"],
  "5": ["review text", "review text"]
}`;

    const toneAddon = useVariedTones 
      ? "\nVary the tones across the reviews in each category (include standard, formal, casual, funny tones)." 
      : "\nUse a standard, natural tone.";

    const finalPrompt = basePrompt + toneAddon;

    // 6. Call Claude API (or mock if no key is present)
    let parsedData = {};
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('No Anthropic API key found, mocking suggestions...');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API delay
      parsedData = {
        "1": ["Terrible experience. Would not recommend.", "Not what I expected.", "Very disappointed.", "Waste of money.", "Awful service.", "Do not go here."],
        "2": ["It was okay, but had issues.", "Could be better.", "Needs improvement.", "A bit underwhelming.", "Disappointing overall.", "Not great."],
        "3": ["It's fine. Average.", "Did the job.", "Nothing special.", "Met expectations.", "Decent experience.", "It was okay."],
        "4": ["Really good! I enjoyed it.", "Solid experience.", "Very happy with it.", "Great value.", "Would recommend.", "Good service."],
        "5": ["Absolutely amazing!", "Exceeded all expectations.", "Will definitely come back.", "The best! Highly recommend.", "Fantastic experience!", "Loved everything about it."]
      };
    } else {
      try {
        const apiResponse = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: finalPrompt }]
        });

        const text = apiResponse.content[0].text;
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}') + 1;
        parsedData = JSON.parse(text.substring(jsonStart, jsonEnd));
      } catch (apiError) {
        console.warn('Anthropic API Error or Parse Error (falling back to mock):', apiError.message);
        parsedData = {
          "1": [`Terrible ${businessCategory} experience. Would not recommend.`, `Not what I expected from this ${businessCategory}.`, `Very disappointed with the ${businessCategory}.`, "Waste of money.", "Awful service.", "Do not go here."],
          "2": [`It was an okay ${businessCategory}, but had issues.`, `Could be better for a ${businessCategory}.`, "Needs improvement.", "A bit underwhelming.", "Disappointing overall.", "Not great."],
          "3": [`It's a fine ${businessCategory}. Average.`, "Did the job.", "Nothing special.", "Met expectations.", "Decent experience.", "It was okay."],
          "4": [`Really good ${businessCategory}! I enjoyed it.`, "Solid experience.", "Very happy with it.", "Great value.", "Would recommend.", "Good service."],
          "5": [`Absolutely amazing ${businessCategory}!`, "Exceeded all expectations.", "Will definitely come back.", "The best! Highly recommend.", "Fantastic experience!", "Loved everything about it."]
        };
      }
    }

    // 7. Delete all existing suggestions
    const { error: deleteError } = await supabase
      .from('form_review_suggestions')
      .delete()
      .eq('form_id', id)
      .not('suggestion_text', 'like', '__HISTORY__:%');

    if (deleteError) {
      console.error('Error deleting old suggestions:', deleteError);
      return res.status(500).json({ error: "Failed to clear old suggestions." });
    }

    // 8. Insert all new suggestions
    const inserts = [];
    const tones = ['standard', 'formal', 'casual', 'funny'];

    for (let rating = 1; rating <= 5; rating++) {
      const texts = parsedData[rating.toString()] || [];
      texts.forEach((text, index) => {
        let selectedTone = 'standard';
        if (useVariedTones) {
          selectedTone = tones[index % tones.length];
        }

        inserts.push({
          form_id: id,
          star_rating: rating,
          suggestion_text: text,
          tone: selectedTone,
          times_selected: 0
        });
      });
    }

    if (inserts.length > 0) {
      const { error: insertError } = await supabase
        .from('form_review_suggestions')
        .insert(inserts);

      if (insertError) {
        console.error('Error inserting new suggestions:', insertError);
        return res.status(500).json({ error: "Failed to save new suggestions." });
      }
    }

    // 9. Save history row
    if (historyRow) {
      const { error: updateError } = await supabase
        .from('form_review_suggestions')
        .update({ suggestion_text: `__HISTORY__:${JSON.stringify(history)}` })
        .eq('id', historyRow.id);
      if (updateError) console.error("Error updating history row:", updateError);
    } else {
      const { error: insertHistoryError } = await supabase
        .from('form_review_suggestions')
        .insert({
          form_id: id,
          star_rating: 1,
          suggestion_text: `__HISTORY__:${JSON.stringify(history)}`,
          tone: 'standard',
          times_selected: 0
        });
      if (insertHistoryError) console.error("Error inserting history row:", insertHistoryError);
    }

    // 10. Return 200
    return res.status(200).json({
      message: "Suggestions refreshed successfully",
      generated: inserts.length,
      form_id: id,
      remaining_clicks: limit - history.length
    });

  } catch (error) {
    console.error('Error in regenerateSuggestions:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getSuggestions,
  regenerateSuggestions
};
