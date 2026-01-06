/**
 * GET /api/auth/google
 * Initiates Google OAuth login flow
 */

import { redirect } from 'next/navigation';

export async function GET(request) {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return Response.json({ error: 'Google OAuth not configured' }, { status: 500 });
    }

    const url = new URL(request.url);
    const redirectUrl = url.searchParams.get('redirect');
    
    // Get current host from request (works for both localhost and Vercel)
    const host = request.headers.get('host') || '';
    const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const currentOrigin = `${protocol}://${host}`;
    
    // Build Google OAuth URL manually (Next.js doesn't have direct Passport support in App Router)
    const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
    
    // Use environment variable or construct from current request
    const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL
        ? process.env.GOOGLE_CALLBACK_URL.split(',').map(url => url.trim())[0]
        : `${currentOrigin}/api/auth/google/callback`;

    // Use environment variable or construct from current request
    const FRONTEND_URL = process.env.FRONTEND_URL
        ? process.env.FRONTEND_URL.split(',').map(url => url.trim())[0]
        : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : currentOrigin);

    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_CALLBACK_URL,
        response_type: 'code',
        scope: 'profile email',
        state: redirectUrl || FRONTEND_URL
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    
    // redirect() throws NEXT_REDIRECT error internally - don't catch it
    redirect(authUrl);
}

