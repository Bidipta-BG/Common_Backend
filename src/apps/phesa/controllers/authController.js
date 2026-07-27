const { google } = require('googleapis');
const supabase = require('../lib/supabase');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const PHESA_FRONTEND_URL = process.env.PHESA_FRONTEND_URL || 'http://localhost:3000';

const authController = {
  // GET /api/phesa/google/login
  googleLogin: async (req, res) => {
    try {
      const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
      );

      const scopes = [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ];

      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent'
      });

      res.redirect(url);
    } catch (error) {
      console.error('Google Auth Login Initiation Error:', error);
      res.status(500).json({ error: 'Failed to initiate Google login' });
    }
  },

  googleCallback: async (req, res) => {
    try {
      const { code, error: authError } = req.query;

      // User clicked "Cancel" on the Google consent screen
      if (authError) {
        console.error('Google Auth cancelled by user:', authError);
        return res.redirect(`${PHESA_FRONTEND_URL}/login`);
      }

      if (!code) {
        return res.redirect(`${PHESA_FRONTEND_URL}/login`);
      }

      const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
      );

      // 1. Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // 2. Fetch user info from Google
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: googleUser } = await oauth2.userinfo.get();

      if (!googleUser.email) {
        return res.status(400).json({ error: 'Google account must have an email' });
      }

      // 3. Sync with Supabase Auth & Profiles
      // First, check if user exists in auth.users (admin level)
      const { data: users, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw listError;

      let user = users.users.find(u => u.email === googleUser.email);

      if (user) {
        // 4. Upsert into public.profiles for existing users
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: googleUser.email,
            full_name: googleUser.name,
            avatar_url: googleUser.picture,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });

        if (profileError) {
          console.error('Error syncing profile:', profileError);
        }
      }
      // If user does not exist, we let the frontend signInWithIdToken create the user cleanly 
      // with provider: 'google', avoiding Gotrue account linking emails entirely.

      // 5. Redirect back to frontend callback page
      const redirectUrl = new URL(`${PHESA_FRONTEND_URL}/auth/callback`);
      redirectUrl.searchParams.set('google_access_token', tokens.access_token);
      if (tokens.id_token) {
        redirectUrl.searchParams.set('id_token', tokens.id_token);
      }
      
      return res.redirect(redirectUrl.toString());

    } catch (error) {
      console.error('Google Auth Callback Error:', error);
      // Redirect to frontend login with error
      const errorUrl = new URL(`${PHESA_FRONTEND_URL}/login`);
      errorUrl.searchParams.set('error', 'auth_failed');
      return res.redirect(errorUrl.toString());
    }
  }
};

module.exports = authController;
