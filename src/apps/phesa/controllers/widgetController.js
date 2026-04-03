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
          
          style.textContent = \`
            :host { display: block; width: 100%; font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; }
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
            
            /* Branding */
            .phesa-branding { text-align: center; margin-top: 20px; font-size: 12px; }
            .phesa-branding a { color: #0f3460; text-decoration: none; font-weight: bold; }
            
            /* Responsive Overrides */
            @media (max-width: 480px) {
              .phesa-wall { grid-template-columns: 1fr; }
            }
          \`;

          const testimonials = ${JSON.stringify(tests)};
          const showRatings = ${widget.show_ratings};
          const showPhotos = ${widget.show_photos};
          const brandingOn = ${brandingOn};
          const type = ${JSON.stringify(widget.type)};

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
             
             // Setup carousel automated JS
             // NOTE: shadow.getElementById does NOT work inside Shadow DOM - must use shadow.querySelector
             setTimeout(() => {
               const track = shadow.querySelector('#phesa-track');
               const dots = shadow.querySelectorAll('.phesa-dot');
               let current = 0;
               const max = testimonials.length;
               
               const goTo = (idx) => {
                 current = idx;
                 track.style.transform = 'translateX(-' + (current * 100) + '%)';
                 dots.forEach(d => d.classList.remove('active'));
                 if(dots[current]) dots[current].classList.add('active');
               };
               
               setInterval(() => {
                 goTo((current + 1) % max);
               }, 4000);
               
               dots.forEach(dot => {
                 dot.addEventListener('click', (e) => {
                   goTo(parseInt(e.target.dataset.idx));
                 });
               });
             }, 0);
             
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
            const b = document.createElement('div');
            b.className = 'phesa-branding';
            b.innerHTML = 'Powered by <a href="https://phesa.com" target="_blank">Phesa</a>';
            wrapper.appendChild(b);
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