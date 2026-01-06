/**
 * POST /api/conversations/:sessionId/:conversationId/feedback
 * Submit feedback for a conversation
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { submitConversationFeedback } from '@/lib/snowflake';

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
        const { feedback } = body;

        if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
            return Response.json({ error: 'Feedback is required' }, { status: 400 });
        }

        if (feedback.length > 2000) {
            return Response.json({ error: 'Feedback must be less than 2000 characters' }, { status: 400 });
        }

        // In demo mode, return success (handled in localStorage)
        if (isDemoMode || userResult.user.isDemo) {
            return Response.json({ success: true, demo: true });
        }

        // Submit feedback to database
        await submitConversationFeedback(conversationId, userResult.user.id, feedback.trim());
        
        return Response.json({ success: true });
    } catch (err) {
        console.error('Failed to submit feedback:', err.message);
        return Response.json({
            error: 'Failed to submit feedback',
            details: err.message
        }, { status: 500 });
    }
}


