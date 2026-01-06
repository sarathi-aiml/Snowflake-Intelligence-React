/**
 * POST /api/conversations/:sessionId/:conversationId/like
 * Like or unlike a conversation
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { updateConversationLike } from '@/lib/snowflake';

export async function POST(request, { params }) {
    try {
        // Check if demo mode is enabled
        const isDemoMode = process.env.DEMO === 'true';
        
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const { conversationId } = params;
        const body = await request.json();
        const { isLiked } = body;

        if (typeof isLiked !== 'boolean') {
            return Response.json({ error: 'isLiked must be a boolean' }, { status: 400 });
        }

        // In demo mode, return success (handled in localStorage)
        if (isDemoMode || userResult.user.isDemo) {
            return Response.json({ success: true, isLiked, demo: true });
        }

        // Update like status in database
        await updateConversationLike(conversationId, userResult.user.id, isLiked);
        
        return Response.json({ success: true, isLiked });
    } catch (err) {
        console.error('Failed to update like status:', err.message);
        return Response.json({
            error: 'Failed to update like status',
            details: err.message
        }, { status: 500 });
    }
}


