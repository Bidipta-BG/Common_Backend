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

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: analytics, error: analyticsError } = await supabase
        .from('widget_analytics')
        .select('widget_id')
        .in('widget_id', widgets.map(w => w.id))
        .gte('viewed_at', thirtyDaysAgo.toISOString());

      if (analyticsError) {
        console.error('Error fetching analytics:', analyticsError);
        return res.status(200).json({
          widgets: widgets.map(w => ({ ...w, view_count: 0 }))
        });
      }

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
          type: type || 'wall',
          theme: theme || 'light',
          show_ratings: show_ratings !== false,
          show_photos: show_photos !== false,
          max_items: max_items === 'all' ? 200 : (parseInt(max_items) || 10)
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

      const updates = { ...req.body };
      if (updates.max_items === 'all') {
        updates.max_items = 200;
      } else if (updates.max_items) {
        updates.max_items = parseInt(updates.max_items) || 10;
      }
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
        .select('user_id, max_items, type')
        .eq('id', widgetId)
        .single();

      if (!widget) return res.status(404).json({ error: 'Widget not found' });

      let testimonialsQuery = supabase
        .from('testimonials')
        .select('id, reviewer_name, reviewer_role, reviewer_company, reviewer_photo_url, rating, text_content, video_url, created_at')
        .eq('user_id', widget.user_id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      let limit = 10;
      const m = widget.max_items;

      if (widget.type === 'avatar-list') {
        limit = (m === 'all' || m === 200) ? 15 : Math.min(Number(m) || 10, 15);
      } else if (widget.type === 'avatar-select') {
        limit = (m === 'all' || m === 200) ? 20 : Math.min(Number(m) || 10, 20);
      } else {
        if (m === 'all' || m === 200) limit = 200;
        else limit = Number(m) || 10;
      }
      testimonialsQuery = testimonialsQuery.limit(limit);

      const { data: testimonials } = await testimonialsQuery;

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
      if (widgetId.endsWith('.js')) {
        widgetId = widgetId.replace('.js', '');
      }

      const { data: widget } = await supabase
        .from('widgets')
        .select('*, profiles!inner(plan)')
        .eq('id', widgetId)
        .single();

      if (!widget) {
        return res.send('console.warn("Phesa Widget: Not found for ID ' + widgetId + '");');
      }

      let testimonialsQuery = supabase
        .from('testimonials')
        .select('reviewer_name, reviewer_role, reviewer_company, reviewer_photo_url, rating, text_content, video_url, screenshot_url')
        .eq('user_id', widget.user_id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      let limit = 10;
      const m = widget.max_items;

      if (widget.type === 'avatar-list') {
        limit = (m === 'all' || m === 200) ? 15 : Math.min(Number(m) || 10, 15);
      } else if (widget.type === 'avatar-select') {
        limit = (m === 'all' || m === 200) ? 20 : Math.min(Number(m) || 10, 20);
      } else {
        if (m === 'all' || m === 200) limit = 200;
        else limit = Number(m) || 10;
      }
      testimonialsQuery = testimonialsQuery.limit(limit);

      const { data: testimonials } = await testimonialsQuery;

      const tests = testimonials || [];
      const plan = Array.isArray(widget.profiles) ? widget.profiles[0]?.plan : widget.profiles?.plan;
      const brandingOn = (plan === 'free');

      supabase.from('widget_analytics')
        .insert({ widget_id: widgetId, user_id: widget.user_id })
        .then()
        .catch(() => { });

      // Build the script using string concatenation — NO nested template literals
      // All dynamic server-side values injected via JSON.stringify for safety
      const T = JSON.stringify(tests);
      const THEME = JSON.stringify(widget.theme);
      const TYPE = JSON.stringify(widget.type);
      const SHOW_RATINGS = widget.show_ratings ? 'true' : 'false';
      const SHOW_PHOTOS = widget.show_photos ? 'true' : 'false';
      const BRANDING = brandingOn ? 'true' : 'false';

      const script = [
        '(function() {',
        '  var container = document.getElementById("phesa-widget");',
        '  if (!container) return;',
        '  if (!document.querySelector("link[href*=\\"fonts.googleapis.com/css2?family=Bricolage+Grotesque\\"]")) {',
        '    var fontLink = document.createElement("link");',
        '    fontLink.rel = "stylesheet";',
        '    fontLink.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap";',
        '    document.head.appendChild(fontLink);',
        '  }',
        '  var shadow = container.attachShadow({ mode: "open" });',
        '  var style = document.createElement("style");',
        '  var testimonials = ' + T + ';',
        '  var showRatings = ' + SHOW_RATINGS + ';',
        '  var showPhotos = ' + SHOW_PHOTOS + ';',
        '  var brandingOn = ' + BRANDING + ';',
        '  var theme = ' + THEME + ';',
        '  var type = ' + TYPE + ';',
        '  var isDark = theme === "dark";',
        '  var bg = isDark ? "#1a1a1a" : "#ffffff";',
        '  var text = isDark ? "#f0f0f0" : "#333333";',
        '  var cardBg = isDark ? "#262626" : "#f9f9f9";',
        '  var border = isDark ? "#334155" : "#eee";',
        '',
        '  // --- XSS protection ---',
        '  function escHtml(str) {',
        '    if (!str) return "";',
        '    return String(str)',
        '      .replace(/&/g, "&amp;")',
        '      .replace(/</g, "&lt;")',
        '      .replace(/>/g, "&gt;")',
        '      .replace(/"/g, "&quot;")',
        '      .replace(/\'/g, "&#39;");',
        '  }',
        '',
        '  // --- Star helpers ---',
        '  function renderStarsHtml(rating, color) {',
        '    if (!showRatings || !rating) return "";',
        '    var n = Math.min(Math.max(parseInt(rating) || 0, 0), 5);',
        '    var html = "<div class=\\"phesa-stars\\"" + (color ? " style=\\"color:" + color + ";font-size:14px;margin-bottom:16px;letter-spacing:2px;\\"" : "") + ">";',
        '    for (var i = 0; i < 5; i++) { html += i < n ? "\u2605" : "\u2606"; }',
        '    html += "</div>";',
        '    return html;',
        '  }',
        '',
        '  function renderStarsSvg(rating) {',
        '    if (!showRatings || !rating) return "";',
        '    var n = Math.min(Math.max(parseInt(rating) || 0, 0), 5);',
        '    var html = "<div class=\\"phesa-stars\\">";',
        '    for (var i = 0; i < 5; i++) {',
        '      var active = i < n;',
        '      html += "<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"1em\\" height=\\"1em\\" viewBox=\\"0 0 24 24\\"" +',
        '        " fill=\\"" + (active ? "currentColor" : "none") + "\\"" +',
        '        " stroke=\\"currentColor\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"" +',
        '        " style=\\"color:" + (active ? "#facc15" : "#d1d5db") + ";\\">" +',
        '        "<polygon points=\\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\\"></polygon>" +',
        '        "</svg>";',
        '    }',
        '    html += "</div>";',
        '    return html;',
        '  }',
        '',
        '  function renderAvatar(t) {',
        '    if (!showPhotos) return "";',
        '    if (t.reviewer_photo_url) {',
        '      return "<img class=\\"phesa-avatar\\" src=\\"" + escHtml(t.reviewer_photo_url) + "\\" alt=\\"" + escHtml(t.reviewer_name) + "\\" loading=\\"lazy\\"/>";',
        '    }',
        '    var initial = t.reviewer_name ? escHtml(t.reviewer_name.charAt(0).toUpperCase()) : "?";',
        '    return "<div class=\\"phesa-avatar\\">" + initial + "</div>";',
        '  }',
        '',
        '  // --- Styles ---',
        '  var styleText = ":host { display:block; width:100%; font-family:\'Bricolage Grotesque\',system-ui,sans-serif; box-sizing:border-box; }" +',
        '    ".phesa-wrapper { background:" + bg + "; color:" + text + "; padding:1rem; border-radius:12px; font-family:\'Bricolage Grotesque\',system-ui,sans-serif; }" +',
        '    ".phesa-branding { text-align:center; margin-top:20px; font-size:12px; }" +',
        '    ".phesa-branding a { color:#0f3460; text-decoration:none; font-weight:bold; }";',
        '',
        '  if (type === "minimal-centered") {',
        '    styleText += ":host { --phesa-bg:" + (isDark?"#0f172a":"#ffffff") + "; --phesa-text:" + (isDark?"#f9fafb":"#111111") + "; --phesa-subtext:" + (isDark?"#9ca3af":"#6b7280") + "; --phesa-accent:#ef4444; }" +',
        '      ".phesa-wrapper { display:grid; gap:64px; justify-content:center; padding:40px 20px; background:var(--phesa-bg); }" +',
        '      ".phesa-card { max-width:768px; text-align:center; color:var(--phesa-text); }" +',
        '      ".phesa-avatar { width:56px; height:56px; border-radius:50%; object-fit:cover; margin:0 auto 24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); border:2px solid transparent; }" +',
        '      ".phesa-text { font-size:1.25rem; line-height:1.6; font-weight:700; margin-bottom:24px; font-style:italic; letter-spacing:-0.025em; }" +',
        '      ".phesa-stars { color:var(--phesa-accent); font-size:20px; margin-bottom:8px; }" +',
        '      ".phesa-meta { margin-top:24px; }" +',
        '      ".phesa-name { font-weight:600; font-size:16px; color:var(--phesa-text); display:block; }" +',
        '      ".phesa-role { color:var(--phesa-subtext); font-size:14px; margin-top:4px; display:block; }" +',
        '      "@media(min-width:768px){.phesa-text{font-size:1.5rem;}}";',
        '  } else if (type === "modern-slider") {',
        '    styleText += ":host { --phesa-bg:#ffffff; --phesa-card-bg:#f9fafb; --phesa-text:#111827; --phesa-subtext:#6b7280; --phesa-accent:#f59e0b; --phesa-primary:#3b82f6; }" +',
        '      ":host(.phesa-dark) { --phesa-bg:#0f172a; --phesa-card-bg:#1e293b; --phesa-text:#f9fafb; --phesa-subtext:#94a3b8; --phesa-primary:#2563eb; }" +',
        '      ".phesa-wrapper { background:var(--phesa-bg); padding:24px; border-radius:12px; }" +',
        '      ".phesa-card { max-width:720px; margin:0 auto; background:var(--phesa-card-bg); border-radius:16px; overflow:hidden; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04); }" +',
        '      ".phesa-header { display:flex; align-items:center; justify-content:space-between; background:var(--phesa-primary); color:#fff; padding:16px 24px; }" +',
        '      ".phesa-user { display:flex; align-items:center; gap:12px; }" +',
        '      ".phesa-avatar { width:48px; height:48px; border-radius:8px; object-fit:cover; background:rgba(255,255,255,0.1); }" +',
        '      ".phesa-name { font-weight:600; } .phesa-role { font-size:13px; opacity:0.9; }" +',
        '      ".phesa-nav { display:flex; gap:8px; }" +',
        '      ".phesa-btn { width:32px; height:32px; border-radius:50%; border:none; cursor:pointer; background:rgba(255,255,255,0.2); color:#fff; font-size:16px; display:flex; align-items:center; justify-content:center; transition:background 0.2s; padding:0; }" +',
        '      ".phesa-btn:hover { background:rgba(255,255,255,0.35); } .phesa-btn svg { width:16px; height:16px; }" +',
        '      ".phesa-body { padding:24px; }" +',
        '      ".phesa-stars { color:var(--phesa-accent); margin-bottom:12px; font-size:18px; }" +',
        '      ".phesa-text { font-size:15px; line-height:1.6; color:var(--phesa-text); font-style:italic; }";',
        '  } else if (type === "flip-card") {',
        '    styleText += ":host { --phesa-bg:#f3f4f6; --phesa-card-bg:#ffffff; --phesa-text:#111827; --phesa-subtext:#6b7280; --phesa-accent:#f59e0b; }" +',
        '      ":host(.phesa-dark) { --phesa-bg:#0f172a; --phesa-card-bg:#1e293b; --phesa-text:#f9fafb; --phesa-subtext:#94a3b8; }" +',
        '      "* { box-sizing:border-box; }" +',
        '      ".phesa-wrapper { background:var(--phesa-bg); padding:30px; overflow:hidden; border-radius:12px; }" +',
        '      ".phesa-row { display:flex; gap:20px; overflow-x:auto; scroll-behavior:smooth; padding:20px 0; perspective:2000px; }" +',
        '      ".phesa-row::-webkit-scrollbar { height:6px; } .phesa-row::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:10px; }" +',
        '      ".phesa-card { width:240px; height:320px; flex-shrink:0; position:relative; } .phesa-card:hover { z-index:10; }" +',
        '      ".phesa-inner { width:100%; height:100%; position:relative; transform-style:preserve-3d; transition:transform 0.6s cubic-bezier(0.4,0,0.2,1); }" +',
        '      ".phesa-card:hover .phesa-inner { transform:rotateY(180deg); }" +',
        '      ".phesa-front, .phesa-back { position:absolute; width:100%; height:100%; border-radius:14px; overflow:hidden; backface-visibility:hidden; background:var(--phesa-card-bg); box-shadow:0 6px 20px rgba(0,0,0,0.08); }" +',
        '      ".phesa-front { display:flex; flex-direction:column; justify-content:flex-end; } .phesa-img { position:absolute; inset:0; } .phesa-img img { width:100%; height:100%; object-fit:cover; }" +',
        '      ".phesa-overlay { position:relative; padding:14px; background:linear-gradient(to top,rgba(0,0,0,0.8),transparent); color:#fff; }" +',
        '      ".phesa-stars { color:var(--phesa-accent); font-size:14px; margin-bottom:6px; } .phesa-name { font-weight:600; font-size:15px; } .phesa-role { font-size:12px; opacity:0.85; }" +',
        '      ".phesa-back { transform:rotateY(180deg); padding:16px; display:flex; flex-direction:column; }" +',
        '      ".phesa-back-name { font-weight:600; margin-bottom:4px; color:var(--phesa-text); font-size:14px; } .phesa-back-role { font-size:11px; color:var(--phesa-subtext); margin-bottom:12px; }" +',
        '      ".phesa-text { font-size:13px; line-height:1.5; color:var(--phesa-text); overflow-y:auto; flex:1; font-style:italic; }";',
        '  } else if (type === "marquee") {',
        '    styleText += ":host { --phesa-bg:#f3f4f6; --phesa-card-bg:#ffffff; --phesa-text:#111827; --phesa-subtext:#6b7280; --phesa-border:#e5e7eb; --phesa-accent:#f59e0b; }" +',
        '      ":host(.phesa-dark) { --phesa-bg:#0f172a; --phesa-card-bg:#1e293b; --phesa-text:#f9fafb; --phesa-subtext:#94a3b8; --phesa-border:#334155; }" +',
        '      ".phesa-wrapper { background:var(--phesa-bg); padding:30px 0; display:flex; flex-direction:column; gap:20px; overflow:hidden; border-radius:12px; }" +',
        '      ".phesa-row { display:flex; gap:20px; width:max-content; }" +',
        '      "@keyframes phesa-scroll-left{0%{transform:translateX(0)}100%{transform:translateX(-33.33%)}}" +',
        '      "@keyframes phesa-scroll-right{0%{transform:translateX(-33.33%)}100%{transform:translateX(0)}}" +',
        '      ".phesa-row-left{animation:phesa-scroll-left 30s linear infinite;} .phesa-row-right{animation:phesa-scroll-right 30s linear infinite;}" +',
        '      ".phesa-wrapper:hover .phesa-row{animation-play-state:paused;}" +',
        '      ".phesa-card { width:260px; background:var(--phesa-card-bg); border-radius:12px; border:1px solid var(--phesa-border); padding:14px; display:flex; flex-direction:column; justify-content:space-between; flex-shrink:0; white-space:normal; }" +',
        '      ".phesa-header{display:flex;align-items:center;gap:10px;margin-bottom:8px;} .phesa-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;}" +',
        '      ".phesa-name{font-size:14px;font-weight:600;color:var(--phesa-text);} .phesa-role{font-size:11px;color:var(--phesa-subtext);}" +',
        '      ".phesa-stars{color:var(--phesa-accent);font-size:13px;margin:6px 0;} .phesa-text{font-size:13px;color:var(--phesa-text);line-height:1.5;font-style:italic;}";',
        '  } else if (type === "pills") {',
        '    styleText += ":host { --phesa-bg:#f9fafb; --phesa-pill-bg:#ffffff; --phesa-text:#111827; --phesa-subtext:#6b7280; --phesa-border:#e5e7eb; }" +',
        '      ":host(.phesa-dark){ --phesa-bg:#0f172a; --phesa-pill-bg:#1e293b; --phesa-text:#f9fafb; --phesa-subtext:#94a3b8; --phesa-border:#334155; }" +',
        '      ".phesa-wrapper{background:var(--phesa-bg);padding:16px 0;display:flex;flex-direction:column;gap:12px;overflow:hidden;border-radius:12px;}" +',
        '      ".phesa-row{display:flex;gap:14px;width:max-content;}" +',
        '      "@keyframes phesa-pill-left{0%{transform:translateX(0)}100%{transform:translateX(-33.33%)}}" +',
        '      "@keyframes phesa-pill-right{0%{transform:translateX(-33.33%)}100%{transform:translateX(0)}}" +',
        '      ".phesa-row-left{animation:phesa-pill-left 40s linear infinite;} .phesa-row-right{animation:phesa-pill-right 40s linear infinite;}" +',
        '      ".phesa-wrapper:hover .phesa-row{animation-play-state:paused;}" +',
        '      ".phesa-pill{display:inline-flex;align-items:center;gap:10px;padding:8px 14px;background:var(--phesa-pill-bg);border:1px solid var(--phesa-border);border-radius:999px;white-space:nowrap;flex-shrink:0;}" +',
        '      ".phesa-avatar{width:22px;height:22px;border-radius:50%;object-fit:cover;}" +',
        '      ".phesa-text{font-size:13px;color:var(--phesa-text);} .phesa-quote{font-size:14px;color:var(--phesa-subtext);margin-left:6px;}";',
        '  } else if (type === "screenshot-grid") {',
        '    styleText += ":host { --phesa-bg:#f5f6f8; --phesa-card-bg:#ffffff; --phesa-text:#111827; --phesa-subtext:#6b7280; --phesa-border:#e5e7eb; --phesa-accent:#7c3aed; }" +',
        '      ":host(.phesa-dark){ --phesa-bg:#0f172a; --phesa-card-bg:#1e293b; --phesa-text:#f9fafb; --phesa-subtext:#94a3b8; --phesa-border:#334155; }" +',
        '      ".phesa-wrapper{background:var(--phesa-bg);padding:24px;border-radius:12px;}" +',
        '      ".phesa-grid{columns:3 280px;column-gap:20px;}" +',
        '      ".phesa-card{break-inside:avoid;margin-bottom:20px;background:var(--phesa-card-bg);border:1px solid var(--phesa-border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 14px rgba(0,0,0,0.04);}" +',
        '      ".phesa-header{display:flex;align-items:center;gap:10px;} .phesa-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;}" +',
        '      ".phesa-name{font-weight:600;font-size:14px;color:var(--phesa-text);} .phesa-role{font-size:12px;color:var(--phesa-subtext);}" +',
        '      ".phesa-stars{color:#f59e0b;font-size:14px;}" +',
        '      ".phesa-text{font-size:13px;line-height:1.5;color:var(--phesa-text);}" +',
        '      ".phesa-media{border-radius:10px;overflow:hidden;border:1px solid var(--phesa-border);margin-top:4px;} .phesa-media img{width:100%;display:block;}" +',
        '      ".phesa-footer{font-size:11px;color:var(--phesa-subtext);}";',
        '  } else if (type === "split-blocks") {',
        '    styleText += ":host { --phesa-subtext:#6b7280; --phesa-yellow:#fff200; --phesa-dynamic-bg:#ffffff; --phesa-dynamic-text:#000000; }" +',
        '      ":host(.phesa-dark){ --phesa-bg:#0f172a; --phesa-dynamic-bg:#000000; --phesa-dynamic-text:#ffffff; --phesa-text:#f9fafb; }" +',
        '      ".phesa-wrapper{background:var(--phesa-bg);border-radius:16px;overflow:hidden;}" +',
        '      ".phesa-grid{display:grid;grid-template-columns:repeat(2,1fr);}" +',
        '      ".phesa-card{display:contents;}" +',
        '      ".phesa-block{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;padding:30px;box-sizing:border-box;}" +',
        '      ".phesa-image{padding:0;} .phesa-image img{width:100%;height:100%;object-fit:cover;display:block;}" +',
        '      ".phesa-text-block{flex-direction:column;text-align:left;align-items:flex-start;}" +',
        '      ".phesa-yellow{background:var(--phesa-yellow);color:#000;}" +',
        '      ".phesa-dynamic{background:var(--phesa-dynamic-bg);color:var(--phesa-dynamic-text);}" +',
        '      ".phesa-quote{font-size:19px;font-weight:600;line-height:1.6;margin-bottom:20px;font-style:italic;}" +',
        '      ".phesa-name{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;}" +',
        '      ".phesa-role{font-size:12px;opacity:0.7;margin-top:4px;}" +',
        '      "@media(max-width:768px){.phesa-grid{grid-template-columns:1fr;}.phesa-block{aspect-ratio:1/1;}}";',
        '  } else if (type === "video-rows") {',
        '    styleText += ":host { --phesa-bg:#ffffff; --phesa-text:#1a1a1a; --phesa-subtext:#6b7280; --phesa-accent:#7c3aed; --phesa-card-bg:#ffffff; --phesa-border:#e5e7eb; }" +',
        '      ":host(.phesa-dark){ --phesa-bg:#0f172a; --phesa-text:#f1f5f9; --phesa-subtext:#94a3b8; --phesa-card-bg:#1e293b; --phesa-border:#334155; }" +',
        '      ".phesa-container{display:grid;gap:20px;}" +',
        '      ".phesa-card{display:flex;gap:16px;background:var(--phesa-card-bg);border:1px solid var(--phesa-border);border-radius:16px;padding:16px;align-items:flex-start;}" +',
        '      ".phesa-video{position:relative;width:120px;height:120px;min-width:120px;border-radius:12px;overflow:hidden;cursor:pointer;background:#eee;text-decoration:none;display:block;}" +',
        '      ".phesa-video img{width:100%;height:100%;object-fit:cover;}" +',
        '      ".phesa-play-btn{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}" +',
        '      ".phesa-play-btn::before{content:\\"\\";width:40px;height:40px;background:rgba(0,0,0,0.6);border-radius:50%;position:absolute;}" +',
        '      ".phesa-play-btn::after{content:\\"\\";border-left:12px solid white;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:4px;position:relative;}" +',
        '      ".phesa-content{flex:1;}" +',
        '      ".phesa-quote-icon{font-size:24px;color:var(--phesa-accent);margin-bottom:6px;line-height:1;opacity:0.5;}" +',
        '      ".phesa-text{font-size:15px;line-height:1.6;color:var(--phesa-text);}" +',
        '      ".phesa-user{margin-top:10px;}" +',
        '      ".phesa-name{font-weight:600;font-size:14px;color:var(--phesa-text);} .phesa-role{font-size:13px;color:var(--phesa-subtext);}" +',
        '      "@media(max-width:600px){.phesa-card{flex-direction:column;}.phesa-video{width:100%;height:180px;}}" +',
        '      ".phesa-lightbox{display:none;position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.88);align-items:center;justify-content:center;}" +',
        '      ".phesa-lightbox.phesa-open{display:flex;}" +',
        '      ".phesa-lightbox-inner{position:relative;width:90vw;max-width:860px;}" +',
        '      ".phesa-lightbox-inner video{width:100%;border-radius:12px;max-height:80vh;background:#000;}" +',
        '      ".phesa-lightbox-close{position:absolute;top:-14px;right:-14px;width:32px;height:32px;border-radius:50%;background:#fff;border:none;cursor:pointer;font-size:18px;line-height:32px;text-align:center;color:#111;font-weight:bold;z-index:10;}";',
        '  } else if (type === "avatar-select") {',
        '    styleText += ":host { --phesa-bg:" + (isDark?"#0f172a":"#f5f6f8") + "; --phesa-card-bg:" + (isDark?"#1e293b":"#ffffff") + "; --phesa-text:" + text + "; --phesa-subtext:" + (isDark?"#94a3b8":"#6b7280") + "; --phesa-accent:#22c55e; --phesa-border:" + (isDark?"#334155":"#e5e7eb") + "; }" +',
        '      ".phesa-wrapper{background:var(--phesa-bg);padding:24px;border-radius:12px;}" +',
        '      ".phesa-container{display:grid;grid-template-columns:1.2fr 1fr;gap:20px;align-items:stretch;}" +',
        '      ".phesa-left{background:var(--phesa-card-bg);border-radius:12px;padding:30px;display:flex;flex-direction:column;justify-content:center;border:1px solid var(--phesa-border);}" +',
        '      ".phesa-quote{font-size:32px;color:var(--phesa-accent);margin-bottom:6px;line-height:1;}" +',
        '      ".phesa-stars{color:#f59e0b;font-size:18px;margin-bottom:12px;height:20px;}" +',
        '      ".phesa-text{font-size:18px;line-height:1.6;color:var(--phesa-text);margin-bottom:20px;font-style:italic;}" +',
        '      ".phesa-name{font-weight:600;font-size:14px;color:var(--phesa-text);} .phesa-role{font-size:12px;color:var(--phesa-subtext);}" +',
        '      ".phesa-right{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;align-content:start;}" +',
        '      ".phesa-avatar-box{width:100%;aspect-ratio:1/1;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:all 0.2s;background:#ddd;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#555;}" +',
        '      ".phesa-avatar-box img{width:100%;height:100%;object-fit:cover;} .phesa-avatar-box:hover{transform:scale(1.05);}" +',
        '      ".phesa-avatar-box.phesa-active{border-color:var(--phesa-accent);box-shadow:0 0 10px rgba(34,197,94,0.2);}" +',
        '      "@media(max-width:768px){.phesa-container{grid-template-columns:1fr;}.phesa-right{grid-template-columns:repeat(5,1fr);}}";',
        '  } else if (type === "avatar-list") {',
        '    styleText += ":host { --phesa-bg:" + (isDark?"#0f172a":"#f5f6f8") + "; --phesa-card-bg:" + (isDark?"#1e293b":"#ffffff") + "; --phesa-text:" + (isDark?"#f9fafb":"#111827") + "; --phesa-subtext:" + (isDark?"#94a3b8":"#6b7280") + "; --phesa-accent:#f59e0b; --phesa-border:" + (isDark?"#334155":"#e5e7eb") + "; }" +',
        '      ".phesa-wrapper{background:var(--phesa-bg);padding:20px;border-radius:12px;position:relative;overflow:visible;z-index:9999;}" +',
        '      ".phesa-avatar-row{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;overflow:hidden;}" +',
        '      ".phesa-avatar-item{width:52px;height:52px;border-radius:50%;overflow:hidden;flex-shrink:0;cursor:pointer;border:2px solid transparent;transition:all 0.2s;background:" + (isDark?"#1e293b":"#fff") + ";display:flex;align-items:center;justify-content:center;font-weight:bold;color:" + (isDark?"#94a3b8":"#64748b") + ";}" +',
        '      ".phesa-avatar-item img{width:100%;height:100%;object-fit:cover;} .phesa-avatar-item:hover{transform:scale(1.08);}" +',
        '      ".phesa-avatar-item.phesa-active{border-color:var(--phesa-accent);box-shadow:0 0 8px rgba(245,158,11,0.3);}" +',
        '      ".phesa-active-card{position:absolute;top:calc(100% + 12px);left:50%;transform:translateX(-50%);z-index:9999;background:var(--phesa-card-bg);border:1px solid var(--phesa-border);border-radius:12px;padding:16px;width:320px;box-shadow:0 20px 40px -5px rgba(0,0,0,0.25),0 8px 10px -6px rgba(0,0,0,0.15);visibility:hidden;opacity:0;transition:all 0.3s;}" +',
        '      ".phesa-active-card.phesa-show{visibility:visible;opacity:1;transform:translateX(-50%) translateY(5px);}" +',
        '      ".phesa-active-card::after{content:\\"\\";position:absolute;bottom:100%;left:50%;transform:translateX(-50%);border:8px solid transparent;border-bottom-color:var(--phesa-card-bg);}" +',
        '      ".phesa-stars{color:var(--phesa-accent);font-size:16px;margin-bottom:8px;}" +',
        '      ".phesa-text{font-size:14px;line-height:1.6;color:var(--phesa-text);margin-bottom:12px;font-style:italic;}" +',
        '      ".phesa-name{font-weight:600;font-size:13px;color:var(--phesa-text);} .phesa-role{font-size:11px;color:var(--phesa-subtext);}";',
        '  } else if (type === "carousel") {',
        '    styleText += ":host { --phesa-bg:" + bg + "; --phesa-card-bg:" + cardBg + "; --phesa-text:" + (isDark?"#e5e7eb":"#1f2937") + "; --phesa-subtext:" + (isDark?"#9ca3af":"#6b7280") + "; --phesa-accent:#f59e0b; --phesa-border:" + border + "; }" +',
        '      ".phesa-wrapper{background:var(--phesa-bg);padding:48px 20px;border-radius:16px;border:1px solid var(--phesa-border);box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);position:relative;overflow:hidden;}" +',
        '      ".phesa-carousel{position:relative;overflow:hidden;width:100%;}" +',
        '      ".phesa-track{display:flex;transition:transform 0.6s cubic-bezier(0.4,0,0.2,1);}" +',
        '      ".phesa-slide{min-width:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;text-align:center;}" +',
        '      ".phesa-card-carousel{max-width:700px;padding:0 40px;display:flex;flex-direction:column;align-items:center;}" +',
        '      ".phesa-stars{color:#facc15;font-size:28px;margin-bottom:32px;display:flex;gap:6px;justify-content:center;}" +',
        '      ".phesa-text{font-size:1.25rem;line-height:1.6;font-weight:500;margin-bottom:40px;color:var(--phesa-text);letter-spacing:-0.025em;}" +',
        '      ".phesa-footer{display:flex;align-items:center;gap:16px;margin-top:auto;}" +',
        '      ".phesa-avatar{width:56px;height:56px;border-radius:50%;object-fit:cover;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);}" +',
        '      ".phesa-meta{text-align:left;}" +',
        '      ".phesa-name{font-weight:700;font-size:15px;margin:0;color:" + (isDark?"#fff":"#111827") + ";}" +',
        '      ".phesa-role{font-size:13px;color:var(--phesa-subtext);margin:2px 0 0;font-weight:500;}" +',
        '      ".phesa-arrow{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;background:" + (isDark?"#1e293b":"#ffffff") + ";border:2px solid " + (isDark?"#334155":"#f3f4f6") + ";border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);transition:all 0.2s;color:" + (isDark?"#fff":"#374151") + ";padding:0;}" +',
        '      ".phesa-arrow:hover{transform:translateY(-50%) scale(1.1);} .phesa-arrow svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;}" +',
        '      ".phesa-arrow-left{left:16px;} .phesa-arrow-right{right:16px;}" +',
        '      ".phesa-dots{display:flex;justify-content:center;gap:10px;margin-top:40px;}" +',
        '      ".phesa-dot{height:10px;border-radius:5px;background:" + (isDark?"#334155":"#e5e7eb") + ";cursor:pointer;transition:all 0.3s;width:10px;}" +',
        '      ".phesa-dot.active{width:32px;background:" + (isDark?"#fff":"#000") + ";}" +',
        '      "@media(min-width:640px){.phesa-text{font-size:1.5rem;}.phesa-wrapper{padding:48px;}}" +',
        '      "@media(max-width:640px){.phesa-card-carousel{padding:0 10px;}.phesa-text{font-size:1.1rem;}.phesa-arrow{width:32px;height:32px;}.phesa-arrow-left{left:8px;}.phesa-arrow-right{right:8px;}}";',
        '  } else if (type === "video-slide") {',
        '    styleText += ":host { --phesa-bg-light:#ffffff; --phesa-bg-dark:#0f0f10; --phesa-text-light:#111; --phesa-text-dark:#fff; --phesa-accent:#7c3aed; --phesa-muted:#9ca3af; }" +',
        '      ".phesa-container{position:relative;width:100%;max-width:720px;margin:auto;}" +',
        '      ".phesa-carousel{overflow:hidden;position:relative;border-radius:12px;}" +',
        '      ".phesa-track{display:flex;transition:transform 0.4s ease;}" +',
        '      ".phesa-card{min-width:100%;position:relative;background:var(--phesa-bg-light);color:var(--phesa-text-light);}" +',
        '      ":host(.phesa-dark) .phesa-card{background:var(--phesa-bg-dark);color:var(--phesa-text-dark);}" +',
        '      ".phesa-media{position:relative;width:100%;height:360px;background:#000;}" +',
        '      ".phesa-media img,.phesa-media video{width:100%;height:100%;object-fit:cover;}" +',
        '      ".phesa-play-btn{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:64px;height:64px;border-radius:50%;background:var(--phesa-accent);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;}" +',
        '      ".phesa-play-btn::before{content:\\"\\";border-left:14px solid white;border-top:10px solid transparent;border-bottom:10px solid transparent;margin-left:4px;}" +',
        '      ".phesa-overlay{position:absolute;bottom:0;left:0;width:100%;padding:16px;background:linear-gradient(to top,rgba(0,0,0,0.7),transparent);color:white;}" +',
        '      ".phesa-name{font-size:18px;font-weight:bold;} .phesa-role{font-size:14px;color:#ddd;}" +',
        '      ".phesa-arrow{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:20;}" +',
        '      ".phesa-arrow-left{left:-18px;} .phesa-arrow-right{right:-18px;}" +',
        '      ".phesa-arrow::before{content:\\"\\";border:solid white;border-width:0 2px 2px 0;padding:5px;display:inline-block;}" +',
        '      ".phesa-arrow-left::before{transform:rotate(135deg);} .phesa-arrow-right::before{transform:rotate(-45deg);}" +',
        '      ".phesa-badge{position:absolute;top:12px;right:12px;background:white;color:#333;padding:6px 10px;border-radius:20px;font-size:12px;font-weight:bold;z-index:10;}" +',
        '      ":host(.phesa-dark) .phesa-badge{background:#222;color:#fff;}";',
        '  } else if (type === "wall") {',
        '    styleText += ".phesa-wall{column-count:3;column-gap:24px;width:100%;padding:20px;box-sizing:border-box;}" +',
        '      ".phesa-card{break-inside:avoid;margin-bottom:24px;display:inline-block;width:100%;background:" + (isDark?"#1e293b":"#ffffff") + ";border:1px solid " + (isDark?"#334155":"#f3f4f6") + ";border-radius:16px;padding:24px;box-sizing:border-box;box-shadow:0 2px 8px -2px rgba(0,0,0,0.05);transition:all 0.3s;text-align:left;}" +',
        '      ".phesa-card:hover{transform:translateY(-4px);box-shadow:0 12px 24px -8px rgba(0,0,0,0.15);}" +',
        '      ".phesa-stars{color:#facc15;font-size:20px;margin-bottom:16px;display:flex;gap:4px;}" +',
        '      ".phesa-text{font-size:15px;line-height:1.6;font-weight:500;margin-bottom:20px;color:" + (isDark?"#e2e8f0":"#374151") + ";margin-top:0;}" +',
        '      ".phesa-footer{display:flex;align-items:center;gap:12px;padding-top:8px;}" +',
        '      ".phesa-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;background:" + (isDark?"#334155":"#f1f5f9") + ";box-shadow:0 1px 2px rgba(0,0,0,0.05);}" +',
        '      ".phesa-meta{flex:1;min-width:0;}" +',
        '      ".phesa-name{font-weight:600;font-size:14px;margin:0;color:" + (isDark?"#fff":"#111827") + ";}" +',
        '      ".phesa-role{font-size:12px;color:" + (isDark?"#94a3b8":"#6b7280") + ";margin:2px 0 0;font-weight:500;}" +',
        '      "@media(max-width:1024px){.phesa-wall{column-count:2;}} @media(max-width:640px){.phesa-wall{column-count:1;padding:10px;}}";',
        '  } else {',
        '    styleText += ".phesa-wrapper{background:" + bg + ";color:" + text + ";padding:1rem;border-radius:12px;}" +',
        '      ".phesa-wall{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}" +',
        '      ".phesa-card{background:" + cardBg + ";border:1px solid " + border + ";border-radius:8px;padding:16px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;}" +',
        '      ".phesa-header{display:flex;align-items:center;gap:12px;margin-bottom:12px;}" +',
        '      ".phesa-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#ddd;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#555;}" +',
        '      ".phesa-meta{flex:1;min-width:0;}" +',
        '      ".phesa-name{margin:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +',
        '      ".phesa-role{margin:2px 0 0;font-size:12px;opacity:0.7;}" +',
        '      ".phesa-stars{color:#facc15;font-size:14px;margin-bottom:10px;}" +',
        '      ".phesa-text{font-size:14px;line-height:1.5;margin:0;flex-grow:1;word-wrap:break-word;}" +',
        '      "@media(max-width:480px){.phesa-wall{grid-template-columns:1fr;}}";',
        '  }',
        '',
        '  style.textContent = styleText;',
        '  if (isDark) { shadow.host.classList.add("phesa-dark"); }',
        '',
        '  if (testimonials.length === 0) return;',
        '',
        '  // --- Card HTML builders (all using string concatenation, no template literals) ---',
        '  function createCardHtml(t, idx) {',
        '    var roleStr = [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");',
        '',
        '    if (type === "minimal-centered") {',
        '      var stars = showRatings ? ("<div class=\\"phesa-stars\\" style=\\"color:#ef4444;font-size:20px;justify-content:center;display:flex;gap:2px;\\">" + repeatChar("\u2605", t.rating||5) + repeatChar("\u2606", 5-(t.rating||5)) + "</div>") : "";',
        '      var avatarH = t.reviewer_photo_url',
        '        ? "<img class=\\"phesa-avatar\\" src=\\"" + escHtml(t.reviewer_photo_url) + "\\" alt=\\"" + escHtml(t.reviewer_name) + "\\"/>"',
        '        : "<div class=\\"phesa-avatar\\" style=\\"background:" + (isDark?"#334155":"#e2e8f0") + ";display:flex;align-items:center;justify-content:center;font-weight:bold;color:" + (isDark?"#94a3b8":"#64748b") + ";\\">" + escHtml((t.reviewer_name||"?").charAt(0)) + "</div>";',
        '      return "<div class=\\"phesa-card\\">" + (showPhotos ? avatarH : "") + "<div class=\\"phesa-text\\">\\"" + escHtml(t.text_content||"") + "\\"</div>" + stars + "<div class=\\"phesa-meta\\"><span class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</span>" + (roleStr ? "<span class=\\"phesa-role\\">" + escHtml(roleStr) + "</span>" : "") + "</div></div>";',
        '    }',
        '',
        '    if (type === "modern-slider") {',
        '      var avatarH = t.reviewer_photo_url',
        '        ? "<img class=\\"phesa-avatar\\" src=\\"" + escHtml(t.reviewer_photo_url) + "\\" />"',
        '        : "<div class=\\"phesa-avatar\\" style=\\"background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;\\">" + escHtml((t.reviewer_name||"?").charAt(0)) + "</div>";',
        '      var starsHtml = showRatings ? ("<div class=\\"phesa-stars\\" style=\\"color:#f59e0b;font-size:18px;display:flex;gap:2px;margin-bottom:12px;\\">" + repeatChar("\u2605",t.rating||5) + repeatChar("\u2606",5-(t.rating||5)) + "</div>") : "";',
        '      return "<div class=\\"phesa-card\\"><div class=\\"phesa-header\\"><div class=\\"phesa-user\\">" + (showPhotos?avatarH:"") + "<div><div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-role\\">" + escHtml([t.reviewer_role,t.reviewer_company].filter(Boolean).join(" at ")) + "</div></div></div><div class=\\"phesa-nav\\"><button class=\\"phesa-btn phesa-prev\\" aria-label=\\"Previous\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><path d=\\"m15 18-6-6 6-6\\"/></svg></button><button class=\\"phesa-btn phesa-next\\" aria-label=\\"Next\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><path d=\\"m9 18 6-6-6-6\\"/></svg></button></div></div><div class=\\"phesa-body\\">" + starsHtml + "<div class=\\"phesa-text\\">\\"" + escHtml(t.text_content||"") + "\\"</div></div></div>";',
        '    }',
        '',
        '    if (type === "flip-card") {',
        '      var roleText2 = [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");',
        '      var starsHtml = renderStarsSvg(t.rating||5);',
        '      var imgHtml = (showPhotos && t.reviewer_photo_url)',
        '        ? "<img src=\\"" + escHtml(t.reviewer_photo_url) + "\\" />"',
        '        : "<div style=\\"width:100%;height:100%;background:" + (isDark?"#334155":"#e2e8f0") + ";display:flex;align-items:center;justify-content:center;font-size:40px;color:" + (isDark?"#94a3b8":"#64748b") + "\\">" + escHtml((t.reviewer_name||"?").charAt(0)) + "</div>";',
        '      return "<div class=\\"phesa-card\\"><div class=\\"phesa-inner\\"><div class=\\"phesa-front\\"><div class=\\"phesa-img\\">" + imgHtml + "</div><div class=\\"phesa-overlay\\">" + starsHtml + "<div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-role\\">" + escHtml(roleText2) + "</div></div></div><div class=\\"phesa-back\\"><div class=\\"phesa-back-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-back-role\\">" + escHtml(roleText2) + "</div><div class=\\"phesa-text\\">\\"" + escHtml(t.text_content||"") + "\\"</div></div></div></div>";',
        '    }',
        '',
        '    if (type === "marquee") {',
        '      var avatarH = t.reviewer_photo_url',
        '        ? "<img class=\\"phesa-avatar\\" src=\\"" + escHtml(t.reviewer_photo_url) + "\\" />"',
        '        : "<div class=\\"phesa-avatar\\" style=\\"background:" + (isDark?"#334155":"#e2e8f0") + ";display:flex;align-items:center;justify-content:center;font-weight:bold;color:" + (isDark?"#94a3b8":"#64748b") + ";font-size:14px;\\">" + escHtml((t.reviewer_name||"?").charAt(0)) + "</div>";',
        '      return "<div class=\\"phesa-card\\"><div><div class=\\"phesa-header\\">" + (showPhotos?avatarH:"") + "<div><div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-role\\">" + escHtml([t.reviewer_role,t.reviewer_company].filter(Boolean).join(" at ")) + "</div></div></div>" + renderStarsSvg(t.rating) + "<div class=\\"phesa-text\\">\\"" + escHtml(t.text_content||"") + "\\"</div></div></div>";',
        '    }',
        '',
        '    if (type === "pills") {',
        '      var avatarH = t.reviewer_photo_url',
        '        ? "<img class=\\"phesa-avatar\\" src=\\"" + escHtml(t.reviewer_photo_url) + "\\" />"',
        '        : "<div class=\\"phesa-avatar\\" style=\\"background:" + (isDark?"#334155":"#e2e8f0") + ";display:flex;align-items:center;justify-content:center;font-weight:bold;color:" + (isDark?"#94a3b8":"#64748b") + ";font-size:10px;\\">" + escHtml((t.reviewer_name||"?").charAt(0)) + "</div>";',
        '      return "<div class=\\"phesa-pill\\">" + (showPhotos?avatarH:"") + "<div class=\\"phesa-text\\">" + escHtml(t.text_content||"") + "</div><div class=\\"phesa-quote\\">\\"</div></div>";',
        '    }',
        '',
        '    if (type === "screenshot-grid") {',
        '      var avatarH = (showPhotos && t.reviewer_photo_url)',
        '        ? "<img class=\\"phesa-avatar\\" src=\\"" + escHtml(t.reviewer_photo_url) + "\\" />"',
        '        : "<div class=\\"phesa-avatar\\" style=\\"background:" + (isDark?"#334155":"#e2e8f0") + ";display:flex;align-items:center;justify-content:center;font-weight:bold;color:" + (isDark?"#94a3b8":"#64748b") + ";font-size:12px;\\">" + escHtml((t.reviewer_name||"?").charAt(0)) + "</div>";',
        '      var starsHtml = (showRatings && t.rating)',
        '        ? "<div class=\\"phesa-stars\\">" + repeatChar("\u2605",t.rating) + repeatChar("\u2606",5-t.rating) + "</div>"',
        '        : "";',
        '      var textHtml = t.text_content ? "<div class=\\"phesa-text\\">" + escHtml(t.text_content) + "</div>" : "";',
        '      var mediaHtml = t.screenshot_url ? "<div class=\\"phesa-media\\"><img src=\\"" + escHtml(t.screenshot_url) + "\\" loading=\\"lazy\\" /></div>" : "";',
        '      return "<div class=\\"phesa-card\\"><div class=\\"phesa-header\\">" + (showPhotos?avatarH:"") + "<div><div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-role\\">" + escHtml(roleStr) + "</div></div></div>" + starsHtml + textHtml + mediaHtml + "<div class=\\"phesa-footer\\"></div></div>";',
        '    }',
        '',
        '    if (type === "split-blocks") {',
        '      var isEven = (idx || 0) % 2 === 0;',
        '      var bgClass = isEven ? "phesa-yellow" : "phesa-dynamic";',
        '      var imageFirst = isEven;',
        '      var starColor = isEven ? "#000000" : (isDark ? "#facc15" : "#f59e0b");',
        '      var nStars = t.rating || 5;',
        '      var starsHtml = showRatings',
        '        ? "<div class=\\"phesa-stars\\" style=\\"color:" + starColor + ";font-size:14px;margin-bottom:16px;letter-spacing:2px;\\">" + repeatChar("\u2605",nStars) + repeatChar("\u2606",5-nStars) + "</div>"',
        '        : "";',
        '      var photoHtml = (showPhotos && t.reviewer_photo_url)',
        '        ? "<img src=\\"" + escHtml(t.reviewer_photo_url) + "\\" style=\\"width:100%;height:100%;object-fit:cover;display:block;\\" />"',
        '        : "<div style=\\"width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#cbd5e1;font-size:50px;font-weight:bold;\\">" + escHtml(t.reviewer_name?(t.reviewer_name.charAt(0)):"P") + "</div>";',
        '      var imageBlock = "<div class=\\"phesa-block phesa-image\\">" + photoHtml + "</div>";',
        '      var roleStr2 = [t.reviewer_role,t.reviewer_company].filter(Boolean).join(" at ");',
        '      var textBlock = "<div class=\\"phesa-block phesa-text-block " + bgClass + "\\">" + starsHtml + "<div class=\\"phesa-quote\\">&ldquo;" + escHtml(t.text_content||"") + "&rdquo;</div><div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-role\\">" + escHtml(roleStr2) + "</div></div>";',
        '      return "<div class=\\"phesa-card\\">" + (imageFirst ? imageBlock+textBlock : textBlock+imageBlock) + "</div>";',
        '    }',
        '',
        '    if (type === "video-rows") {',
        '      var roleStr3 = [t.reviewer_role,t.reviewer_company].filter(Boolean).join(", ");',
        '      var thumbUrl = t.screenshot_url || (showPhotos ? t.reviewer_photo_url : null);',
        '      var thumbHtml = thumbUrl',
        '        ? "<img src=\\"" + escHtml(thumbUrl) + "\\" />"',
        '        : "<div style=\\"width:100%;height:100%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-weight:bold;font-size:32px;\\">" + escHtml(t.reviewer_name?(t.reviewer_name.charAt(0)):"P") + "</div>";',
        '      var videoAttr = t.video_url ? " data-video-url=\\"" + escHtml(t.video_url) + "\\"" : "";',
        '      var playBtn = t.video_url ? "<div class=\\"phesa-play-btn\\"></div>" : "";',
        '      return "<div class=\\"phesa-card\\"><div class=\\"phesa-video\\"" + videoAttr + ">" + thumbHtml + playBtn + "</div><div class=\\"phesa-content\\"><div class=\\"phesa-quote-icon\\">\u275d</div>" + renderStarsSvg(t.rating) + "<div class=\\"phesa-text\\">" + escHtml(t.text_content||"") + "</div><div class=\\"phesa-user\\"><div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-role\\">" + escHtml(roleStr3) + "</div></div></div></div>";',
        '    }',
        '',
        '    if (type === "video-slide") {',
        '      var hasVideo = t.video_url && t.video_url.trim() !== "";',
        '      var mediaHtml;',
        '      if (hasVideo) {',
        '        mediaHtml = "<video class=\\"phesa-video\\" preload=\\"metadata\\" playsinline><source src=\\"" + escHtml(t.video_url) + "\\" type=\\"video/mp4\\"></video><div class=\\"phesa-play-btn\\" data-action=\\"play\\"></div>";',
        '      } else if (showPhotos) {',
        '        mediaHtml = "<img src=\\"" + escHtml(t.reviewer_photo_url||t.screenshot_url||"") + "\\" />";',
        '      } else {',
        '        var initial = t.reviewer_name ? escHtml(t.reviewer_name.charAt(0).toUpperCase()) : "?";',
        '        mediaHtml = "<div style=\\"width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:" + (isDark?"#1a1a1a":"#f0f0f0") + ";color:" + (isDark?"#999":"#666") + ";\\"><div style=\\"width:80px;height:80px;border-radius:50%;background:" + (isDark?"#333":"#ddd") + ";display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:bold;margin-bottom:10px;\\">" + initial + "</div></div>";',
        '      }',
        '      return "<div class=\\"phesa-card\\"><div class=\\"phesa-media\\">" + mediaHtml + "<div class=\\"phesa-badge\\">\u2764 Testimonial</div><div class=\\"phesa-overlay\\">" + renderStarsSvg(t.rating) + "<div class=\\"phesa-name\\">" + escHtml(t.reviewer_name||"") + "</div><div class=\\"phesa-role\\">" + escHtml(t.reviewer_role||"") + (t.reviewer_company?", "+escHtml(t.reviewer_company):"") + "</div></div></div></div>";',
        '    }',
        '',
        '    if (type === "carousel") {',
        '      var rolePart = [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");',
        '      var avatarH = t.reviewer_photo_url',
        '        ? "<img class=\\"phesa-avatar\\" src=\\"" + escHtml(t.reviewer_photo_url) + "\\" alt=\\"" + escHtml(t.reviewer_name) + "\\"/>"',
        '        : "<div class=\\"phesa-avatar\\" style=\\"background:" + (isDark?"#334155":"#e2e8f0") + ";display:flex;align-items:center;justify-content:center;font-weight:bold;color:" + (isDark?"#94a3b8":"#64748b") + ";font-size:20px;\\">" + escHtml((t.reviewer_name||"?").charAt(0)) + "</div>";',
        '      return "<div class=\\"phesa-card-carousel\\">" + renderStarsSvg(t.rating) + "<div class=\\"phesa-text\\">\\"" + escHtml(t.text_content||"") + "\\"</div><div class=\\"phesa-footer\\">" + (showPhotos?avatarH:"") + "<div class=\\"phesa-meta\\"><div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div>" + (rolePart?"<div class=\\"phesa-role\\">" + escHtml(rolePart) + "</div>":"") + "</div></div></div>";',
        '    }',
        '',
        '    if (type === "wall") {',
        '      var rolePart = [t.reviewer_role, t.reviewer_company].filter(Boolean).join(" at ");',
        '      return "<div class=\\"phesa-card\\">" + renderStarsSvg(t.rating) + "<div class=\\"phesa-text\\">\\"" + escHtml(t.text_content||"") + "\\"</div><div class=\\"phesa-footer\\">" + renderAvatar(t) + "<div class=\\"phesa-meta\\"><div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-role\\">" + escHtml(rolePart) + "</div></div></div></div>";',
        '    }',
        '',
        '    // Generic fallback',
        '    var roleCompany = escHtml(t.reviewer_role||"");',
        '    if (t.reviewer_company) roleCompany += (roleCompany?", ":"") + escHtml(t.reviewer_company);',
        '    var videoHtml = t.video_url ? "<a href=\\"" + escHtml(t.video_url) + "\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\" class=\\"phesa-video-btn\\">&#9654; Watch Video</a>" : "";',
        '    return "<div class=\\"phesa-card\\"><div class=\\"phesa-header\\">" + renderAvatar(t) + "<div class=\\"phesa-meta\\"><p class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</p>" + (roleCompany?"<p class=\\"phesa-role\\">" + roleCompany + "</p>":"") + "</div></div>" + renderStarsSvg(t.rating) + "<p class=\\"phesa-text\\">" + escHtml(t.text_content||"") + "</p>" + videoHtml + "</div>";',
        '  }',
        '',
        '  function repeatChar(ch, n) {',
        '    var s = ""; for (var i = 0; i < n; i++) s += ch; return s;',
        '  }',
        '',
        '  // --- Wrapper rendering ---',
        '  var wrapper = document.createElement("div");',
        '  wrapper.className = "phesa-wrapper";',
        '',
        '  if (type === "carousel") {',
        '    var html = "<div class=\\"phesa-carousel\\"><button class=\\"phesa-arrow phesa-arrow-left\\" id=\\"phesa-prev\\" aria-label=\\"Previous slide\\"><svg viewBox=\\"0 0 24 24\\"><path d=\\"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z\\"/></svg></button><button class=\\"phesa-arrow phesa-arrow-right\\" id=\\"phesa-next\\" aria-label=\\"Next slide\\"><svg viewBox=\\"0 0 24 24\\"><path d=\\"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z\\"/></svg></button><div class=\\"phesa-track\\" id=\\"phesa-track\\">";',
        '    for (var i = 0; i < testimonials.length; i++) { html += "<div class=\\"phesa-slide\\">" + createCardHtml(testimonials[i]) + "</div>"; }',
        '    html += "</div><div class=\\"phesa-dots\\" id=\\"phesa-dots\\">";',
        '    for (var i = 0; i < testimonials.length; i++) { html += "<div class=\\"phesa-dot " + (i===0?"active":"") + "\\" data-idx=\\"" + i + "\\"></div>"; }',
        '    html += "</div></div>";',
        '    wrapper.innerHTML = html;',
        '    var track = wrapper.querySelector("#phesa-track");',
        '    var dots = wrapper.querySelectorAll(".phesa-dot");',
        '    var prevBtn = wrapper.querySelector("#phesa-prev");',
        '    var nextBtn = wrapper.querySelector("#phesa-next");',
        '    var currentIdx = 0;',
        '    var update = function(idx) {',
        '      currentIdx = (idx + testimonials.length) % testimonials.length;',
        '      track.style.transform = "translateX(-" + (currentIdx * 100) + "%)";',
        '      dots.forEach(function(d, i) { d.classList.toggle("active", i === currentIdx); });',
        '    };',
        '    dots.forEach(function(d) { d.onclick = function() { update(parseInt(d.dataset.idx)); resetInterval(); }; });',
        '    prevBtn.onclick = function(e) { e.preventDefault(); update(currentIdx - 1); resetInterval(); };',
        '    nextBtn.onclick = function(e) { e.preventDefault(); update(currentIdx + 1); resetInterval(); };',
        '    var autoInterval = setInterval(function() { update(currentIdx + 1); }, 3000);',
        '    var resetInterval = function() { clearInterval(autoInterval); autoInterval = setInterval(function() { update(currentIdx + 1); }, 3000); };',
        '',
        '  } else if (type === "modern-slider") {',
        '    var index = 0;',
        '    var content = document.createElement("div");',
        '    wrapper.appendChild(content);',
        '    var autoInterval = setInterval(function() { index = (index+1)%testimonials.length; render(); }, 5000);',
        '    var resetInterval = function() { clearInterval(autoInterval); autoInterval = setInterval(function() { index=(index+1)%testimonials.length; render(); }, 5000); };',
        '    var render = function() {',
        '      content.innerHTML = createCardHtml(testimonials[index]);',
        '      var pB = content.querySelector(".phesa-prev"); var nB = content.querySelector(".phesa-next");',
        '      if (pB) pB.onclick = function(e) { e.preventDefault(); index=(index-1+testimonials.length)%testimonials.length; render(); resetInterval(); };',
        '      if (nB) nB.onclick = function(e) { e.preventDefault(); index=(index+1)%testimonials.length; render(); resetInterval(); };',
        '    };',
        '    render();',
        '',
        '  } else if (type === "flip-card") {',
        '    var html = "<div class=\\"phesa-row\\">";',
        '    for (var i = 0; i < testimonials.length; i++) { html += createCardHtml(testimonials[i]); }',
        '    html += "</div>";',
        '    wrapper.innerHTML = html;',
        '',
        '  } else if (type === "marquee") {',
        '    var mid = Math.ceil(testimonials.length / 2);',
        '    var row1 = testimonials.slice(0, mid); var row2 = testimonials.slice(mid);',
        '    var row1Html = ""; var row2Html = "";',
        '    var r1t = row1.concat(row1).concat(row1); for (var i=0; i<r1t.length; i++) row1Html += createCardHtml(r1t[i]);',
        '    var r2t = row2.concat(row2).concat(row2); for (var i=0; i<r2t.length; i++) row2Html += createCardHtml(r2t[i]);',
        '    var dur1 = Math.max(row1.length*10,10); var dur2 = Math.max(row2.length*10,10);',
        '    wrapper.innerHTML = "<div class=\\"phesa-row phesa-row-left\\" style=\\"animation-duration:" + dur1 + "s\\">" + row1Html + "</div>" + (row2.length>0?"<div class=\\"phesa-row phesa-row-right\\" style=\\"animation-duration:" + dur2 + "s\\">" + row2Html + "</div>":"");',
        '',
        '  } else if (type === "pills") {',
        '    var mid = Math.ceil(testimonials.length / 2);',
        '    var row1 = testimonials.slice(0, mid); var row2 = testimonials.slice(mid);',
        '    var row1Html = ""; var row2Html = "";',
        '    var r1t = row1.concat(row1).concat(row1); for (var i=0; i<r1t.length; i++) row1Html += createCardHtml(r1t[i]);',
        '    var r2t = row2.concat(row2).concat(row2); for (var i=0; i<r2t.length; i++) row2Html += createCardHtml(r2t[i]);',
        '    var dur1 = Math.max(row1.length*10,10); var dur2 = Math.max(row2.length*10,10);',
        '    wrapper.innerHTML = "<div class=\\"phesa-row phesa-row-left\\" style=\\"animation-duration:" + dur1 + "s\\">" + row1Html + "</div>" + (row2.length>0?"<div class=\\"phesa-row phesa-row-right\\" style=\\"animation-duration:" + dur2 + "s\\">" + row2Html + "</div>":"");',
        '',
        '  } else if (type === "screenshot-grid") {',
        '    var html = "<div class=\\"phesa-grid\\">";',
        '    for (var i = 0; i < testimonials.length; i++) { html += createCardHtml(testimonials[i]); }',
        '    html += "</div>";',
        '    wrapper.innerHTML = html;',
        '',
        '  } else if (type === "split-blocks") {',
        '    var html = "<div class=\\"phesa-grid\\">";',
        '    for (var i = 0; i < testimonials.length; i++) { html += createCardHtml(testimonials[i], i); }',
        '    html += "</div>";',
        '    wrapper.innerHTML = html;',
        '',
        '  } else if (type === "video-rows") {',
        '    var html = "<div class=\\"phesa-container\\">";',
        '    for (var i = 0; i < testimonials.length; i++) { html += createCardHtml(testimonials[i]); }',
        '    html += "</div><div class=\\"phesa-lightbox\\" id=\\"phesaLightbox\\"><div class=\\"phesa-lightbox-inner\\"><button class=\\"phesa-lightbox-close\\" id=\\"phesaLightboxClose\\">&#x2715;</button><video id=\\"phesaLightboxVideo\\" controls controlslist=\\"nodownload\\" playsinline></video></div></div>";',
        '    wrapper.innerHTML = html;',
        '    var lightbox = wrapper.querySelector("#phesaLightbox");',
        '    var lbVideo = wrapper.querySelector("#phesaLightboxVideo");',
        '    var lbClose = wrapper.querySelector("#phesaLightboxClose");',
        '    var openLightbox = function(url) { lbVideo.src=url; lightbox.classList.add("phesa-open"); lbVideo.play().catch(function(e){ console.warn("Phesa: Autoplay blocked.",e); }); };',
        '    var closeLightbox = function() { lightbox.classList.remove("phesa-open"); lbVideo.pause(); lbVideo.src=""; };',
        '    lbClose.onclick = closeLightbox;',
        '    lightbox.onclick = function(e) { if (e.target===lightbox) closeLightbox(); };',
        '    document.addEventListener("keydown", function(e) { if (e.key==="Escape") closeLightbox(); });',
        '    wrapper.querySelector(".phesa-container").onclick = function(e) { var thumb = e.target.closest("[data-video-url]"); if (thumb) openLightbox(thumb.dataset.videoUrl); };',
        '',
        '  } else if (type === "video-slide") {',
        '    var html = "<div class=\\"phesa-container\\"><div class=\\"phesa-arrow phesa-arrow-left\\" id=\\"phesaPrev\\"></div><div class=\\"phesa-arrow phesa-arrow-right\\" id=\\"phesaNext\\"></div><div class=\\"phesa-carousel\\"><div class=\\"phesa-track\\" id=\\"phesaTrack\\">";',
        '    for (var i = 0; i < testimonials.length; i++) { html += createCardHtml(testimonials[i]); }',
        '    html += "</div></div></div>";',
        '    wrapper.innerHTML = html;',
        '    var track = wrapper.querySelector("#phesaTrack");',
        '    var prev = wrapper.querySelector("#phesaPrev"); var next = wrapper.querySelector("#phesaNext");',
        '    var cur = 0; var isAutoPaused = false;',
        '    var updateSlide = function() { track.style.transform = "translateX(-" + (cur*100) + "%)"; };',
        '    var autoInterval = setInterval(function() { if (!isAutoPaused) { cur=(cur+1)%testimonials.length; updateSlide(); } }, 3000);',
        '    var resetInterval = function() { clearInterval(autoInterval); autoInterval = setInterval(function() { if(!isAutoPaused){cur=(cur+1)%testimonials.length;updateSlide();} }, 3000); };',
        '    next.onclick = function(e) { e.preventDefault(); isAutoPaused=false; cur=(cur+1)%testimonials.length; updateSlide(); resetInterval(); };',
        '    prev.onclick = function(e) { e.preventDefault(); isAutoPaused=false; cur=(cur-1+testimonials.length)%testimonials.length; updateSlide(); resetInterval(); };',
        '    track.onclick = function(e) {',
        '      var btn = e.target.closest("[data-action=\\"play\\"]");',
        '      if (btn) { var video = btn.parentElement.querySelector("video"); if (video) { isAutoPaused=true; video.play(); btn.style.display="none"; video.controls=true; } }',
        '    };',
        '',
        '  } else if (type === "avatar-select") {',
        '    wrapper.innerHTML = "<div class=\\"phesa-container\\"><div class=\\"phesa-left\\" id=\\"phesaLeft\\"></div><div class=\\"phesa-right\\" id=\\"phesaRight\\"></div></div>";',
        '    var left = wrapper.querySelector("#phesaLeft");',
        '    var right = wrapper.querySelector("#phesaRight");',
        '    var activeIdx = 0;',
        '    var renderSel = function() {',
        '      var t = testimonials[activeIdx];',
        '      var rp = [t.reviewer_role,t.reviewer_company].filter(Boolean).join(" at ");',
        '      var starHtml = showRatings ? ("<div class=\\"phesa-stars\\">" + repeatChar("\u2605",t.rating||5) + repeatChar("\u2606",5-(t.rating||5)) + "</div>") : "";',
        '      left.innerHTML = "<div class=\\"phesa-quote\\">\u201c</div>" + starHtml + "<div class=\\"phesa-text\\">\\"" + escHtml(t.text_content||"") + "\\"</div><div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-role\\">" + escHtml(rp) + "</div>";',
        '      right.innerHTML = testimonials.map(function(tt,i) {',
        '        var avatarText = tt.reviewer_name ? escHtml(tt.reviewer_name.charAt(0)) : "?";',
        '        var imgH = (showPhotos&&tt.reviewer_photo_url) ? "<img src=\\""+escHtml(tt.reviewer_photo_url)+"\\" />" : avatarText;',
        '        return "<div class=\\"phesa-avatar-box " + (i===activeIdx?"phesa-active":"") + "\\" data-idx=\\"" + i + "\\">" + imgH + "</div>";',
        '      }).join("");',
        '      right.querySelectorAll(".phesa-avatar-box").forEach(function(box) {',
        '        box.onclick = function() { activeIdx=parseInt(box.dataset.idx); renderSel(); };',
        '      });',
        '    };',
        '    renderSel();',
        '',
        '  } else if (type === "avatar-list") {',
        '    wrapper.innerHTML = "<div class=\\"phesa-avatar-row\\" id=\\"phesaAvatarRow\\"></div><div id=\\"phesaActiveCard\\" class=\\"phesa-active-card\\"></div>";',
        '    var row = wrapper.querySelector("#phesaAvatarRow");',
        '    var card = wrapper.querySelector("#phesaActiveCard");',
        '    var activeIdx = -1;',
        '    var renderList = function() {',
        '      var tSlice = testimonials.slice(0, 15);',
        '      row.innerHTML = tSlice.map(function(tt,i) {',
        '        var avatarText = tt.reviewer_name ? escHtml(tt.reviewer_name.charAt(0)) : "?";',
        '        var imgH = (showPhotos&&tt.reviewer_photo_url) ? "<img src=\\""+escHtml(tt.reviewer_photo_url)+"\\" />" : avatarText;',
        '        return "<div class=\\"phesa-avatar-item " + (i===activeIdx?"phesa-active":"") + "\\" data-idx=\\"" + i + "\\">" + imgH + "</div>";',
        '      }).join("");',
        '      if (activeIdx >= 0) {',
        '        var t = testimonials[activeIdx];',
        '        var stars = repeatChar("\u2605",t.rating||5) + repeatChar("\u2606",5-(t.rating||5));',
        '        var rp = [t.reviewer_role,t.reviewer_company].filter(Boolean).join(" at ");',
        '        card.innerHTML = (showRatings?"<div class=\\"phesa-stars\\">"+stars+"</div>":"") + "<div class=\\"phesa-text\\">\\"" + escHtml(t.text_content||"") + "\\"</div><div class=\\"phesa-name\\">" + escHtml(t.reviewer_name) + "</div><div class=\\"phesa-role\\">" + escHtml(rp) + "</div>";',
        '        card.classList.add("phesa-show");',
        '      } else {',
        '        card.classList.remove("phesa-show");',
        '      }',
        '      row.querySelectorAll(".phesa-avatar-item").forEach(function(item) {',
        '        item.onclick = function(e) { e.stopPropagation(); var ti=parseInt(item.dataset.idx); activeIdx=(activeIdx===ti)?-1:ti; renderList(); };',
        '      });',
        '    };',
        '    document.addEventListener("click", function(e) { if (!wrapper.contains(e.target)) { activeIdx=-1; renderList(); } });',
        '    renderList();',
        '',
        '  } else if (type === "minimal-centered") {',
        '    var html = "";',
        '    for (var i = 0; i < testimonials.length; i++) { html += createCardHtml(testimonials[i]); }',
        '    wrapper.innerHTML = html;',
        '',
        '  } else if (type === "wall") {',
        '    var html = "<div class=\\"phesa-wall\\">";',
        '    for (var i = 0; i < testimonials.length; i++) { html += createCardHtml(testimonials[i]); }',
        '    html += "</div>";',
        '    wrapper.innerHTML = html;',
        '',
        '  } else {',
        '    var html = "<div class=\\"phesa-wall\\">";',
        '    for (var i = 0; i < testimonials.length; i++) { html += createCardHtml(testimonials[i]); }',
        '    html += "</div>";',
        '    wrapper.innerHTML = html;',
        '  }',
        '',
        '  if (brandingOn) {',
        '    var branding = document.createElement("div");',
        '    branding.className = "phesa-branding";',
        '    branding.innerHTML = "Powered by <a href=\\"https://phesa.com\\" target=\\"_blank\\">Phesa</a>";',
        '    wrapper.appendChild(branding);',
        '  }',
        '',
        '  shadow.appendChild(style);',
        '  shadow.appendChild(wrapper);',
        '})();'
      ].join('\n');

      res.setHeader('Content-Type', 'application/javascript');
      res.send(script);
    } catch (error) {
      console.error('Error serving widget script:', error);
      res.status(500).send('console.warn("Phesa Widget: Execution encountered an error rendering.");');
    }
  }
};

module.exports = widgetController;