/**
 * Admin routes for users
 * User management endpoints (admin only)
 * GET /api/admin/users - List all users
 * POST /api/admin/users - Create a new user
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest, requireAdmin } from '@/lib/middleware/auth-nextjs';
import { getAllUsers, createUser } from '@/lib/db/users';

export async function GET(request) {
    try {
        // Check authentication and admin role
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const adminCheck = requireAdmin(userResult.user);
        if (adminCheck) {
            return Response.json({ error: adminCheck.error }, { status: adminCheck.status });
        }

        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get('limit')) || 100;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        const users = await getAllUsers(limit, offset);

        console.log(`[GET /api/admin/users] Returning ${users.length} users`);

        return Response.json({
            users: (users || []).map(user => ({
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
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLogin: user.lastLogin
            })),
            count: users ? users.length : 0,
            limit,
            offset
        });
    } catch (err) {
        console.error('[GET /api/admin/users] Error:', err.message);
        console.error('[GET /api/admin/users] Stack:', err.stack);
        return Response.json({ error: 'Failed to get users', details: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        console.log('[POST /api/admin/users] Creating new user');
        // Check authentication and admin role
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const adminCheck = requireAdmin(userResult.user);
        if (adminCheck) {
            return Response.json({ error: adminCheck.error }, { status: adminCheck.status });
        }

        const body = await request.json();
        console.log('[POST /api/admin/users] Request body:', { ...body, email: body.email });
        const { firstName, lastName, email, companyName, address, phone, enableGoogleLogin, role } = body;

        // Validate required fields
        if (!firstName || !firstName.trim()) {
            return Response.json({ error: 'First name is required' }, { status: 400 });
        }
        if (!lastName || !lastName.trim()) {
            return Response.json({ error: 'Last name is required' }, { status: 400 });
        }
        if (!email || !email.trim()) {
            return Response.json({ error: 'Email is required' }, { status: 400 });
        }
        if (!companyName || !companyName.trim()) {
            return Response.json({ error: 'Company name is required' }, { status: 400 });
        }
        if (!phone || !phone.trim()) {
            return Response.json({ error: 'Phone is required' }, { status: 400 });
        }
        if (enableGoogleLogin === undefined || enableGoogleLogin === null) {
            return Response.json({ error: 'Enable Google login is required (true or false)' }, { status: 400 });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return Response.json({ error: 'Invalid email format' }, { status: 400 });
        }

        // Validate role if provided
        if (role !== undefined && role !== null && role !== 'ADMIN' && role !== 'USER') {
            return Response.json({ error: 'Invalid role. Must be "ADMIN" or "USER"' }, { status: 400 });
        }

        // Validate enableGoogleLogin is boolean
        const enableGoogleLoginBool = enableGoogleLogin === true || enableGoogleLogin === 'true' || enableGoogleLogin === 1;

        const user = await createUser({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            companyName: companyName.trim(),
            address: address ? address.trim() : null,
            phone: phone.trim(),
            enableGoogleLogin: enableGoogleLoginBool,
            role: role || 'USER'
        });

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
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLogin: user.lastLogin
            }
        }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/admin/users] Error:', err.message);
        
        if (err.message.includes('already exists')) {
            return Response.json({ error: err.message }, { status: 409 });
        }
        
        if (err.message.includes('required') || err.message.includes('Invalid')) {
            return Response.json({ error: err.message }, { status: 400 });
        }

        return Response.json({ error: 'Failed to create user', details: err.message }, { status: 500 });
    }
}

