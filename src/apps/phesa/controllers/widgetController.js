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
      res.setHeader('Cache-Control', 'public, s-maxage=300');
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
        .select('reviewer_name, reviewer_role, reviewer_company, reviewer_photo_url, rating, text_content, video_url')
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
        .catch(() => {});

      // 4. Construct isolated shadow dom script
      const script = `
        (function() {
          const container = document.getElementById('phesa-widget');
          if (!container) return;
          
          const shadow = container.attachShadow({ mode: 'open' });
          const style = document.createElement('style');
          
          const theme = ${JSON.stringify(widget.theme)};
          const isDark = theme === 'dark';
          const bg = isDark ? '#1a1a1a' : '#ffffff';
          const text = isDark ? '#f0f0f0' : '#333333';
          const cardBg = isDark ? '#262626' : '#f9f9f9';
          const border = isDark ? '#333' : '#eee';
           
           // --- Styles ---
           let styleText = \`
             :host { display: block; width: 100%; font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; }
             .phesa-wrapper { background: \${bg}; color: \${text}; padding: 1rem; border-radius: 8px; }
             .phesa-branding { text-align: center; margin-top: 20px; font-size: 12px; }
             .phesa-branding a { color: #0f3460; text-decoration: none; font-weight: bold; }
           \`;

           const type = ${JSON.stringify(widget.type)};

           if (type === 'minimal-centered') {
             styleText += \`
               :host {
                 --phesa-bg: \${bg};
                 --phesa-text: \${text};
                 --phesa-subtext: \${isDark ? '#9ca3af' : '#6b7280'};
                 --phesa-accent: #ef4444;
               }
               .phesa-wrapper {
                 display: grid;
                 gap: 40px;
                 justify-content: center;
                 padding: 40px 20px;
                 background: var(--phesa-bg);
               }
               .phesa-card {
                 max-width: 700px;
                 text-align: center;
                 color: var(--phesa-text);
               }
               .phesa-avatar {
                 width: 56px;
                 height: 56px;
                 border-radius: 50%;
                 object-fit: cover;
                 margin: 0 auto 16px;
               }
               .phesa-text {
                 font-size: 20px;
                 line-height: 1.5;
                 font-weight: 600;
                 margin-bottom: 16px;
               }
               .phesa-stars {
                 color: var(--phesa-accent);
                 font-size: 18px;
                 margin-bottom: 8px;
               }
               .phesa-meta {
                 font-size: 14px;
                 color: var(--phesa-subtext);
               }
               .phesa-name {
                 font-weight: 500;
                 color: var(--phesa-text);
               }
               .phesa-role {
                 color: var(--phesa-subtext);
               }
               .phesa-video {
                 margin-top: 16px;
               }
               .phesa-video iframe {
                 width: 100%;
                 height: 200px;
                 border-radius: 8px;
                 border: none;
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
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
                  padding: 20px;
                  border-radius: 8px;
                }
                .phesa-card {
                  max-width: 720px;
                  margin: 0 auto;
                  background: var(--phesa-card-bg);
                  border-radius: 10px;
                  overflow: hidden;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.05);
                }
                .phesa-header {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  background: var(--phesa-primary);
                  color: #fff;
                  padding: 16px;
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
                }
                .phesa-btn:hover {
                  background: rgba(255,255,255,0.35);
                }
                .phesa-body {
                  padding: 16px;
                }
                .phesa-stars {
                  color: var(--phesa-accent);
                  margin-bottom: 10px;
                  font-size: 16px;
                }
                .phesa-text {
                  font-size: 15px;
                  line-height: 1.6;
                  color: var(--phesa-text);
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
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
                  border-radius: 8px;
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
            } else {
             styleText += \`
               .phesa-wrapper { background: \${bg}; color: \${text}; padding: 1rem; border-radius: 8px; }
               /* Wall (Masonry Grid Simulation) */
               .phesa-wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
               
               /* Carousel */
               .phesa-carousel { position: relative; overflow: hidden; }
               .phesa-track { display: flex; transition: transform 0.4s ease; }
               .phesa-slide { min-width: 100%; box-sizing: border-box; padding: 0 10px; }
               .phesa-dots { display: flex; justify-content: center; gap: 8px; margin-top: 16px; }
               .phesa-dot { width: 8px; height: 8px; border-radius: 50%; background: #ccc; cursor: pointer; transition: background 0.2s; }
               .phesa-dot.active { background: #0f3460; }
               
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
            return '<div class="phesa-stars">' + '★'.repeat(rating) + '☆'.repeat(5-rating) + '</div>';
          };

          const renderAvatar = (t) => {
            if (!showPhotos) return '';
            if (t.reviewer_photo_url) {
              return '<img class="phesa-avatar" src="' + escHtml(t.reviewer_photo_url) + '" alt="' + escHtml(t.reviewer_name) + '" loading="lazy"/>';
            }
            const initial = t.reviewer_name ? escHtml(t.reviewer_name.charAt(0).toUpperCase()) : '?';
            return '<div class="phesa-avatar">' + initial + '</div>';
          };

          const createCardHtml = (t) => {
            if (type === 'minimal-centered') {
              const stars = "★".repeat(t.rating || 5) + "☆".repeat(5 - (t.rating || 5));
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
                    \${rolePart ? \`<span class="phesa-role"> / \${escHtml(rolePart)}</span>\` : ""}
                  </div>
                  \${t.video_url ? \`
                    <div class="phesa-video"><iframe src="\${escHtml(t.video_url)}" allowfullscreen></iframe></div>
                  \` : ""}
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
                       <button class="phesa-btn phesa-prev">←</button>
                       <button class="phesa-btn phesa-next">→</button>
                     </div>
                   </div>
                   <div class="phesa-body">
                     \${renderStars(t.rating)}
                     <div class="phesa-text">
                       "\${escHtml(t.text_content || '')}"
                     </div>
                     \${t.video_url ? \`
                       <div class="phesa-video" style="margin-top: 16px;">
                         <iframe src="\${escHtml(t.video_url)}" allowfullscreen style="width: 100%; height: 200px; border-radius: 8px; border: none;"></iframe>
                       </div>
                     \` : ""}
                   </div>
                 </div>
               \`;
            } else if (type === 'flip-card') {
               const roleText = (t) => [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");
               const stars = (t) => "★".repeat(t.rating || 5) + "☆".repeat(5 - (t.rating || 5));
               
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
                       \${t.video_url ? \`<a href="\${escHtml(t.video_url)}" target="_blank" class="phesa-video-link">▶ Play Video</a>\` : ""}
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
             let html = '<div class="phesa-carousel"><div class="phesa-track" id="phesa-track">';
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
             let currentIdx = 0;
             
             const update = (idx) => {
               currentIdx = idx;
               track.style.transform = 'translateX(-' + (idx * 100) + '%)';
               dots.forEach((d, i) => d.classList.toggle('active', i === idx));
             };
             
             dots.forEach(d => {
               d.onclick = () => update(parseInt(d.dataset.idx));
             });
             
             setInterval(() => {
               update((currentIdx + 1) % testimonials.length);
             }, 4000);
             
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
           } else if (type === 'minimal-centered') {
              let html = '';
              testimonials.forEach(t => {
                html += createCardHtml(t);
              });
              wrapper.innerHTML = html;
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

      res.send(script);
    } catch (error) {
      console.error('Error serving widget script:', error);
      res.send(`console.warn("Phesa Widget: Execution encountered an error rendering.");`);
    }
  }
};

module.exports = widgetController;