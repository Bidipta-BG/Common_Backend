const { supabase } = require('../config/supabaseClient');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
    }

    req.trkerUser = user;
    next();
  } catch (error) {
    console.error('Trker Auth Middleware Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during authentication' });
  }
};

module.exports = authMiddleware;
