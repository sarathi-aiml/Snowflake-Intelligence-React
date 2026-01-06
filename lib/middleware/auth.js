/**
 * Authentication middleware
 * Verifies JWT tokens and attaches user to request
 */

const jwt = require('jsonwebtoken');
const { getUserById } = require('../db/users');

const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || 'your-secret-key-change-in-production';

/**
 * Middleware to verify JWT token and attach user to request
 * Sets req.user if token is valid, otherwise returns 401
 */
async function authMiddleware(req, res, next) {
    try {
        // Check if demo mode is enabled
        const isDemoMode = process.env.DEMO === 'true';
        
        if (isDemoMode) {
            // Set demo user and continue
            req.user = {
                id: 'demo-user-id',
                email: 'demo@example.com',
                name: 'Demo User',
                role: 'USER',
                picture: null,
                isDemo: true
            };
            return next();
        }

        // Get token from Authorization header or cookie
        let token = null;

        // Check Authorization header: "Bearer <token>"
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }

        // Check cookie as fallback
        if (!token && req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        // Check query parameter as last resort (for OAuth callback redirects)
        if (!token && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ error: 'Authentication required. No token provided.' });
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired. Please log in again.' });
            } else if (err.name === 'JsonWebTokenError') {
                return res.status(401).json({ error: 'Invalid token.' });
            }
            throw err;
        }

        // Get user from database
        const user = await getUserById(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'User not found. Token may be invalid.' });
        }

        // Attach user to request
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            role: user.role
        };

        next();
    } catch (err) {
        console.error('[authMiddleware] Error:', err.message);
        return res.status(500).json({ error: 'Authentication error', details: err.message });
    }
}

/**
 * Middleware to require admin role
 * Must be used after authMiddleware
 */
function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
}

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role
    };

    // Token expires in 7 days
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

module.exports = {
    authMiddleware,
    requireAdmin,
    generateToken
};

