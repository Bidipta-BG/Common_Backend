const { google } = require('googleapis');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

/**
 * Configure the OAuth2 client.
 */
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

/**
 * Required OAuth scopes for Phesa:
 * - business.manage: For Google Business Profile reviews.
 * - userinfo.profile: For profile photo and name.
 * - userinfo.email: For user identification.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

/**
 * Generates the Google OAuth consent URL.
 * @param {string} state - State parameter to prevent CSRF.
 * @returns {string} - The authorization URL.
 */
const getAuthUrl = (state) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Important for receiving a refresh token
    scope: SCOPES,
    include_granted_scopes: true,
    state: state,
    prompt: 'consent' // Forces consent screen to ensure refresh token is returned
  });
};

/**
 * Exchanges an authorization code for tokens.
 * @param {string} code - Authorization code from callback.
 * @returns {Promise<Object>} - { access_token, refresh_token, expiry_date }
 */
const getTokens = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    };
  } catch (error) {
    console.error('Error exchanging Google OAuth code:', error);
    throw new Error(`Google OAuth Token Exchange failed: ${error.message}`);
  }
};

/**
 * Refreshes an access token using a refresh token.
 * @param {string} refresh_token - The existing refresh token.
 * @returns {Promise<Object>} - { access_token, expiry_date }
 */
const refreshAccessToken = async (refresh_token) => {
  try {
    const client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
    client.setCredentials({ refresh_token });

    const { credentials } = await client.refreshAccessToken();
    return {
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date
    };
  } catch (error) {
    console.error('Error refreshing Google access token:', error);
    throw new Error(`Google OAuth Token Refresh failed: ${error.message}`);
  }
};

module.exports = {
  oauth2Client,
  SCOPES,
  getAuthUrl,
  getTokens,
  refreshAccessToken
};
