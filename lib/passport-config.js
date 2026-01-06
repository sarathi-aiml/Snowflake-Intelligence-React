/**
 * Passport configuration for Next.js
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { findOrCreateUser } = require('./db/users');
const { generateToken } = require('./middleware/auth');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Parse multiple callback URLs
const GOOGLE_CALLBACK_URLS = process.env.GOOGLE_CALLBACK_URL
    ? process.env.GOOGLE_CALLBACK_URL.split(',').map(url => url.trim())
    : ['http://localhost:3000/auth/google/callback'];

const GOOGLE_CALLBACK_URL = GOOGLE_CALLBACK_URLS[0];

// Parse multiple frontend URLs
const FRONTEND_URLS = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : (process.env.CORS_ORIGIN?.split(',').map(url => url.trim()) || ['http://localhost:3000']);

const FRONTEND_URL = FRONTEND_URLS[0];

function getFrontendUrl(req) {
    const origin = req?.headers?.origin || req?.headers?.referer;
    
    if (origin) {
        const matchingUrl = FRONTEND_URLS.find(url => {
            try {
                const urlObj = new URL(url);
                const originObj = new URL(origin);
                return urlObj.origin === originObj.origin;
            } catch {
                return false;
            }
        });
        
        if (matchingUrl) {
            return matchingUrl;
        }
    }
    
    return FRONTEND_URL;
}

// Configure Google OAuth Strategy
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(
        new GoogleStrategy(
            {
                clientID: GOOGLE_CLIENT_ID,
                clientSecret: GOOGLE_CLIENT_SECRET,
                callbackURL: GOOGLE_CALLBACK_URL
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const email = profile.emails?.[0]?.value;
                    const name = profile.displayName || profile.name?.givenName || '';
                    const picture = profile.photos?.[0]?.value || '';

                    if (!email) {
                        return done(new Error('No email found in Google profile'), null);
                    }

                    const user = await findOrCreateUser(email, name, picture);
                    return done(null, user);
                } catch (err) {
                    console.error('[GoogleStrategy] Error:', err.message);
                    return done(err, null);
                }
            }
        )
    );
} else {
    console.warn('[Auth] Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google login.');
}

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const { getUserById } = require('./db/users');
        const user = await getUserById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = {
    passport,
    getFrontendUrl,
    FRONTEND_URLS,
    FRONTEND_URL
};

