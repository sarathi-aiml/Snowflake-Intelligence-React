/**
 * Next.js compatible authentication helpers
 * Adapts Express-style auth middleware for Next.js API routes
 */

const jwt = require('jsonwebtoken');
const { getUserById } = require('../db/users');

const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || 'your-secret-key-change-in-production';

/**
 * Extract user from Next.js Request object
 * Returns { user, error, status }
 */
async function getUserFromRequest(request) {
    try {
        // Check if demo mode is enabled
        const isDemoMode = process.env.DEMO === 'true';
        
        if (isDemoMode) {
            // Return demo user without token verification
            return {
                user: {
                    id: 'demo-user-id',
                    email: 'demo@example.com',
                    name: 'Demo User',
                    role: 'USER',
                    picture: null,
                    isDemo: true
                }
            };
        }

        // Get token from Authorization header or cookie
        let token = null;

        // Check Authorization header: "Bearer <token>"
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }

        // Check cookie as fallback
        if (!token) {
            const cookieHeader = request.headers.get('cookie');
            if (cookieHeader) {
                const cookies = Object.fromEntries(
                    cookieHeader.split('; ').map(c => {
                        const [key, ...vals] = c.split('=');
                        return [key, vals.join('=')];
                    })
                );
                token = cookies.token;
            }
        }

        // Check query parameter as last resort (for OAuth callback redirects)
        if (!token) {
            const url = new URL(request.url);
            token = url.searchParams.get('token');
        }

        if (!token) {
            return { error: 'Authentication required. No token provided.', status: 401 };
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return { error: 'Token expired. Please log in again.', status: 401 };
            } else if (err.name === 'JsonWebTokenError') {
                return { error: 'Invalid token.', status: 401 };
            }
            throw err;
        }

        // Get user from database
        const user = await getUserById(decoded.userId);
        if (!user) {
            return { error: 'User not found. Token may be invalid.', status: 401 };
        }

        // Return user object
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture,
                role: user.role
            }
        };
    } catch (err) {
        console.error('[getUserFromRequest] Error:', err.message);
        return { error: 'Authentication error', details: err.message, status: 500 };
    }
}

/**
 * Check if user is admin
 */
function requireAdmin(user) {
    if (!user) {
        return { error: 'Authentication required', status: 401 };
    }

    if (user.role !== 'ADMIN') {
        return { error: 'Admin access required', status: 403 };
    }

    return null; // No error
}

module.exports = {
    getUserFromRequest,
    requireAdmin
};

