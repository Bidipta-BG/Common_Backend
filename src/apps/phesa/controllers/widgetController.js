const supabase = require('../lib/supabase');
const { canDoAction } = require('../lib/plans');

const widgetController = {
  getAll: async (req, res) => {
    try {
      const { data: widgets, error: widgetsError } = await supabase
        .from('widgets')
        .select('*')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false });

      if (widgetsError) throw widgetsError;

      // Fetch view counts for the last 30 days for each widget
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: analytics, error: analyticsError } = await supabase
        .from('widget_analytics')
        .select('widget_id')
        .in('widget_id', widgets.map(w => w.id))
        .gte('viewed_at', thirtyDaysAgo.toISOString());

      if (analyticsError) {
        console.error('Error fetching analytics:', analyticsError);
        // Fallback: return widgets with 0 views if analytics fails
        return res.status(200).json({
          widgets: widgets.map(w => ({ ...w, view_count: 0 }))
        });
      }

      // Map counts to widgets
      const viewCounts = (analytics || []).reduce((acc, curr) => {
        acc[curr.widget_id] = (acc[curr.widget_id] || 0) + 1;
        return acc;
      }, {});

      const widgetsWithViews = widgets.map(widget => ({
        ...widget,
        view_count: viewCounts[widget.id] || 0
      }));

      res.status(200).json({ widgets: widgetsWithViews });
    } catch (error) {
      console.error('Error getAll widgets:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // POST / (requireAuth)
  create: async (req, res) => {
    try {
      const { name, type, theme, show_ratings, show_photos, max_items } = req.body;
      const userId = req.userId;

      if (!name) return res.status(400).json({ error: 'name is required' });

      // Check limits
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', userId).single();
      const currentPlan = profile?.plan || 'free';

      const { count: widgetCount } = await supabase
        .from('widgets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!canDoAction(currentPlan, 'add_widget', widgetCount)) {
        return res.status(403).json({ error: 'plan_limit_reached' });
      }

      const { data, error } = await supabase
        .from('widgets')
        .insert({
          user_id: userId,
          name,
          type: type || 'wall', // 'wall' or 'carousel'
          theme: theme || 'light',
          show_ratings: show_ratings !== false,
          show_photos: show_photos !== false,
          max_items: max_items || 10
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ widget: data });
    } catch (error) {
      console.error('Error creating widget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // GET /:id (requireAuth)
  getOne: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('widgets')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error && error.code === 'PGRST116') return res.status(404).json({ error: 'Not found' });
      if (error) throw error;

      if (data.user_id !== req.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      res.status(200).json({ widget: data });
    } catch (error) {
      console.error('Error getOne widget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // PATCH /:id (requireAuth)
  update: async (req, res) => {
    try {
      const { data: existing } = await supabase
        .from('widgets')
        .select('user_id')
        .eq('id', req.params.id)
        .single();

      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

      // Build safe updates payload
      const updates = { ...req.body };
      delete updates.id;
      delete updates.user_id;
      delete updates.created_at;

      const { data, error } = await supabase
        .from('widgets')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.status(200).json({ widget: data });
    } catch (error) {
      console.error('Error updating widget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // DELETE /:id (requireAuth)
  remove: async (req, res) => {
    try {
      const { data: existing } = await supabase
        .from('widgets')
        .select('user_id')
        .eq('id', req.params.id)
        .single();

      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

      await supabase.from('widgets').delete().eq('id', req.params.id);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting widget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // GET /:id/testimonials (PUBLIC)
  getPublicTestimonials: async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      res.setHeader('Access-Control-Allow-Origin', '*');

      let widgetId = req.params.id;
      if (widgetId.endsWith('.js')) {
        widgetId = widgetId.replace('.js', '');
      }

      const { data: widget } = await supabase
        .from('widgets')
        .select('user_id, max_items')
        .eq('id', widgetId)
        .single();

      if (!widget) return res.status(404).json({ error: 'Widget not found' });

      // Fetch only approved, apply widget max_items
      const { data: testimonials } = await supabase
        .from('testimonials')
        .select('id, reviewer_name, reviewer_role, reviewer_company, reviewer_photo_url, rating, text_content, video_url, created_at')
        .eq('user_id', widget.user_id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(widget.max_items || 10);

      res.status(200).json({ testimonials: testimonials || [] });
    } catch (error) {
      console.error('Error fetching public widget testimonials:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // GET /:id.js (PUBLIC)
  serveScript: async (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');

      let widgetId = req.params.id;
      // Strip out `.js` mapping fallback 
      if (widgetId.endsWith('.js')) {
        widgetId = widgetId.replace('.js', '');
      }

      // 1. Fetch Widget Settings and attached Plan
      const { data: widget } = await supabase
        .from('widgets')
        .select('*, profiles!inner(plan)')
        .eq('id', widgetId)
        .single();

      if (!widget) {
        return res.send(`console.warn("Phesa Widget: Not found for ID ${widgetId}");`);
      }

      // 2. Fetch highly vetted Approved Testimonials based on owner
      const { data: testimonials } = await supabase
        .from('testimonials')
        .select('reviewer_name, reviewer_role, reviewer_company, reviewer_photo_url, rating, text_content, video_url, screenshot_url')
        .eq('user_id', widget.user_id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(widget.max_items || 10);

      const tests = testimonials || [];
      const plan = Array.isArray(widget.profiles) ? widget.profiles[0]?.plan : widget.profiles?.plan;
      const brandingOn = (plan === 'free');

      // 3. Log analytics view (use valid columns: widget_id, user_id, viewed_at is auto-set)
      supabase.from('widget_analytics')
        .insert({ widget_id: widgetId, user_id: widget.user_id })
        .then()
        .catch(() => { });

      // 4. Construct isolated shadow dom script
      const script = `
        (function() {
          const container = document.getElementById('phesa-widget');
          if (!container) return;
          
          // Inject Google Font into main document head for reliable loading
          if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Bricolage+Grotesque"]')) {
            const fontLink = document.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap';
            document.head.appendChild(fontLink);
          }
          
          const shadow = container.attachShadow({ mode: 'open' });
          const style = document.createElement('style');
          
          const theme = ${JSON.stringify(widget.theme)};
          const isDark = theme === 'dark';
          const bg = isDark ? '#1a1a1a' : '#ffffff';
          const text = isDark ? '#f0f0f0' : '#333333';
          const cardBg = isDark ? '#262626' : '#f9f9f9';
          const border = isDark ? '#334155' : '#eee';
           
           // --- Styles ---
           let styleText = \`
             :host { display: block; width: 100%; font-family: 'Bricolage Grotesque', system-ui, -apple-system, sans-serif; box-sizing: border-box; }
             .phesa-wrapper { background: \${bg}; color: \${text}; padding: 1rem; border-radius: 12px; font-family: 'Bricolage Grotesque', system-ui, -apple-system, sans-serif; }
             .phesa-branding { text-align: center; margin-top: 20px; font-size: 12px; }
             .phesa-branding a { color: #0f3460; text-decoration: none; font-weight: bold; }
           \`;

           const type = ${JSON.stringify(widget.type)};

           if (type === 'minimal-centered') {
             styleText += \`
               :host {
                 --phesa-bg: \${isDark ? '#0f172a' : '#ffffff'};
                 --phesa-text: \${isDark ? '#f9fafb' : '#111111'};
                 --phesa-subtext: \${isDark ? '#9ca3af' : '#6b7280'};
                 --phesa-accent: #ef4444;
               }
               .phesa-wrapper {
                 display: grid;
                 gap: 64px;
                 justify-content: center;
                 padding: 40px 20px;
                 background: var(--phesa-bg);
               }
               .phesa-card {
                 max-width: 768px;
                 text-align: center;
                 color: var(--phesa-text);
               }
               .phesa-avatar {
                 width: 56px;
                 height: 56px;
                 border-radius: 50%;
                 object-fit: cover;
                 margin: 0 auto 24px;
                 box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                 border: 2px solid transparent;
               }
               .phesa-text {
                 font-size: 1.25rem;
                 line-height: 1.6;
                 font-weight: 700;
                 margin-bottom: 24px;
                 font-style: italic;
                 letter-spacing: -0.025em;
               }
               .phesa-stars {
                 color: var(--phesa-accent);
                 font-size: 20px;
                 margin-bottom: 8px;
               }
               .phesa-meta {
                 margin-top: 24px;
               }
               .phesa-name {
                 font-weight: 600;
                 font-size: 16px;
                 color: var(--phesa-text);
                 display: block;
               }
               .phesa-role {
                 color: var(--phesa-subtext);
                 font-size: 14px;
                 margin-top: 4px;
                 display: block;
               }
               @media (min-width: 768px) {
                 .phesa-text { font-size: 1.5rem; }
               }
             \`;
           } else if (type === 'modern-slider') {
              styleText += \`
                :host {
                  --phesa-bg: #ffffff;
                  --phesa-card-bg: #f9fafb;
                  --phesa-text: #111827;
                  --phesa-subtext: #6b7280;
                  --phesa-accent: #f59e0b;
                  --phesa-primary: #3b82f6;
                  font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                :host(.phesa-dark) {
                  --phesa-bg: #0f172a;
                  --phesa-card-bg: #1e293b;
                  --phesa-text: #f9fafb;
                  --phesa-subtext: #94a3b8;
                  --phesa-primary: #2563eb;
                }
                .phesa-wrapper {
                  background: var(--phesa-bg);
                  padding: 24px;
                  border-radius: 12px;
                }
                .phesa-card {
                  max-width: 720px;
                  margin: 0 auto;
                  background: var(--phesa-card-bg);
                  border-radius: 16px;
                  overflow: hidden;
                  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .phesa-header {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  background: var(--phesa-primary);
                  color: #fff;
                  padding: 16px 24px;
                }
                .phesa-user {
                  display: flex;
                  align-items: center;
                  gap: 12px;
                }
                .phesa-avatar {
                  width: 48px;
                  height: 48px;
                  border-radius: 8px;
                  object-fit: cover;
                  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                  background: rgba(255,255,255,0.1);
                }
                .phesa-name {
                  font-weight: 600;
                }
                .phesa-role {
                  font-size: 13px;
                  opacity: 0.9;
                }
                .phesa-nav {
                  display: flex;
                  gap: 8px;
                }
                .phesa-btn {
                  width: 32px;
                  height: 32px;
                  border-radius: 50%;
                  border: none;
                  cursor: pointer;
                  background: rgba(255,255,255,0.2);
                  color: #fff;
                  font-size: 16px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  transition: background 0.2s ease;
                  padding: 0;
                }
                .phesa-btn:hover {
                  background: rgba(255,255,255,0.35);
                }
                .phesa-btn svg {
                  width: 16px;
                  height: 16px;
                }
                .phesa-body {
                  padding: 24px;
                }
                .phesa-stars {
                  color: var(--phesa-accent);
                  margin-bottom: 12px;
                  font-size: 18px;
                }
                .phesa-text {
                  font-size: 15px;
                  line-height: 1.6;
                  color: var(--phesa-text);
                  font-style: italic;
                }
              \`;
           } else if (type === 'flip-card') {
             styleText += \`
               :host {
                 --phesa-bg: #f3f4f6;
                 --phesa-card-bg: #ffffff;
                 --phesa-text: #111827;
                 --phesa-subtext: #6b7280;
                 --phesa-accent: #f59e0b;
                 font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
               }
               :host(.phesa-dark) {
                 --phesa-bg: #0f172a;
                 --phesa-card-bg: #1e293b;
                 --phesa-text: #f9fafb;
                 --phesa-subtext: #94a3b8;
               }
               * { box-sizing: border-box; }
               .phesa-wrapper {
                 background: var(--phesa-bg);
                 padding: 30px;
                 overflow: hidden;
                 border-radius: 12px;
               }
               .phesa-row {
                 display: flex;
                 gap: 20px;
                 overflow-x: auto;
                 scroll-behavior: smooth;
                 padding: 20px 0;
                 perspective: 2000px;
               }
               .phesa-row::-webkit-scrollbar { height: 6px; }
               .phesa-row::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
               :host(.phesa-dark) .phesa-row::-webkit-scrollbar-thumb { background: #334155; }
               
               .phesa-card {
                 width: 240px;
                 height: 320px;
                 flex-shrink: 0;
                 position: relative;
               }
               .phesa-card:hover {
                 z-index: 10;
               }
               .phesa-inner {
                 width: 100%;
                 height: 100%;
                 position: relative;
                 transform-style: preserve-3d;
                 transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                 transform-origin: center;
               }
               .phesa-card:hover .phesa-inner {
                 transform: rotateY(180deg);
               }
               .phesa-front, .phesa-back {
                 position: absolute;
                 width: 100%;
                 height: 100%;
                 border-radius: 14px;
                 overflow: hidden;
                 backface-visibility: hidden;
                 background: var(--phesa-card-bg);
                 box-shadow: 0 6px 20px rgba(0,0,0,0.08);
               }
               .phesa-front { display: flex; flex-direction: column; justify-content: flex-end; }
               .phesa-img { position: absolute; inset: 0; }
               .phesa-img img { width: 100%; height: 100%; object-fit: cover; }
               .phesa-overlay {
                 position: relative;
                 padding: 14px;
                 background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
                 color: #fff;
               }
               .phesa-stars { color: var(--phesa-accent); font-size: 14px; margin-bottom: 6px; }
               .phesa-name { font-weight: 600; font-size: 15px; }
               .phesa-role { font-size: 12px; opacity: 0.85; }
               .phesa-back {
                 transform: rotateY(180deg);
                 padding: 16px;
                 display: flex;
                 flex-direction: column;
               }
               .phesa-back-name { font-weight: 600; margin-bottom: 4px; color: var(--phesa-text); font-size: 14px; }
               .phesa-back-role { font-size: 11px; color: var(--phesa-subtext); margin-bottom: 12px; }
               .phesa-text { font-size: 13px; line-height: 1.5; color: var(--phesa-text); overflow-y: auto; flex: 1; font-style: italic; }
               .phesa-video-link { margin-top: 10px; background: #3b82f6; color: white; text-align: center; padding: 6px; border-radius: 6px; font-size: 11px; font-weight: bold; text-decoration: none; }
             \`;
           } else if (type === 'marquee') {
             styleText += \`
               :host {
                 --phesa-bg: #f3f4f6;
                 --phesa-card-bg: #ffffff;
                 --phesa-text: #111827;
                 --phesa-subtext: #6b7280;
                 --phesa-border: #e5e7eb;
                 --phesa-accent: #f59e0b;
                 font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
               }
               :host(.phesa-dark) {
                 --phesa-bg: #0f172a;
                 --phesa-card-bg: #1e293b;
                 --phesa-text: #f9fafb;
                 --phesa-subtext: #94a3b8;
                 --phesa-border: #334155;
               }
               .phesa-wrapper {
                 background: var(--phesa-bg);
                 padding: 30px 0;
                 display: flex;
                 flex-direction: column;
                 gap: 20px;
                 overflow: hidden;
                 border-radius: 12px;
               }
               .phesa-row {
                 display: flex;
                 gap: 20px;
                 width: max-content;
               }
               @keyframes phesa-scroll-left { 0% { transform: translateX(0); } 100% { transform: translateX(-33.33%); } }
               @keyframes phesa-scroll-right { 0% { transform: translateX(-33.33%); } 100% { transform: translateX(0); } }
               .phesa-row-left { animation: phesa-scroll-left 30s linear infinite; }
               .phesa-row-right { animation: phesa-scroll-right 30s linear infinite; }
               .phesa-wrapper:hover .phesa-row { animation-play-state: paused; }
               .phesa-card {
                 width: 260px;
                 background: var(--phesa-card-bg);
                 border-radius: 12px;
                 border: 1px solid var(--phesa-border);
                 padding: 14px;
                 display: flex;
                 flex-direction: column;
                 justify-content: space-between;
                 flex-shrink: 0;
                 white-space: normal;
               }
               .phesa-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
               .phesa-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
               .phesa-name { font-size: 14px; font-weight: 600; color: var(--phesa-text); }
               .phesa-role { font-size: 11px; color: var(--phesa-subtext); }
               .phesa-stars { color: var(--phesa-accent); font-size: 13px; margin: 6px 0; }
               .phesa-text { font-size: 13px; color: var(--phesa-text); line-height: 1.5; font-style: italic; }
             \`;
           } else if (type === 'pills') {
             styleText += \`
               :host {
                 --phesa-bg: #f9fafb;
                 --phesa-pill-bg: #ffffff;
                 --phesa-text: #111827;
                 --phesa-subtext: #6b7280;
                 --phesa-border: #e5e7eb;
                 font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
               }
               :host(.phesa-dark) {
                 --phesa-bg: #0f172a;
                 --phesa-pill-bg: #1e293b;
                 --phesa-text: #f9fafb;
                 --phesa-subtext: #94a3b8;
                 --phesa-border: #334155;
               }
               .phesa-wrapper {
                 background: var(--phesa-bg);
                 padding: 16px 0;
                 display: flex;
                 flex-direction: column;
                 gap: 12px;
                 overflow: hidden;
                 border-radius: 12px;
               }
               .phesa-row {
                 display: flex;
                 gap: 14px;
                 width: max-content;
               }
               @keyframes phesa-pill-left { 0% { transform: translateX(0); } 100% { transform: translateX(-33.33%); } }
               @keyframes phesa-pill-right { 0% { transform: translateX(-33.33%); } 100% { transform: translateX(0); } }
               .phesa-row-left { animation: phesa-pill-left 40s linear infinite; }
               .phesa-row-right { animation: phesa-pill-right 40s linear infinite; }
               .phesa-wrapper:hover .phesa-row { animation-play-state: paused; }
               .phesa-pill {
                 display: inline-flex;
                 align-items: center;
                 gap: 10px;
                 padding: 8px 14px;
                 background: var(--phesa-pill-bg);
                 border: 1px solid var(--phesa-border);
                 border-radius: 999px;
                 white-space: nowrap;
                 flex-shrink: 0;
               }
               .phesa-avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
               .phesa-text { font-size: 13px; color: var(--phesa-text); }
               .phesa-quote { font-size: 14px; color: var(--phesa-subtext); margin-left: 6px; }
             \`;
           } else if (type === 'screenshot-grid') {
             styleText += \`
               :host {
                 --phesa-bg: #f5f6f8;
                 --phesa-card-bg: #ffffff;
                 --phesa-text: #111827;
                 --phesa-subtext: #6b7280;
                 --phesa-border: #e5e7eb;
                 --phesa-accent: #7c3aed;
                 font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
               }
               :host(.phesa-dark) {
                 --phesa-bg: #0f172a;
                 --phesa-card-bg: #1e293b;
                 --phesa-text: #f9fafb;
                 --phesa-subtext: #94a3b8;
                 --phesa-border: #334155;
               }
               .phesa-wrapper { background: var(--phesa-bg); padding: 24px; border-radius: 12px; }
               .phesa-grid { 
                 columns: 3 280px; 
                 column-gap: 20px; 
               }
               .phesa-card {
                 break-inside: avoid;
                 margin-bottom: 20px;
                 background: var(--phesa-card-bg);
                 border: 1px solid var(--phesa-border);
                 border-radius: 12px;
                 padding: 14px;
                 display: flex;
                 flex-direction: column;
                 gap: 10px;
                 box-shadow: 0 4px 14px rgba(0,0,0,0.04);
               }
               .phesa-header { display: flex; align-items: center; gap: 10px; }
               .phesa-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
               .phesa-name { font-weight: 600; font-size: 14px; color: var(--phesa-text); }
               .phesa-role { font-size: 12px; color: var(--phesa-subtext); }
               .phesa-stars { color: #f59e0b; font-size: 14px; }
               .phesa-text { font-size: 13px; line-height: 1.5; color: var(--phesa-text); }
               .phesa-media { border-radius: 10px; overflow: hidden; border: 1px solid var(--phesa-border); margin-top: 4px; }
               .phesa-media img { width: 100%; display: block; }
               .phesa-footer { font-size: 11px; color: var(--phesa-subtext); }
             \`;
           } else if (type === 'split-blocks') {
             styleText += \`
               :host {
                 --phesa-subtext: #6b7280;
                 --phesa-yellow: #fff200;
                 --phesa-dynamic-bg: #ffffff;
                 --phesa-dynamic-text: #000000;
                 font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
               }
               :host(.phesa-dark) {
                 --phesa-bg: #0f172a;
                 --phesa-dynamic-bg: #000000;
                 --phesa-dynamic-text: #ffffff;
                 --phesa-text: #f9fafb;
               }
               .phesa-wrapper { background: var(--phesa-bg); border-radius: 16px; overflow: hidden; }
               .phesa-grid { display: grid; grid-template-columns: repeat(2, 1fr); }
               .phesa-card { display: contents; }
               .phesa-block { aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center; padding: 30px; box-sizing: border-box; }
               .phesa-image { padding: 0; }
               .phesa-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
               .phesa-text-block { flex-direction: column; text-align: left; align-items: flex-start; }
               .phesa-yellow { background: var(--phesa-yellow); color: #000; }
               .phesa-dynamic { background: var(--phesa-dynamic-bg); color: var(--phesa-dynamic-text); }
               .phesa-quote { font-size: 19px; font-weight: 600; line-height: 1.6; margin-bottom: 20px; font-style: italic; }
               .phesa-name { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
               .phesa-role { font-size: 12px; opacity: 0.7; margin-top: 4px; }
               @media (max-width: 768px) {
                 .phesa-grid { grid-template-columns: 1fr; }
                 .phesa-block { aspect-ratio: 1 / 1; }
               }
             \`;
           } else if (type === 'video-rows') {
             styleText += \`
               :host {
                 --phesa-bg: #ffffff;
                 --phesa-text: #1a1a1a;
                 --phesa-subtext: #6b7280;
                 --phesa-accent: #7c3aed;
                 --phesa-card-bg: #ffffff;
                 --phesa-border: #e5e7eb;
                 font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
               }
               :host(.phesa-dark) {
                 --phesa-bg: #0f172a;
                 --phesa-text: #f1f5f9;
                 --phesa-subtext: #94a3b8;
                 --phesa-card-bg: #1e293b;
                 --phesa-border: #334155;
               }
               .phesa-container { display: grid; gap: 20px; }
               .phesa-card { display: flex; gap: 16px; background: var(--phesa-card-bg); border: 1px solid var(--phesa-border); border-radius: 16px; padding: 16px; align-items: flex-start; }
               .phesa-video { position: relative; width: 120px; height: 120px; min-width: 120px; border-radius: 12px; overflow: hidden; cursor: pointer; background: #eee; text-decoration: none; display: block; }
               .phesa-video img { width: 100%; height: 100%; object-fit: cover; }
               .phesa-play-btn { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
               .phesa-play-btn::before { content: ""; width: 40px; height: 40px; background: rgba(0,0,0,0.6); border-radius: 50%; position: absolute; }
               .phesa-play-btn::after { content: ""; border-left: 12px solid white; border-top: 8px solid transparent; border-bottom: 8px solid transparent; margin-left: 4px; position: relative; }
               .phesa-content { flex: 1; }
               .phesa-quote-icon { font-size: 24px; color: var(--phesa-accent); margin-bottom: 6px; line-height: 1; opacity: 0.5; }
               .phesa-text { font-size: 15px; line-height: 1.6; color: var(--phesa-text); }
               .phesa-user { margin-top: 10px; }
               .phesa-name { font-weight: 600; font-size: 14px; color: var(--phesa-text); }
               .phesa-role { font-size: 13px; color: var(--phesa-subtext); }
               @media (max-width: 600px) {
                 .phesa-card { flex-direction: column; }
                 .phesa-video { width: 100%; height: 180px; }
               }
               .phesa-lightbox { display: none; position: fixed; inset: 0; z-index: 999999; background: rgba(0,0,0,0.88); align-items: center; justify-content: center; }
               .phesa-lightbox.phesa-open { display: flex; }
               .phesa-lightbox-inner { position: relative; width: 90vw; max-width: 860px; }
               .phesa-lightbox-inner video { width: 100%; border-radius: 12px; max-height: 80vh; background: #000; }
               .phesa-lightbox-close { position: absolute; top: -14px; right: -14px; width: 32px; height: 32px; border-radius: 50%; background: #fff; border: none; cursor: pointer; font-size: 18px; line-height: 32px; text-align: center; color: #111; font-weight: bold; z-index: 10; }
             \`;
           } else if (type === 'avatar-select') {
              styleText += \`
                :host {
                  --phesa-bg: \${isDark ? '#0f172a' : '#f5f6f8'};
                  --phesa-card-bg: \${isDark ? '#1e293b' : '#ffffff'};
                  --phesa-text: \${text};
                  --phesa-subtext: \${isDark ? '#94a3b8' : '#6b7280'};
                  --phesa-accent: #22c55e;
                  --phesa-border: \${isDark ? '#334155' : '#e5e7eb'};
                  font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .phesa-wrapper { background: var(--phesa-bg); padding: 24px; border-radius: 12px; }
                .phesa-container { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; align-items: stretch; }
                .phesa-left { background: var(--phesa-card-bg); border-radius: 12px; padding: 30px; display: flex; flex-direction: column; justify-content: center; border: 1px solid var(--phesa-border); }
                .phesa-quote { font-size: 32px; color: var(--phesa-accent); margin-bottom: 12px; line-height: 1; }
                .phesa-text { font-size: 18px; line-height: 1.6; color: var(--phesa-text); margin-bottom: 20px; font-style: italic; }
                .phesa-name { font-weight: 600; font-size: 14px; color: var(--phesa-text); }
                .phesa-role { font-size: 12px; color: var(--phesa-subtext); }
                .phesa-right { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; align-content: start; }
                .phesa-avatar-box { width: 100%; aspect-ratio: 1/1; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all 0.2s ease; background: #ddd; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #555; }
                .phesa-avatar-box img { width: 100%; height: 100%; object-fit: cover; }
                .phesa-avatar-box:hover { transform: scale(1.05); }
                .phesa-avatar-box.phesa-active { border-color: var(--phesa-accent); box-shadow: 0 0 10px rgba(34, 197, 94, 0.2); }
                @media (max-width: 768px) {
                  .phesa-container { grid-template-columns: 1fr; }
                  .phesa-right { grid-template-columns: repeat(5, 1fr); }
                }
              \`;
            } else if (type === 'avatar-list') {
              styleText += \`
                :host {
                  --phesa-bg: \${isDark ? '#0f172a' : '#f5f6f8'};
                  --phesa-card-bg: \${isDark ? '#1e293b' : '#ffffff'};
                  --phesa-text: \${isDark ? '#f9fafb' : '#111827'};
                  --phesa-subtext: \${isDark ? '#94a3b8' : '#6b7280'};
                  --phesa-accent: #f59e0b;
                  --phesa-border: \${isDark ? '#334155' : '#e5e7eb'};
                  font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .phesa-wrapper { background: var(--phesa-bg); padding: 20px; border-radius: 12px; position: relative; overflow: visible; z-index: 9999; }
                .phesa-avatar-row { display: flex; flex-wrap: nowrap; gap: 6px; justify-content: center; overflow: hidden; }
                .phesa-avatar-item { width: 52px; height: 52px; border-radius: 50%; overflow: hidden; flex-shrink: 0; cursor: pointer; border: 2px solid transparent; transition: all 0.2s ease; background: \${isDark ? '#1e293b' : '#fff'}; display: flex; align-items: center; justify-content: center; font-weight: bold; color: \${isDark ? '#94a3b8' : '#64748b'}; }
                .phesa-avatar-item img { width: 100%; height: 100%; object-fit: cover; }
                .phesa-avatar-item:hover { transform: scale(1.08); }
                .phesa-avatar-item.phesa-active { border-color: var(--phesa-accent); box-shadow: 0 0 8px rgba(245, 158, 11, 0.3); }
                .phesa-active-card { 
                  position: absolute; 
                  top: calc(100% + 12px); 
                  left: 50%; 
                  transform: translateX(-50%); 
                  z-index: 9999;
                  background: var(--phesa-card-bg); 
                  border: 1px solid var(--phesa-border); 
                  border-radius: 12px; 
                  padding: 16px; 
                  width: 320px;
                  box-shadow: 0 20px 40px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.15); 
                  visibility: hidden;
                  opacity: 0;
                  transition: all 0.3s ease;
                }
                .phesa-active-card.phesa-show {
                  visibility: visible;
                  opacity: 1;
                  transform: translateX(-50%) translateY(5px);
                }
                .phesa-active-card::after {
                  content: "";
                  position: absolute;
                  bottom: 100%;
                  left: 50%;
                  transform: translateX(-50%);
                  border: 8px solid transparent;
                  border-bottom-color: var(--phesa-card-bg);
                }
                .phesa-stars { color: var(--phesa-accent); font-size: 16px; margin-bottom: 8px; }
                .phesa-text { font-size: 14px; line-height: 1.6; color: var(--phesa-text); margin-bottom: 12px; font-style: italic; }
                .phesa-name { font-weight: 600; font-size: 13px; color: var(--phesa-text); }
                .phesa-role { font-size: 11px; color: var(--phesa-subtext); }
              \`;
            } else if (type === 'carousel') {
              styleText += \`
                :host {
                  --phesa-bg: \${bg};
                  --phesa-card-bg: \${cardBg};
                  --phesa-text: \${isDark ? '#e5e7eb' : '#1f2937'};
                  --phesa-subtext: \${isDark ? '#9ca3af' : '#6b7280'};
                  --phesa-accent: #f59e0b;
                  --phesa-border: \${border};
                  font-family: 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .phesa-wrapper { 
                  background: var(--phesa-bg); 
                  padding: 48px 20px; 
                  border-radius: 16px; 
                  border: 1px solid var(--phesa-border);
                  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
                  position: relative;
                  overflow: hidden;
                }
                .phesa-carousel { position: relative; overflow: hidden; width: 100%; }
                .phesa-track { display: flex; transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
                .phesa-slide { min-width: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; text-align: center; }
                
                .phesa-card-carousel { max-width: 700px; padding: 0 40px; display: flex; flex-direction: column; align-items: center; }
                .phesa-stars { color: #facc15; font-size: 28px; margin-bottom: 32px; display: flex; gap: 6px; justify-content: center; }
                .phesa-text { 
                  font-size: 1.25rem; 
                  line-height: 1.6; 
                  font-weight: 500; 
                  margin-bottom: 40px; 
                  color: var(--phesa-text); 
                  letter-spacing: -0.025em; 
                }
                .phesa-footer { display: flex; align-items: center; gap: 16px; margin-top: auto; }
                .phesa-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
                .phesa-meta { text-align: left; }
                .phesa-name { font-weight: 700; font-size: 15px; margin: 0; color: \${isDark ? '#fff' : '#111827'}; }
                .phesa-role { font-size: 13px; color: var(--phesa-subtext); margin: 2px 0 0; font-weight: 500; }
                
                .phesa-arrow { 
                  position: absolute; 
                  top: 50%; 
                  transform: translateY(-50%); 
                  width: 40px; 
                  height: 40px; 
                  background: \${isDark ? '#1e293b' : '#ffffff'}; 
                  border: 2px solid \${isDark ? '#334155' : '#f3f4f6'};
                  border-radius: 50%; 
                  cursor: pointer; 
                  display: flex; 
                  align-items: center; 
                  justify-content: center; 
                  z-index: 10; 
                  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                  transition: all 0.2s ease;
                  color: \${isDark ? '#fff' : '#374151'};
                  padding: 0;
                }
                .phesa-arrow:hover { transform: translateY(-50%) scale(1.1); background: \${isDark ? '#334155' : '#f9fafb'}; }
                .phesa-arrow svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; }
                .phesa-arrow-left { left: 16px; }
                .phesa-arrow-right { right: 16px; }
                
                .phesa-dots { display: flex; justify-content: center; gap: 10px; margin-top: 40px; }
                .phesa-dot { 
                  height: 10px; 
                  border-radius: 5px; 
                  background: \${isDark ? '#334155' : '#e5e7eb'}; 
                  cursor: pointer; 
                  transition: all 0.3s ease; 
                  width: 10px;
                }
                .phesa-dot.active { width: 32px; background: \${isDark ? '#fff' : '#000'}; }

                @media (min-width: 640px) {
                  .phesa-text { font-size: 1.5rem; }
                  .phesa-wrapper { padding: 48px 48px; }
                }

                @media (max-width: 640px) {
                  .phesa-card-carousel { padding: 0 10px; }
                  .phesa-text { font-size: 1.1rem; }
                  .phesa-arrow { width: 32px; height: 32px; }
                  .phesa-arrow-left { left: 8px; }
                  .phesa-arrow-right { right: 8px; }
                }
              \`;
           } else if (type === 'video-slide') {
              styleText += \`
                :host {
                  --phesa-bg-light: #ffffff;
                  --phesa-bg-dark: #0f0f10;
                  --phesa-text-light: #111;
                  --phesa-text-dark: #fff;
                  --phesa-accent: #7c3aed;
                  --phesa-muted: #9ca3af;
                }
                .phesa-container { position: relative; width: 100%; max-width: 720px; margin: auto; }
                .phesa-carousel { overflow: hidden; position: relative; border-radius: 12px; }
                .phesa-track { display: flex; transition: transform 0.4s ease; }
                .phesa-card { min-width: 100%; position: relative; background: var(--phesa-bg-light); color: var(--phesa-text-light); }
                :host(.phesa-dark) .phesa-card { background: var(--phesa-bg-dark); color: var(--phesa-text-dark); }
                .phesa-media { position: relative; width: 100%; height: 360px; background: #000; }
                .phesa-media img, .phesa-media video { width: 100%; height: 100%; object-fit: cover; }
                .phesa-play-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 64px; height: 64px; border-radius: 50%; background: var(--phesa-accent); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10; }
                .phesa-play-btn::before { content: ''; border-left: 14px solid white; border-top: 10px solid transparent; border-bottom: 10px solid transparent; margin-left: 4px; }
                .phesa-overlay { position: absolute; bottom: 0; left: 0; width: 100%; padding: 16px; background: linear-gradient(to top, rgba(0,0,0,0.7), transparent); color: white; }
                .phesa-name { font-size: 18px; font-weight: bold; }
                .phesa-role { font-size: 14px; color: #ddd; }
                .phesa-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%; background: rgba(0,0,0,0.6); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 20; }
                .phesa-arrow-left { left: -18px; }
                .phesa-arrow-right { right: -18px; }
               .phesa-arrow::before { content: ''; border: solid white; border-width: 0 2px 2px 0; padding: 5px; display: inline-block; }
                .phesa-arrow-left::before { transform: rotate(135deg); }
                .phesa-arrow-right::before { transform: rotate(-45deg); }
                .phesa-badge { position: absolute; top: 12px; right: 12px; background: white; color: #333; padding: 6px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; z-index: 10; }
                :host(.phesa-dark) .phesa-badge { background: #222; color: #fff; }
              \`;
           } else if (type === 'wall') {
              styleText += \`
                .phesa-wall { 
                  column-count: 3; 
                  column-gap: 24px; 
                  width: 100%; 
                  padding: 20px;
                  box-sizing: border-box;
                }
                .phesa-card { 
                  break-inside: avoid; 
                  margin-bottom: 24px; 
                  display: inline-block; 
                  width: 100%;
                  background: \${isDark ? '#1e293b' : '#ffffff'}; 
                  border: 1px solid \${isDark ? '#334155' : '#f3f4f6'};
                  border-radius: 16px; 
                  padding: 24px; 
                  box-sizing: border-box;
                  box-shadow: 0 2px 8px -2px rgba(0,0,0,0.05);
                  transition: all 0.3s ease;
                  text-align: left;
                }
                .phesa-card:hover { 
                  transform: translateY(-4px); 
                  box-shadow: 0 12px 24px -8px rgba(0,0,0,0.15); 
                }
                .phesa-stars { 
                  color: #facc15; 
                  font-size: 20px; 
                  margin-bottom: 16px; 
                  display: flex; 
                  gap: 4px; 
                }
                .phesa-text { 
                  font-size: 15px; 
                  line-height: 1.6; 
                  font-weight: 500; 
                  margin-bottom: 20px; 
                  color: \${isDark ? '#e2e8f0' : '#374151'}; 
                  margin-top: 0;
                }
                .phesa-footer { 
                  display: flex; 
                  align-items: center; 
                  gap: 12px; 
                  padding-top: 8px;
                }
                .phesa-avatar { 
                  width: 44px; 
                  height: 44px; 
                  border-radius: 50%; 
                  object-fit: cover; 
                  background: \${isDark ? '#334155' : '#f1f5f9'};
                  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .phesa-meta { flex: 1; min-width: 0; }
                .phesa-name { 
                  font-weight: 600; 
                  font-size: 14px; 
                  margin: 0; 
                  color: \${isDark ? '#fff' : '#111827'};
                }
                .phesa-role { 
                  font-size: 12px; 
                  color: \${isDark ? '#94a3b8' : '#6b7280'}; 
                  margin: 2px 0 0; 
                  font-weight: 500;
                }

                @media (max-width: 1024px) { .phesa-wall { column-count: 2; } }
                @media (max-width: 640px) { .phesa-wall { column-count: 1; padding: 10px; } }
              \`;
           } else {
            styleText += \`
              .phesa-wrapper { background: \${bg}; color: \${text}; padding: 1rem; border-radius: 12px; }
              /* Wall (Masonry Grid Simulation) */
              .phesa-wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
              
              /* Generic Card Attributes */
              .phesa-card { background: \${cardBg}; border: 1px solid \${border}; border-radius: 8px; padding: 16px; box-sizing: border-box; height: 100%; display: flex; flex-direction: column; }
              .phesa-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
              .phesa-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #ddd; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #555; }
              .phesa-meta { flex: 1; min-width: 0; }
              .phesa-name { margin: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
              .phesa-role { margin: 2px 0 0; font-size: 12px; opacity: 0.7; }
              .phesa-stars { color: #facc15; font-size: 14px; margin-bottom: 10px; }
              .phesa-text { font-size: 14px; line-height: 1.5; margin: 0; flex-grow: 1; word-wrap: break-word; }
              .phesa-video-btn { margin-top: 12px; background: #0f3460; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; width: fit-content; text-decoration: none; display: inline-block; }
              
              @media (max-width: 480px) {
                .phesa-wall { grid-template-columns: 1fr; }
              }
            \`;
          }
         
         
         style.textContent = styleText;

         const testimonials = ${JSON.stringify(tests)};
         const showRatings = ${widget.show_ratings};
         const showPhotos = ${widget.show_photos};
         const brandingOn = ${brandingOn};

        if (testimonials.length === 0) return;

        // XSS protection: escape all user-generated HTML content
        const escHtml = (str) => {
          if (!str) return '';
          return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        };

        const renderStars = (rating) => {
          if (!showRatings || !rating) return '';
          let starsHtml = '<div class="phesa-stars">';
          for (let i = 0; i < 5; i++) {
            const isActive = i < rating;
            starsHtml += \`
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="\${isActive ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: \${isActive ? '#facc15' : '#d1d5db'}; filter: \${isActive ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.05))' : 'none'};">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>\`;
          }
          starsHtml += '</div>';
          return starsHtml;
        };

        const renderAvatar = (t) => {
          if (!showPhotos) return '';
          if (t.reviewer_photo_url) {
            return '<img class="phesa-avatar" src="' + escHtml(t.reviewer_photo_url) + '" alt="' + escHtml(t.reviewer_name) + '" loading="lazy"/>';
          }
          const initial = t.reviewer_name ? escHtml(t.reviewer_name.charAt(0).toUpperCase()) : '?';
          return '<div class="phesa-avatar">' + initial + '</div>';
        };

        const createCardHtml = (t, idx) => {
          if (type === 'minimal-centered') {
            const stars = '<div class="phesa-stars" style="color: #ef4444; font-size: 20px; justify-content: center; display: flex; gap: 2px;">' + 
                          '★'.repeat(t.rating || 5) + '☆'.repeat(5 - (t.rating || 5)) + 
                          '</div>';
            const rolePart = [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");
            const avatarHtml = t.reviewer_photo_url 
              ? \`<img class="phesa-avatar" src="\${escHtml(t.reviewer_photo_url)}" alt="\${escHtml(t.reviewer_name)}"/>\`
              : \`<div class="phesa-avatar" style="background: \${isDark ? '#334155' : '#e2e8f0'}; display: flex; align-items: center; justify-content: center; font-weight: bold; color: \${isDark ? '#94a3b8' : '#64748b'};">\${escHtml(t.reviewer_name?.charAt(0) || '?')}</div>\`;

            return \`
              <div class="phesa-card">
                \${showPhotos ? avatarHtml : ""}
                <div class="phesa-text">"\${escHtml(t.text_content || '')}"</div>
                <div class="phesa-stars">\${stars}</div>
                <div class="phesa-meta">
                  <span class="phesa-name">\${escHtml(t.reviewer_name)}</span>
                  \${rolePart ? \`<span class="phesa-role">\${escHtml(rolePart)}</span>\` : ""}
                </div>
              </div>
            \`;
          } else if (type === 'modern-slider') {
             const avatarHtml = (t) => t.reviewer_photo_url 
               ? \`<img class="phesa-avatar" src="\${escHtml(t.reviewer_photo_url)}" />\`
               : \`<div class="phesa-avatar" style="background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-weight: bold; color: #fff;">\${escHtml(t.reviewer_name?.charAt(0) || '?')}</div>\`;

             return \`
               <div class="phesa-card">
                 <div class="phesa-header">
                   <div class="phesa-user">
                     \${showPhotos ? avatarHtml(t) : ""}
                     <div>
                       <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                       <div class="phesa-role">
                         \${escHtml([t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at "))}
                       </div>
                     </div>
                   </div>
                   <div class="phesa-nav">
                     <button class="phesa-btn phesa-prev" aria-label="Previous">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                     </button>
                     <button class="phesa-btn phesa-next" aria-label="Next">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                     </button>
                   </div>
                 </div>
                 <div class="phesa-body">
                   <div class="phesa-stars" style="color: #f59e0b; font-size: 18px; display: flex; gap: 2px; margin-bottom: 12px;">
                     \${'★'.repeat(t.rating || 5) + '☆'.repeat(5 - (t.rating || 5))}
                   </div>
                   <div class="phesa-text">
                     "\${escHtml(t.text_content || '')}"
                   </div>
                 </div>
               </div>
             \`;
          } else if (type === 'flip-card') {
             const roleText = (t) => [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");
             const stars = (t) => renderStars(t.rating || 5);
             
             return \`
               <div class="phesa-card">
                 <div class="phesa-inner">
                   <div class="phesa-front">
                     <div class="phesa-img">
                       \${showPhotos && t.reviewer_photo_url ? \`<img src="\${escHtml(t.reviewer_photo_url)}" />\` : \`<div style="width:100%;height:100%;background:\${isDark?'#334155':'#e2e8f0'};display:flex;align-items:center;justify-content:center;font-size:40px;color:\${isDark?'#94a3b8':'#64748b'}">\${escHtml(t.reviewer_name?.charAt(0)||'?')}</div>\`}
                     </div>
                     <div class="phesa-overlay">
                       <div class="phesa-stars">\${stars(t)}</div>
                       <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                       <div class="phesa-role">\${escHtml(roleText(t))}</div>
                     </div>
                   </div>
                   <div class="phesa-back">
                     <div class="phesa-back-name">\${escHtml(t.reviewer_name)}</div>
                     <div class="phesa-back-role">\${escHtml(roleText(t))}</div>
                     <div class="phesa-text">"\${escHtml(t.text_content || '')}"</div>
                   </div>
                 </div>
               </div>
             \`;
          } else if (type === 'marquee') {
             const avatarHtml = (t) => t.reviewer_photo_url 
               ? \`<img class="phesa-avatar" src="\${escHtml(t.reviewer_photo_url)}" />\`
               : \`<div class="phesa-avatar" style="background: \${isDark ? '#334155' : '#e2e8f0'}; display: flex; align-items: center; justify-content: center; font-weight: bold; color: \${isDark ? '#94a3b8' : '#64748b'}; font-size: 14px;">\${escHtml(t.reviewer_name?.charAt(0) || '?')}</div>\`;

             return \`
               <div class="phesa-card">
                 <div>
                   <div class="phesa-header">
                     \${showPhotos ? avatarHtml(t) : ""}
                     <div>
                       <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                       <div class="phesa-role">\${escHtml([t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at "))}</div>
                     </div>
                   </div>
                   <div class="phesa-stars">\${renderStars(t.rating)}</div>
                   <div class="phesa-text">"\${escHtml(t.text_content || '')}"</div>
                 </div>
               </div>
             \`;
          } else if (type === 'pills') {
             const avatarHtml = (t) => t.reviewer_photo_url 
               ? \`<img class="phesa-avatar" src="\${escHtml(t.reviewer_photo_url)}" />\`
               : \`<div class="phesa-avatar" style="background: \${isDark ? '#334155' : '#e2e8f0'}; display: flex; align-items: center; justify-content: center; font-weight: bold; color: \${isDark ? '#94a3b8' : '#64748b'}; font-size: 10px;">\${escHtml(t.reviewer_name?.charAt(0) || '?')}</div>\`;

             return \`
               <div class="phesa-pill">
                 \${showPhotos ? avatarHtml(t) : ""}
                 <div class="phesa-text">\${escHtml(t.text_content || '')}</div>
                 <div class="phesa-quote">"</div>
               </div>
             \`;
          } else if (type === 'screenshot-grid') {
             const avatarHtml = (t) => t.reviewer_photo_url 
               ? \`<img class="phesa-avatar" src="\${escHtml(t.reviewer_photo_url)}" />\`
               : \`<div class="phesa-avatar" style="background: \${isDark ? '#334155' : '#e2e8f0'}; display: flex; align-items: center; justify-content: center; font-weight: bold; color: \${isDark ? '#94a3b8' : '#64748b'}; font-size: 12px;">\${escHtml(t.reviewer_name?.charAt(0) || '?')}</div>\`;

             const stars = (rating) => rating ? \`<div class="phesa-stars">\${'★'.repeat(rating) + '☆'.repeat(5-rating)}</div>\` : "";
             const roleText = (t) => [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");

             return \`
               <div class="phesa-card">
                 <div class="phesa-header">
                   \${showPhotos ? avatarHtml(t) : ""}
                   <div>
                     <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                     <div class="phesa-role">\${escHtml(roleText(t))}</div>
                   </div>
                 </div>
                 \${stars(t.rating)}
                 \${t.text_content ? \`<div class="phesa-text">\${escHtml(t.text_content)}</div>\` : ""}
                 \${t.screenshot_url ? \`
                   <div class="phesa-media">
                     <img src="\${escHtml(t.screenshot_url)}" loading="lazy" />
                   </div>
                 \` : ""}
                 <div class="phesa-footer"></div>
               </div>
             \`;
          } else if (type === 'split-blocks') {
              const isEven = (idx || 0) % 2 === 0;
              const bgClass = isEven ? "phesa-yellow" : "phesa-dynamic";
              const imageFirst = isEven;
              const roleText = (t) => [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");

              const imageBlock = \`
                <div class="phesa-block phesa-image">
                  \${showPhotos && t.reviewer_photo_url ? \`<img src="\${escHtml(t.reviewer_photo_url)}" />\` : '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#f1f5f9; color:#cbd5e1; font-size:50px; font-weight:bold;">'+escHtml(t.reviewer_name?.charAt(0) || 'P')+'</div>'}
                </div>
              \`;

              const textBlock = \`
                <div class="phesa-block phesa-text-block \${bgClass}">
                  <div class="phesa-quote">
                    "\${escHtml(t.text_content || '')}"
                  </div>
                  <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                  <div class="phesa-role">\${escHtml(roleText(t))}</div>
                </div>
              \`;

              return \`
                <div class="phesa-card">
                  \${imageFirst ? imageBlock + textBlock : textBlock + imageBlock}
                </div>
              \`;
           } else if (type === 'video-rows') {
              const roleText = (t) => [t.reviewer_role, t.reviewer_company].filter(Boolean).join(", ");
              const thumbnailUrl = (t) => t.screenshot_url || t.reviewer_photo_url;
              return \`
                <div class="phesa-card">
                  <div class="phesa-video" \${t.video_url ? 'data-video-url="' + escHtml(t.video_url) + '"' : ''}>
                    \${thumbnailUrl(t) ? \`<img src="\${escHtml(thumbnailUrl(t))}" />\` : '<div style="width:100%;height:100%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-weight:bold;font-size:32px;">' + escHtml(t.reviewer_name?.charAt(0) || 'P') + '</div>'}
                    \${t.video_url ? '<div class="phesa-play-btn"></div>' : ''}
                  </div>
                  <div class="phesa-content">
                    <div class="phesa-quote-icon">❝</div>
                    <div class="phesa-text">\${escHtml(t.text_content || '')}</div>
                    <div class="phesa-user">
                      <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                      <div class="phesa-role">\${escHtml(roleText(t))}</div>
                    </div>
                  </div>
                </div>
              \`;
          } else if (type === 'video-slide') {
              const hasVideo = (t) => t.video_url && t.video_url.trim() !== '';
              const mediaHtml = (t) => hasVideo(t)
                ? \`
                  <video class="phesa-video" preload="metadata" playsinline>
                    <source src="\${escHtml(t.video_url)}" type="video/mp4">
                  </video>
                  <div class="phesa-play-btn" data-action="play"></div>
                \`
                : \`
                  <img src="\${escHtml(t.reviewer_photo_url || t.screenshot_url || 'https://via.placeholder.com/720x360?text=Testimonial')}" />
                \`;

              return \`
                <div class="phesa-card">
                  <div class="phesa-media">
                    \${mediaHtml(t)}
                    <div class="phesa-badge">❤ Testimonial</div>
                    <div class="phesa-overlay">
                      <div class="phesa-name">\${escHtml(t.reviewer_name || '')}</div>
                      <div class="phesa-role">
                        \${escHtml(t.reviewer_role || '')}\${t.reviewer_company ? ', ' + escHtml(t.reviewer_company) : ''}
                      </div>
                    </div>
                  </div>
                </div>
              \`;
          } else if (type === 'carousel') {
             const rolePart = [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");
             const avatarHtml = t.reviewer_photo_url 
               ? \`<img class="phesa-avatar" src="\${escHtml(t.reviewer_photo_url)}" alt="\${escHtml(t.reviewer_name)}"/>\`
               : \`<div class="phesa-avatar" style="background: \${isDark ? '#334155' : '#e2e8f0'}; display: flex; align-items: center; justify-content: center; font-weight: bold; color: \${isDark ? '#94a3b8' : '#64748b'}; font-size: 20px;">\${escHtml(t.reviewer_name?.charAt(0) || '?')}</div>\`;

             return \`
               <div class="phesa-card-carousel">
                 \${showRatings ? renderStars(t.rating) : ""}
                 <div class="phesa-text">"\${escHtml(t.text_content || '')}"</div>
                 <div class="phesa-footer">
                   \${showPhotos ? avatarHtml : ""}
                   <div class="phesa-meta">
                     <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                     \${rolePart ? \`<div class="phesa-role">\${escHtml(rolePart)}</div>\` : ""}
                   </div>
                 </div>
               </div>
             \`;
          } else if (type === 'wall') {
             const rolePart = [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");
             return \`
               <div class="phesa-card">
                 \${renderStars(t.rating)}
                 <div class="phesa-text">"\${escHtml(t.text_content || '')}"</div>
                 <div class="phesa-footer">
                   \${renderAvatar(t)}
                   <div class="phesa-meta">
                     <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                     <div class="phesa-role">\${escHtml(rolePart)}</div>
                   </div>
                 </div>
               </div>
             \`;
          }

          let roleCompany = escHtml(t.reviewer_role || '');
          if (t.reviewer_company) {
            roleCompany += (roleCompany ? ', ' : '') + escHtml(t.reviewer_company);
          }
          let videoHtml = '';
          if (t.video_url) {
            videoHtml = '<a href="' + escHtml(t.video_url) + '" target="_blank" rel="noopener noreferrer" class="phesa-video-btn">▶ Watch Video</a>';
          }
          
          return '<div class="phesa-card">' +
                   '<div class="phesa-header">' +
                     renderAvatar(t) +
                     '<div class="phesa-meta">' +
                       '<p class="phesa-name">' + escHtml(t.reviewer_name) + '</p>' +
                       (roleCompany ? '<p class="phesa-role">' + roleCompany + '</p>' : '') +
                     '</div>' +
                   '</div>' +
                   renderStars(t.rating) +
                   '<p class="phesa-text">' + escHtml(t.text_content || '') + '</p>' +
                   videoHtml +
                 '</div>';
        };

        if (isDark) {
          shadow.host.classList.add('phesa-dark');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'phesa-wrapper';
        
        if (type === 'carousel') {
           let html = \`
             <div class="phesa-carousel">
               <button class="phesa-arrow phesa-arrow-left" id="phesa-prev" aria-label="Previous slide">
                 <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
               </button>
               <button class="phesa-arrow phesa-arrow-right" id="phesa-next" aria-label="Next slide">
                 <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
               </button>
               <div class="phesa-track" id="phesa-track">
           \`;
           
           testimonials.forEach(t => {
             html += '<div class="phesa-slide">' + createCardHtml(t) + '</div>';
           });
           html += '</div>';
           html += '<div class="phesa-dots" id="phesa-dots">';
           testimonials.forEach((_, i) => {
             html += '<div class="phesa-dot ' + (i === 0 ? 'active' : '') + '" data-idx="' + i + '"></div>';
           });
           html += '</div></div>';
           wrapper.innerHTML = html;
           
           const track = wrapper.querySelector('#phesa-track');
           const dots = wrapper.querySelectorAll('.phesa-dot');
           const prevBtn = wrapper.querySelector('#phesa-prev');
           const nextBtn = wrapper.querySelector('#phesa-next');
           let currentIdx = 0;
           
           const update = (idx) => {
             currentIdx = (idx + testimonials.length) % testimonials.length;
             track.style.transform = 'translateX(-' + (currentIdx * 100) + '%)';
             dots.forEach((d, i) => d.classList.toggle('active', i === currentIdx));
           };
           
           dots.forEach(d => {
             d.onclick = () => { update(parseInt(d.dataset.idx)); resetInterval(); };
           });
           
           prevBtn.onclick = (e) => { e.preventDefault(); update(currentIdx - 1); resetInterval(); };
           nextBtn.onclick = (e) => { e.preventDefault(); update(currentIdx + 1); resetInterval(); };
           
           let autoInterval = setInterval(() => {
             update(currentIdx + 1);
           }, 3000);

           const resetInterval = () => {
             clearInterval(autoInterval);
             autoInterval = setInterval(() => {
               update(currentIdx + 1);
             }, 3000);
           };
        } else if (type === 'modern-slider') {
            let index = 0;
            const content = document.createElement('div');
            wrapper.appendChild(content);
            
            const render = () => {
              content.innerHTML = createCardHtml(testimonials[index]);
              const prevBtn = content.querySelector(".phesa-prev");
              const nextBtn = content.querySelector(".phesa-next");
              if (prevBtn) prevBtn.onclick = (e) => { e.preventDefault(); index = (index - 1 + testimonials.length) % testimonials.length; render(); resetInterval(); };
              if (nextBtn) nextBtn.onclick = (e) => { e.preventDefault(); index = (index + 1) % testimonials.length; render(); resetInterval(); };
            };
            
            let autoInterval = setInterval(() => { index = (index + 1) % testimonials.length; render(); }, 5000);
            const resetInterval = () => { clearInterval(autoInterval); autoInterval = setInterval(() => { index = (index + 1) % testimonials.length; render(); }, 5000); };
            
            render();
         } else if (type === 'flip-card') {
            let html = '<div class="phesa-row">';
            testimonials.forEach(t => {
              html += createCardHtml(t);
            });
            html += '</div>';
            wrapper.innerHTML = html;
         } else if (type === 'marquee') {
            const mid = Math.ceil(testimonials.length / 2);
            const row1 = testimonials.slice(0, mid);
            const row2 = testimonials.slice(mid);
            
            const row1Html = [...row1, ...row1, ...row1].map(createCardHtml).join("");
            const row2Html = [...row2, ...row2, ...row2].map(createCardHtml).join("");
            
            const dur1 = Math.max(row1.length * 10, 10);
            const dur2 = Math.max(row2.length * 10, 10);

            wrapper.innerHTML = \`
              <div class="phesa-row phesa-row-left" style="animation-duration: \${dur1}s">\${row1Html}</div>
              \${row2.length > 0 ? \`<div class="phesa-row phesa-row-right" style="animation-duration: \${dur2}s">\${row2Html}</div>\` : ""}
            \`;
         } else if (type === 'pills') {
            const mid = Math.ceil(testimonials.length / 2);
            const row1 = testimonials.slice(0, mid);
            const row2 = testimonials.slice(mid);
            
            const row1Html = [...row1, ...row1, ...row1].map(createCardHtml).join("");
            const row2Html = [...row2, ...row2, ...row2].map(createCardHtml).join("");
            
            const dur1 = Math.max(row1.length * 10, 10);
            const dur2 = Math.max(row2.length * 10, 10);

            wrapper.innerHTML = \`
              <div class="phesa-row phesa-row-left" style="animation-duration: \${dur1}s">\${row1Html}</div>
              \${row2.length > 0 ? \`<div class="phesa-row phesa-row-right" style="animation-duration: \${dur2}s">\${row2Html}</div>\` : ""}
            \`;
         } else if (type === 'screenshot-grid') {
            wrapper.innerHTML = \`<div class="phesa-grid">\${testimonials.map(t => createCardHtml(t)).join("")}</div>\`;
         } else if (type === 'split-blocks') {
            wrapper.innerHTML = \`<div class="phesa-grid">\${testimonials.map((t, idx) => createCardHtml(t, idx)).join("")}</div>\`;
         } else if (type === 'video-rows') {
            wrapper.innerHTML = \`<div class="phesa-container">\${testimonials.map(t => createCardHtml(t)).join("")}</div><div class="phesa-lightbox" id="phesaLightbox"><div class="phesa-lightbox-inner"><button class="phesa-lightbox-close" id="phesaLightboxClose">&#x2715;</button><video id="phesaLightboxVideo" controls controlslist="nodownload" playsinline></video></div></div>\`;

            const lightbox = wrapper.querySelector('#phesaLightbox');
            const lbVideo = wrapper.querySelector('#phesaLightboxVideo');
            const lbClose = wrapper.querySelector('#phesaLightboxClose');

            const openLightbox = (url) => {
              lbVideo.src = url;
              lightbox.classList.add('phesa-open');
              lbVideo.play().catch(e => console.warn("Phesa: Autoplay blocked or failed.", e));
            };
            const closeLightbox = () => {
              lightbox.classList.remove('phesa-open');
              lbVideo.pause();
              lbVideo.src = '';
            };

            lbClose.onclick = closeLightbox;
            lightbox.onclick = (e) => { if (e.target === lightbox) closeLightbox(); };
            const lbEscHandler = (e) => { if (e.key === 'Escape') closeLightbox(); };
            document.addEventListener('keydown', lbEscHandler);

            wrapper.querySelector('.phesa-container').onclick = (e) => {
              const thumb = e.target.closest('[data-video-url]');
              if (thumb) openLightbox(thumb.dataset.videoUrl);
            };
         } else if (type === 'video-slide') {
            wrapper.innerHTML = \`
              <div class="phesa-container">
                <div class="phesa-arrow phesa-arrow-left" id="phesaPrev"></div>
                <div class="phesa-arrow phesa-arrow-right" id="phesaNext"></div>
                <div class="phesa-carousel">
                  <div class="phesa-track" id="phesaTrack">
                    \${testimonials.map(t => createCardHtml(t)).join('')}
                  </div>
                </div>
              </div>
            \`;
            
            const track = wrapper.querySelector('#phesaTrack');
            const prev = wrapper.querySelector('#phesaPrev');
            const next = wrapper.querySelector('#phesaNext');
            let cur = 0;
            const update = () => {
              track.style.transform = 'translateX(-' + (cur * 100) + '%)';
            };
            let isAutoPaused = false;
            let autoInterval = setInterval(() => {
              if (!isAutoPaused) {
                cur = (cur + 1) % testimonials.length;
                update();
              }
            }, 3000);

            const resetInterval = () => {
              clearInterval(autoInterval);
              autoInterval = setInterval(() => {
                if (!isAutoPaused) {
                  cur = (cur + 1) % testimonials.length;
                  update();
                }
              }, 3000);
            };

            next.onclick = (e) => {
              e.preventDefault();
              isAutoPaused = false;
              cur = (cur + 1) % testimonials.length;
              update();
              resetInterval();
            };
            
            prev.onclick = (e) => {
              e.preventDefault();
              isAutoPaused = false;
              cur = (cur - 1 + testimonials.length) % testimonials.length;
              update();
              resetInterval();
            };
            
            track.onclick = (e) => {
              const btn = e.target.closest('[data-action="play"]');
              if (btn) {
                const video = btn.parentElement.querySelector('video');
                if (video) {
                  isAutoPaused = true;
                  video.play();
                  btn.style.display = 'none';
                  video.controls = true;
                }
              }
            };
          } else if (type === 'avatar-select') {
             wrapper.innerHTML = \`
               <div class="phesa-container">
                 <div class="phesa-left" id="phesaLeft"></div>
                 <div class="phesa-right" id="phesaRight"></div>
               </div>
             \`;

             const left = wrapper.querySelector('#phesaLeft');
             const right = wrapper.querySelector('#phesaRight');
             let activeIdx = 0;

             const render = () => {
               // Update Left
               const t = testimonials[activeIdx];
               const rolePart = [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");
               left.innerHTML = \`
                 <div class="phesa-quote">“</div>
                 <div class="phesa-text">"\${escHtml(t.text_content || '')}"</div>
                 <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                 <div class="phesa-role">\${escHtml(rolePart)}</div>
               \`;

               // Update Right
               right.innerHTML = testimonials.map((t, i) => {
                 const isActive = i === activeIdx;
                 const avatarText = t.reviewer_name ? escHtml(t.reviewer_name.charAt(0)) : '?';
                 return \`
                   <div class="phesa-avatar-box \${isActive ? 'phesa-active' : ''}" data-idx="\${i}">
                     \${t.reviewer_photo_url ? \`<img src="\${escHtml(t.reviewer_photo_url)}" />\` : avatarText}
                   </div>
                 \`;
               }).join('');

               right.querySelectorAll('.phesa-avatar-box').forEach(box => {
                  box.onclick = () => {
                    activeIdx = parseInt(box.dataset.idx);
                    render();
                  };
               });
             };

             render();
          } else if (type === 'avatar-list') {
             wrapper.innerHTML = \`
               <div class="phesa-avatar-row" id="phesaAvatarRow"></div>
               <div id="phesaActiveCard" class="phesa-active-card"></div>
             \`;

             const row = wrapper.querySelector('#phesaAvatarRow');
             const card = wrapper.querySelector('#phesaActiveCard');
             let activeIdx = -1;

             const render = () => {
               // Render Row
               row.innerHTML = testimonials.slice(0, 10).map((t, i) => {
                 const isActive = i === activeIdx;
                 const avatarText = t.reviewer_name ? escHtml(t.reviewer_name.charAt(0)) : '?';
                 return \`
                   <div class="phesa-avatar-item \${isActive ? 'phesa-active' : ''}" data-idx="\${i}">
                     \${t.reviewer_photo_url ? \`<img src="\${escHtml(t.reviewer_photo_url)}" />\` : avatarText}
                   </div>
                 \`;
               }).join('');

               // Render Card
               if (activeIdx >= 0) {
                 const t = testimonials[activeIdx];
                 const stars = "★".repeat(t.rating || 5) + "☆".repeat(5 - (t.rating || 5));
                 const rolePart = [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");
                 card.innerHTML = \`
                   <div class="phesa-stars">\${stars}</div>
                   <div class="phesa-text">"\${escHtml(t.text_content || '')}"</div>
                   <div class="phesa-name">\${escHtml(t.reviewer_name)}</div>
                   <div class="phesa-role">\${escHtml(rolePart)}</div>
                 \`;
                 card.classList.add('phesa-show');
               } else {
                 card.classList.remove('phesa-show');
               }

               row.querySelectorAll('.phesa-avatar-item').forEach(item => {
                  item.onclick = (e) => {
                    e.stopPropagation();
                    const targetIdx = parseInt(item.dataset.idx);
                    activeIdx = (activeIdx === targetIdx) ? -1 : targetIdx;
                    render();
                  };
               });
             };

             // Click outside handler
             document.addEventListener('click', (e) => {
               if (!wrapper.contains(e.target)) {
                 activeIdx = -1;
                 render();
               }
             });

             render();
          } else if (type === 'minimal-centered') {
            let html = '';
            testimonials.forEach(t => {
              html += createCardHtml(t);
            });
            wrapper.innerHTML = html;
         } else if (type === 'wall') {
             wrapper.innerHTML = \`<div class="phesa-wall">\${testimonials.map(t => createCardHtml(t)).join("")}</div>\`;
          } else {
           // Form standard wall
           let html = '<div class="phesa-wall">';
           testimonials.forEach(t => {
             html += createCardHtml(t);
           });
           html += '</div>';
           wrapper.innerHTML = html;
        }

        if (brandingOn) {
          const branding = document.createElement('div');
          branding.className = 'phesa-branding';
          branding.innerHTML = 'Powered by <a href="https://phesa.com" target="_blank">Phesa</a>';
          wrapper.appendChild(branding);
        }

        shadow.appendChild(style);
        shadow.appendChild(wrapper);
      })();
    `;

      res.setHeader('Content-Type', 'application/javascript');
      res.send(script);
    } catch (error) {
      console.error('Error serving widget script:', error);
      res.status(500).send(`console.warn("Phesa Widget: Execution encountered an error rendering.");`);
    }
  }
};

module.exports = widgetController;