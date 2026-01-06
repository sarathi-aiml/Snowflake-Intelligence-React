/**
 * GET /api/auth/me
 * Returns the currently authenticated user with complete information including role
 * Requires valid JWT token (or demo mode)
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { getUserById } from '@/lib/db/users';

// Demo user object (matches frontend)
const DEMO_USER = {
    id: 'demo-user-id',
    email: 'demo@example.com',
    name: 'Demo User',
    role: 'USER',
    picture: null,
    isDemo: true
};

export async function GET(request) {
    try {
        // Check if demo mode is enabled
        const isDemoMode = process.env.DEMO === 'true';
        
        if (isDemoMode) {
            // Return demo user without database lookup
            return Response.json({
                user: DEMO_USER
            });
        }

        // Get user from request
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const user = await getUserById(userResult.user.id);

        if (!user) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Return complete user information including role
        return Response.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                firstName: user.firstName,
                lastName: user.lastName,
                companyName: user.companyName,
                address: user.address,
                phone: user.phone,
                enableGoogleLogin: user.enableGoogleLogin,
                picture: user.picture,
                role: user.role || 'USER',
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLogin: user.lastLogin
            }
        });
    } catch (err) {
        console.error('[GET /api/auth/me] Error:', err.message);
        return Response.json({ error: 'Failed to get user', details: err.message }, { status: 500 });
    }
}

