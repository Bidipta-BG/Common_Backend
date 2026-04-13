const supabase = require('../lib/supabase');
const { generateUniqueSlug } = require('../lib/utils');
const { canDoAction, canUseStyle } = require('../lib/plans');

const formController = {
  // GET / (requireAuth)
  getAll: async (req, res) => {
    try {
      const userId = req.userId;
      
      const { data, error } = await supabase
        .from('collection_forms')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.status(200).json({ forms: data });
    } catch (error) {
      console.error('Error in getAll forms:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // POST / (requireAuth)
  create: async (req, res) => {
    try {
      const userId = req.userId;
      const {
        title,
        welcome_message,
        thank_you_message,
        collect_video = true,
        style = 'classic',
        // Field visibility toggles
        show_email   = true,
        show_role    = true,
        show_company = true,
        show_photo   = true,
        button_text  = 'Submit Testimonial',
      } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'title is required' });
      }

      // 1. Get User Profile to evaluate limits
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      const currentPlan = profile?.plan || 'free';

      // 2. Check: is the requested style unlocked for this plan?
      if (!canUseStyle(currentPlan, style)) {
        return res.status(403).json({
          error: 'style_not_allowed',
          message: `The '${style}' form style requires a higher plan. Please upgrade to use it.`
        });
      }

      // 3. Extrapolate active Form Count
      const { count: formCount, error: countError } = await supabase
        .from('collection_forms')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) throw countError;

      if (!canDoAction(currentPlan, 'add_form', formCount)) {
        return res.status(403).json({ 
          error: 'plan_limit_reached',
          message: 'You have reached your form limit for the current plan.'
        });
      }

      // 4. Assemble Slug && Write properties
      const slug = generateUniqueSlug();

      const insertData = {
        user_id: userId,
        title,
        welcome_message,
        thank_you_message,
        collect_video: !!collect_video,
        slug,
        style,
        is_active: true,
        // Field visibility
        show_email:   !!show_email,
        show_role:    !!show_role,
        show_company: !!show_company,
        show_photo:   !!show_photo,
        button_text,
      };

      const { data: createdForm, error: insertError } = await supabase
        .from('collection_forms')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      res.status(201).json({ form: createdForm });
    } catch (error) {
      console.error('Error in create form:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // GET /:id (NO requireAuth middleware)
  getOne: async (req, res) => {
    try {
      const { id } = req.params;
      const authHeader = req.headers.authorization;
      
      // Allow fetching by precise UUID vs Slug mappings appropriately
      let query = supabase.from('collection_forms').select('*');
        
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
      if (isUUID) {
        query = query.eq('id', id);
      } else {
        query = query.eq('slug', id);
      }

      const { data: form, error } = await query.single();

      if (error && error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Form not found' });
      }
      if (error) throw error;

      let userId = null;

      // Manually verify JWT header gracefully if passed
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          userId = user.id;
        }
      }

      // CASE 1: Has valid Auth Token corresponding to target row Object user
      if (userId && form.user_id === userId) {
        return res.status(200).json({ form });
      }

      // CASE 2: No/Unprivileged auth — expose only fields needed by the public template renderer.
      // Field visibility settings are intentionally included so templates can show/hide fields correctly.

      // Fetch business logo URL from form owner's profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('business_logo_url')
        .eq('id', form.user_id)
        .single();

      const publicForm = {
        id:                form.id,
        title:             form.title,
        welcome_message:   form.welcome_message,
        thank_you_message: form.thank_you_message,
        is_active:         form.is_active,
        slug:              form.slug,
        style:             form.style        || 'classic',
        collect_video:     form.collect_video ?? true,
        show_email:        form.show_email    ?? true,
        show_role:         form.show_role     ?? true,
        show_company:      form.show_company  ?? true,
        show_photo:        form.show_photo    ?? true,
        show_logo:         form.show_logo     ?? false,
        button_text:       form.button_text   || 'Submit Testimonial',
        business_logo_url: profile?.business_logo_url || null,
      };

      res.status(200).json({ form: publicForm });
    } catch (error) {
      console.error('Error in getOne form:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // PATCH /:id (requireAuth)
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      const {
        title, welcome_message, thank_you_message,
        collect_video, is_active, style,
        show_email, show_role, show_company, show_photo, button_text,
      } = req.body;

      // Check ownership
      const { data: existing, error: findError } = await supabase
        .from('collection_forms')
        .select('user_id')
        .eq('id', id)
        .single();

      if (findError && findError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Form not found' });
      }
      if (findError) throw findError;

      if (existing.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden. Not owned by user.' });
      }

      // If style is being changed, validate the plan allows it
      if (style !== undefined) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', userId)
          .single();

        const currentPlan = profile?.plan || 'free';

        if (!canUseStyle(currentPlan, style)) {
          return res.status(403).json({
            error: 'style_not_allowed',
            message: `The '${style}' form style requires a higher plan.`
          });
        }
      }

      const updates = {};
      if (title !== undefined)             updates.title = title;
      if (welcome_message !== undefined)   updates.welcome_message = welcome_message;
      if (thank_you_message !== undefined) updates.thank_you_message = thank_you_message;
      if (collect_video !== undefined)     updates.collect_video = !!collect_video;
      if (is_active !== undefined)         updates.is_active = is_active;
      if (style !== undefined)             updates.style = style;
      // Field visibility toggles
      if (show_email !== undefined)        updates.show_email   = !!show_email;
      if (show_role !== undefined)         updates.show_role    = !!show_role;
      if (show_company !== undefined)      updates.show_company = !!show_company;
      if (show_photo !== undefined)        updates.show_photo   = !!show_photo;
      if (button_text !== undefined)       updates.button_text  = button_text;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided to update.' });
      }

      const { data: updated, error: updateError } = await supabase
        .from('collection_forms')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      res.status(200).json({ form: updated });
    } catch (error) {
      console.error('Error in update form:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // DELETE /:id (requireAuth)
  remove: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      // Ownership enforcement
      const { data: existing, error: findError } = await supabase
        .from('collection_forms')
        .select('user_id')
        .eq('id', id)
        .single();

      if (findError && findError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Form not found' });
      }
      if (findError) throw findError;

      if (existing.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden. Not owned by user.' });
      }

      // Explicitly deleting form. Associated testimonials usually handle themselves smoothly under Supabase references without manual intervention required per db structure constraints. 
      const { error: deleteError } = await supabase
        .from('collection_forms')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error in remove form:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = formController;