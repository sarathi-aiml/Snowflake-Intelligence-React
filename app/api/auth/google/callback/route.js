/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback
 */

import { redirect } from 'next/navigation';
import { findOrCreateUser } from '@/lib/db/users';
import { generateToken } from '@/lib/middleware/auth';

// Helper function to extract base URL from state
function getFrontendBaseUrl(state, defaultUrl) {
    if (!state) return defaultUrl;
    try {
        const stateUrl = new URL(state);
        return stateUrl.origin;
    } catch {
        return defaultUrl;
    }
}

export async function GET(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    // Get current host from request (works for both localhost and Vercel)
    const host = request.headers.get('host') || '';
    const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const currentOrigin = `${protocol}://${host}`;
    
    // Use environment variable or construct from current request
    const FRONTEND_URL = process.env.FRONTEND_URL
        ? process.env.FRONTEND_URL.split(',').map(url => url.trim())[0]
        : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : currentOrigin);

    if (!code) {
        const error = url.searchParams.get('error');
        const frontendBaseUrl = getFrontendBaseUrl(state, FRONTEND_URL);
        redirect(`${frontendBaseUrl}/login?error=${error || 'auth_failed'}`);
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    
    // Use environment variable or construct from current request
    const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL
        ? process.env.GOOGLE_CALLBACK_URL.split(',').map(url => url.trim())[0]
        : `${currentOrigin}/api/auth/google/callback`;

    // Handle OAuth flow
    let user = null;
    let errorMessage = null;

    try {
        // Exchange code for access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: GOOGLE_CALLBACK_URL,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenResponse.ok) {
            throw new Error('Failed to exchange code for token');
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Get user profile from Google
        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!profileResponse.ok) {
            throw new Error('Failed to get user profile');
        }

        const profile = await profileResponse.json();

        // Find or create user
        const email = profile.email;
        const name = profile.name || profile.given_name || '';
        const picture = profile.picture || '';

        if (!email) {
            errorMessage = 'no_email';
        } else {
            user = await findOrCreateUser(email, name, picture);
            if (!user) {
                errorMessage = 'user_not_found';
            }
        }
    } catch (err) {
        console.error('[Google Callback] Error:', err?.message || err);
        errorMessage = 'server_error';
    }

    // Handle redirects (outside try-catch to avoid catching NEXT_REDIRECT)
    const frontendBaseUrl = getFrontendBaseUrl(state, FRONTEND_URL);

    if (errorMessage) {
        redirect(`${frontendBaseUrl}/login?error=${errorMessage}`);
    }

    if (!user) {
        redirect(`${frontendBaseUrl}/login?error=user_not_found`);
    }

    // Generate JWT token
    const token = generateToken(user);

    // Determine redirect URL - extract base URL from state if it includes a path
    let redirectUrl = getFrontendBaseUrl(state, FRONTEND_URL);

    // Validate redirect URL
    try {
        const redirectUrlObj = new URL(redirectUrl);
        const isValid = FRONTEND_URLS.some(allowedUrl => {
            try {
                const allowedObj = new URL(allowedUrl);
                return redirectUrlObj.origin === allowedObj.origin;
            } catch {
                return false;
            }
        });

        if (!isValid) {
            console.warn(`[Google Callback] Invalid redirect URL: ${redirectUrl}, using default`);
            redirectUrl = FRONTEND_URL;
        }
    } catch (urlError) {
        console.warn(`[Google Callback] Invalid redirect URL format: ${redirectUrl}, using default`);
        redirectUrl = FRONTEND_URL;
    }

        // Redirect to frontend callback page with token (or home if state doesn't include callback path)
        // Always use /auth/callback so the token gets properly extracted and stored
        const redirectWithToken = `${redirectUrl}/auth/callback?token=${encodeURIComponent(token)}`;
        redirect(redirectWithToken);
}
