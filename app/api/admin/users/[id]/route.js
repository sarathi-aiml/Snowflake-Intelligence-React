/**
 * Admin routes for individual user
 * GET /api/admin/users/:id - Get user details
 * PATCH /api/admin/users/:id - Update user
 * DELETE /api/admin/users/:id - Delete user
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest, requireAdmin } from '@/lib/middleware/auth-nextjs';
import { getUserById, updateUser, deleteUser } from '@/lib/db/users';

// Helper to safely get params (handles both sync and async params)
async function getParams(params) {
    if (params && typeof params.then === 'function') {
        return await params;
    }
    return params;
}

export async function GET(request, { params }) {
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

        // Get params (handle both sync and async)
        const resolvedParams = await getParams(params);
        const { id } = resolvedParams;
        
        if (!id) {
            console.error('[GET /api/admin/users/:id] No ID in params:', params);
            return Response.json({ error: 'User ID is required' }, { status: 400 });
        }
        
        console.log('[GET /api/admin/users/:id] Requested user ID:', id);
        const user = await getUserById(id);

        if (!user) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

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
        });
    } catch (err) {
        console.error('[GET /api/admin/users/:id] Error:', err.message);
        return Response.json({ error: 'Failed to get user', details: err.message }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
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

        // Get params (handle both sync and async)
        const resolvedParams = await getParams(params);
        const { id } = resolvedParams;
        
        if (!id) {
            console.error('[PATCH /api/admin/users/:id] No ID in params:', params);
            return Response.json({ error: 'User ID is required' }, { status: 400 });
        }
        
        console.log('[PATCH /api/admin/users/:id] Updating user ID:', id);
        const updates = await request.json();

        // Validate that at least one field is being updated
        const allowedFields = ['name', 'firstName', 'lastName', 'companyName', 'address', 'phone', 'enableGoogleLogin', 'picture', 'role'];
        const hasUpdate = Object.keys(updates).some(key => allowedFields.includes(key));
        
        if (!hasUpdate) {
            return Response.json({ 
                error: 'At least one field must be provided',
                allowedFields: allowedFields
            }, { status: 400 });
        }

        // Prevent self-demotion (admin cannot remove their own admin role)
        if (updates.role && updates.role !== 'ADMIN' && userResult.user.id === id) {
            return Response.json({ error: 'Cannot remove your own admin role' }, { status: 400 });
        }

        // Validate email format if email is being updated
        if (updates.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(updates.email.trim())) {
                return Response.json({ error: 'Invalid email format' }, { status: 400 });
            }
        }

        const updatedUser = await updateUser(id, updates);

        return Response.json({
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                companyName: updatedUser.companyName,
                address: updatedUser.address,
                phone: updatedUser.phone,
                enableGoogleLogin: updatedUser.enableGoogleLogin,
                picture: updatedUser.picture,
                role: updatedUser.role,
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt,
                lastLogin: updatedUser.lastLogin
            }
        });
    } catch (err) {
        console.error('[PATCH /api/admin/users/:id] Error:', err.message);
        
        if (err.message.includes('Invalid role')) {
            return Response.json({ error: err.message }, { status: 400 });
        }

        if (err.message.includes('not found')) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        return Response.json({ error: 'Failed to update user', details: err.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
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

        // Get params (handle both sync and async)
        const resolvedParams = await getParams(params);
        const { id } = resolvedParams;
        
        if (!id) {
            console.error('[DELETE /api/admin/users/:id] No ID in params:', params);
            return Response.json({ error: 'User ID is required' }, { status: 400 });
        }
        
        console.log('[DELETE /api/admin/users/:id] Deleting user ID:', id);

        // Prevent self-deletion
        if (userResult.user.id === id) {
            return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }

        // Check if user exists
        const user = await getUserById(id);
        if (!user) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        await deleteUser(id);

        return Response.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        console.error('[DELETE /api/admin/users/:id] Error:', err.message);
        
        if (err.message.includes('not found')) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        return Response.json({ error: 'Failed to delete user', details: err.message }, { status: 500 });
    }
}

