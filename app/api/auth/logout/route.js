/**
 * POST /api/auth/logout
 * Logout endpoint (client-side should clear token)
 */

export async function POST() {
    // Since we use JWT, logout is handled client-side by removing the token
    // This endpoint is provided for consistency
    return Response.json({ success: true, message: 'Logged out successfully' });
}

