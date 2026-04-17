const supabase = require('../lib/supabase');
const { sendNewTestimonialEmail } = require('../lib/resend');
const { canDoAction } = require('../lib/plans');

const testimonialController = {
  // GET / (requireAuth)
  getAll: async (req, res) => {
    try {
      const { status, source, starred, form_id, search, limit, page } = req.query;
      const userId = req.userId;

      let query = supabase
        .from('testimonials')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (source) query = query.eq('source', source);
      if (starred !== undefined) query = query.eq('is_starred', starred === 'true');
      if (form_id) query = query.eq('form_id', form_id);
      
      if (search) {
        query = query.or(`reviewer_name.ilike.%${search}%,text_content.ilike.%${search}%`);
      }

      if (limit) {
        const p = parseInt(page) || 1;
        const l = parseInt(limit) || 10;
        const from = (p - 1) * l;
        const to = from + l - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const l = parseInt(limit) || 10;
      const totalPages = Math.ceil((count || 0) / l);

      res.status(200).json({ testimonials: data, totalCount: count || 0, totalPages });
    } catch (error) {
      console.error('Error in getAll testimonials:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // POST / (PUBLIC)
  create: async (req, res) => {
    try {
      const {
        form_id, reviewer_name, reviewer_email, reviewer_role,
        reviewer_company, reviewer_photo_url, rating, text_content, video_url
      } = req.body;

      if (!form_id) {
        return res.status(400).json({ error: 'form_id is required' });
      }

      if (!reviewer_name || !rating) {
        return res.status(400).json({ error: 'reviewer_name and rating are required' });
      }

      // 1. Check form exists and is active
      const { data: form, error: formError } = await supabase
        .from('collection_forms')
        .select('*, profiles!inner(plan, email)')
        .eq('id', form_id)
        .single();

      if (formError || !form) {
        return res.status(404).json({ error: 'Form not found or is inactive' });
      }

      if (form.is_active === false) {
        return res.status(400).json({ error: 'Form is not active' });
      }

      const userId = form.user_id;
      // Depending on FK relationship, form.profiles might be an array or single object.
      // Usually !inner gives a single object or array depending on relation. Assuming 1:1 or N:1 relation config:
      const profiles = Array.isArray(form.profiles) ? form.profiles[0] : form.profiles;
      const ownerEmail = profiles?.email;
      const currentPlan = profiles?.plan || 'free';

      // 2. Check plan limit for add_testimonial manually here
      // since it's a public route and we don't have req.userId from auth token.
      const { count: testimonialCount, error: countError } = await supabase
        .from('testimonials')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) throw countError;

      if (!canDoAction(currentPlan, 'add_testimonial', testimonialCount)) {
        return res.status(403).json({ 
          error: 'form_owner_plan_limit_reached',
          message: 'The owner of this form has reached their testimonial plan limit.'
        });
      }

      // 3. Insert testimonial with status = 'pending'
      const insertData = {
        user_id: userId,
        form_id,
        reviewer_name,
        reviewer_email,
        reviewer_role,
        reviewer_company,
        reviewer_photo_url,
        rating,
        text_content,
        video_url,
        status: 'pending', // Enforcing default
        source: 'form'
      };

      const { data: createdTestimonial, error: insertError } = await supabase
        .from('testimonials')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      // 4. Call sendNewTestimonialEmail to notify form owner
      if (ownerEmail) {
        // Run in background 
        sendNewTestimonialEmail(ownerEmail, reviewer_name, form.title || form.name || 'Your Form')
          .catch(err => console.error('Failed to send email:', err));
      }

      res.status(201).json({ testimonial: createdTestimonial });
    } catch (error) {
      console.error('Error in create testimonial:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // POST /manual (requireAuth)
  createManual: async (req, res) => {
    try {
      const userId = req.userId;
      const {
        reviewer_name, reviewer_email, reviewer_role,
        reviewer_company, reviewer_photo_url, rating, text_content, 
        video_url, screenshot_url, created_at
      } = req.body;

      if (!reviewer_name || !rating) {
        return res.status(400).json({ error: 'reviewer_name and rating are required' });
      }

      // 1. Get user plan
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .single();
      
      const currentPlan = profile?.plan || 'free';

      // 2. Check testimonial count limit
      const { count: testimonialCount } = await supabase
        .from('testimonials')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!canDoAction(currentPlan, 'add_testimonial', testimonialCount || 0)) {
        return res.status(403).json({ 
          error: 'plan_limit_reached', 
          message: 'You have reached your testimonial limit.' 
        });
      }

      // 3. Check media limits
      if (video_url && !canDoAction(currentPlan, 'upload_video')) {
        return res.status(403).json({ 
          error: 'video_not_allowed', 
          message: 'Video uploads are only available on the Unlimited Pro plan.' 
        });
      }
      if (screenshot_url && !canDoAction(currentPlan, 'upload_screenshot')) {
        return res.status(403).json({ 
          error: 'screenshot_not_allowed', 
          message: 'Screenshot uploads are only available on Paid plans.' 
        });
      }

      // 4. Insert testimonial
      const insertData = {
        user_id: userId,
        reviewer_name,
        reviewer_email,
        reviewer_role,
        reviewer_company,
        reviewer_photo_url,
        rating,
        text_content,
        video_url,
        screenshot_url,
        source: 'manual',
        status: 'pending',
        created_at: created_at || new Date().toISOString()
      };

      const { data: created, error: insertError } = await supabase
        .from('testimonials')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      res.status(201).json({ testimonial: created });
    } catch (error) {
      console.error('Error in createManual testimonial:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // GET /:id (requireAuth)
  getOne: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      const { data, error } = await supabase
        .from('testimonials')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Testimonial not found' });
      }
      if (error) throw error;

      if (data.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden. Not owned by user.' });
      }

      res.status(200).json({ testimonial: data });
    } catch (error) {
      console.error('Error in getOne testimonial:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // PATCH /:id (requireAuth)
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      const { status, is_starred, reviewer_name, reviewer_role, reviewer_company, text_content } = req.body;

      // Check ownership
      const { data: existing, error: findError } = await supabase
        .from('testimonials')
        .select('user_id')
        .eq('id', id)
        .single();

      if (findError && findError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Testimonial not found' });
      }
      if (findError) throw findError;

      if (existing.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden. Not owned by user.' });
      }

      // Build safe updates object
      const updates = {};
      if (status !== undefined) updates.status = status;
      if (is_starred !== undefined) updates.is_starred = is_starred;
      if (reviewer_name !== undefined) updates.reviewer_name = reviewer_name;
      if (reviewer_role !== undefined) updates.reviewer_role = reviewer_role;
      if (reviewer_company !== undefined) updates.reviewer_company = reviewer_company;
      if (text_content !== undefined) updates.text_content = text_content;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided to update.' });
      }

      const { data: updated, error: updateError } = await supabase
        .from('testimonials')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      res.status(200).json({ testimonial: updated });
    } catch (error) {
      console.error('Error in update testimonial:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // DELETE /:id (requireAuth)
  remove: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      // Check ownership and get video_url
      const { data: existing, error: findError } = await supabase
        .from('testimonials')
        .select('user_id, video_url, screenshot_url')
        .eq('id', id)
        .single();

      if (findError && findError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Testimonial not found' });
      }
      if (findError) throw findError;

      if (existing.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden. Not owned by user.' });
      }

      // Delete associated video from Supabase Storage if video_url exists
      if (existing.video_url) {
        try {
          const urlObj = new URL(existing.video_url);
          const pathParts = urlObj.pathname.split('/');
          const publicIndex = pathParts.indexOf('public');
          if (publicIndex !== -1 && pathParts.length > publicIndex + 2) {
            const bucketName = pathParts[publicIndex + 1];
            const filePath = pathParts.slice(publicIndex + 2).join('/');
            await supabase.storage.from(bucketName).remove([filePath]);
          }
        } catch (err) { console.error('Error deleting video:', err); }
      }

      // Delete associated screenshot from Supabase Storage if screenshot_url exists
      if (existing.screenshot_url) {
        try {
          const urlObj = new URL(existing.screenshot_url);
          const pathParts = urlObj.pathname.split('/');
          const publicIndex = pathParts.indexOf('public');
          if (publicIndex !== -1 && pathParts.length > publicIndex + 2) {
            const bucketName = pathParts[publicIndex + 1];
            const filePath = pathParts.slice(publicIndex + 2).join('/');
            await supabase.storage.from(bucketName).remove([filePath]);
          }
        } catch (err) { console.error('Error deleting screenshot:', err); }
      }

      // Delete DB record
      const { error: deleteError } = await supabase
        .from('testimonials')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error in remove testimonial:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = testimonialController;