const axios = require('axios');
const supabase = require('../lib/supabase');

const videoController = {
  /**
   * 1. GET /videos/templates (requireAuth)
   * Fetches active video templates for review generation.
   */
  getTemplates: async (req, res) => {
    try {
      const { data: templates, error } = await supabase
        .from('video_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      res.status(200).json({ templates });
    } catch (error) {
      console.error('Error in getTemplates:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * 2. POST /videos/generate (requireAuth)
   * Triggers a video render using Creatomate.
   */
  generateVideo: async (req, res) => {
    try {
      const userId = req.userId;
      const { template_id, testimonial_ids, music_style } = req.body;

      if (!template_id || !testimonial_ids || !Array.isArray(testimonial_ids) || testimonial_ids.length === 0) {
        return res.status(400).json({ error: 'template_id and testimonial_ids (array) are required' });
      }

      if (testimonial_ids.length > 5) {
        return res.status(400).json({ error: 'Max 5 testimonials allowed' });
      }

      // 1. Get user profile and handle monthly reset
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, business_name, business_logo_url, business_tagline, videos_used_this_month, videos_reset_at')
        .eq('id', userId)
        .single();

      let current_videos_used = profile.videos_used_this_month || 0;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      if (profile.videos_reset_at && new Date(profile.videos_reset_at) < startOfMonth) {
        current_videos_used = 0;
        await supabase
          .from('profiles')
          .update({ videos_used_this_month: 0, videos_reset_at: now.toISOString() })
          .eq('id', userId);
      }

      // 2. Check plan limit
      const plan = profile.plan || 'free';
      if (plan === 'free') {
        return res.status(403).json({ error: 'plan_required', minimum_plan: 'starter' });
      }

      const limit = plan === 'pro' ? 3 : 1;
      if (current_videos_used >= limit) {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return res.status(403).json({ 
          error: 'video_limit_reached', 
          limit, 
          resets_at: nextMonth.toISOString() 
        });
      }

      // 3. Business Profile Complete Check
      const missing = [];
      if (!profile.business_name) missing.push('business_name');
      if (!profile.business_logo_url) missing.push('business_logo_url');
      if (missing.length > 0) {
        return res.status(400).json({ 
          error: 'business_profile_incomplete', 
          missing, 
          message: 'Please complete your business profile first' 
        });
      }

      // 4. Fetch Template and Testimonials
      const { data: template } = await supabase.from('video_templates').select('*').eq('id', template_id).single();
      if (!template) return res.status(404).json({ error: 'Template not found' });

      const { data: testimonials } = await supabase
        .from('testimonials')
        .select('*')
        .in('id', testimonial_ids)
        .eq('user_id', userId);

      if (!testimonials || testimonials.length === 0) {
        return res.status(404).json({ error: 'One or more testimonials not found' });
      }

      // 5. Build Creatomate modifications
      const modifications = {
        'business-name': profile.business_name,
        'business-logo': profile.business_logo_url,
        'business-tagline': profile.business_tagline || '',
        'music-style': music_style || 'upbeat'
      };

      testimonials.forEach((t, i) => {
        modifications[`testimonial-${i + 1}-name`] = t.reviewer_name;
        modifications[`testimonial-${i + 1}-role`] = t.reviewer_role || '';
        modifications[`testimonial-${i + 1}-text`] = t.text_content;
        modifications[`testimonial-${i + 1}-rating`] = String(t.rating);
        modifications[`testimonial-${i + 1}-photo`] = t.reviewer_photo_url || '';
      });

      // 6. POST to Creatomate
      const response = await axios.post('https://api.creatomate.com/v1/renders', 
        {
          template_id: template.creatomate_template_id,
          modifications
        },
        { headers: { Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}` } }
      );

      const renderId = response.data[0].id;

      // 7. Save record and update profile
      const { data: savedVideo } = await supabase
        .from('generated_videos')
        .insert({
          user_id: userId,
          creatomate_render_id: renderId,
          status: 'processing',
          template_id,
          template_name: template.name,
          testimonial_ids,
          business_name: profile.business_name,
          business_logo_url: profile.business_logo_url,
          business_tagline: profile.business_tagline,
          music_style: music_style || 'upbeat'
        })
        .select()
        .single();

      await supabase
        .from('profiles')
        .update({ videos_used_this_month: current_videos_used + 1 })
        .eq('id', userId);

      res.status(201).json({ 
        video: { 
          id: savedVideo.id, 
          status: 'processing', 
          estimated_seconds: 20, 
          created_at: savedVideo.created_at 
        } 
      });

    } catch (error) {
      console.error('Error in generateVideo:', error);
      res.status(500).json({ error: 'Video generation failed', details: error.message });
    }
  },

  /**
   * 3. GET /videos/:id/status (requireAuth)
   * Polling endpoint to check render status.
   */
  checkVideoStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      const { data: video, error: findError } = await supabase
        .from('generated_videos')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (findError || !video) return res.status(404).json({ error: 'Video not found' });

      if (video.status !== 'processing') {
        return res.status(200).json({ video });
      }

      // Check Creatomate API
      const response = await axios.get(`https://api.creatomate.com/v1/renders/${video.creatomate_render_id}`, {
        headers: { Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}` }
      });

      const render = response.data;

      if (render.status === 'succeeded') {
        const { data: updated } = await supabase
          .from('generated_videos')
          .update({
            status: 'done',
            video_url: render.url,
            thumbnail_url: render.snapshot_url,
            duration_seconds: Math.round(render.duration),
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single();
        return res.status(200).json({ video: updated });
      }

      if (render.status === 'failed') {
        const { data: updated } = await supabase
          .from('generated_videos')
          .update({
            status: 'failed',
            error_message: render.errorMessage || 'Render failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single();
        return res.status(200).json({ video: updated });
      }

      res.status(200).json({ video });
    } catch (error) {
      console.error('Error in checkVideoStatus:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * 4. GET /videos/history (requireAuth)
   * Retrieves user's video generation history and usage summary.
   */
  getVideoHistory: async (req, res) => {
    try {
      const userId = req.userId;

      // Profile for limits
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
      const plan = profile?.plan || 'free';
      const limit = plan === 'pro' ? 3 : (plan === 'starter' ? 1 : 0);
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      let videos_used = profile.videos_used_this_month || 0;

      if (profile.videos_reset_at && new Date(profile.videos_reset_at) < startOfMonth) {
        videos_used = 0;
      }

      const { data: videos, count } = await supabase
        .from('generated_videos')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      const resets_at = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      res.status(200).json({
        videos,
        videos_used_this_month: videos_used,
        videos_limit: limit,
        videos_remaining: Math.max(0, limit - videos_used),
        resets_at,
        total: count
      });
    } catch (error) {
      console.error('Error in getVideoHistory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = videoController;
