/**
 * GET /api/conversations/:sessionId/:conversationId - Get a specific conversation
 * DELETE /api/conversations/:sessionId/:conversationId - Delete a conversation
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { getConversation, deleteConversation } from '@/lib/snowflake';

export async function GET(request, { params }) {
    try {
        // Check if demo mode is enabled
        const isDemoMode = process.env.DEMO === 'true';
        
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        // In demo mode, return not found (conversations stored in localStorage)
        if (isDemoMode || userResult.user.isDemo) {
            return Response.json({ error: 'Conversation not found' }, { status: 404 });
        }

        const { conversationId } = params;
        const isAdmin = userResult.user.role === 'ADMIN';
        const conversation = await getConversation(conversationId, userResult.user.id, isAdmin);
        
        if (conversation) {
            return Response.json(conversation);
        } else {
            return Response.json({ error: 'Conversation not found' }, { status: 404 });
        }
    } catch (err) {
        console.error('Failed to get conversation:', err.message);
        return Response.json({
            error: 'Failed to get conversation',
            details: err.message
        }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        // Check if demo mode is enabled
        const isDemoMode = process.env.DEMO === 'true';
        
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        // In demo mode, return success (conversations stored in localStorage)
        if (isDemoMode || userResult.user.isDemo) {
            return Response.json({ success: true, message: 'Conversation deleted successfully', demo: true });
        }

        const { conversationId } = params;
        const isAdmin = userResult.user.role === 'ADMIN';
        await deleteConversation(conversationId, userResult.user.id, isAdmin);
        
        return Response.json({ success: true, message: 'Conversation deleted successfully' });
    } catch (err) {
        console.error('Failed to delete conversation:', err.message);
        return Response.json({
            error: 'Failed to delete conversation',
            details: err.message
        }, { status: 500 });
    }
}

