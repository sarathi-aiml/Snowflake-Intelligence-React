/**
 * POST /api/conversations/save
 * Save a conversation
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { saveConversation } from '@/lib/snowflake';
import { getProjectById } from '@/lib/db/projects';

export async function POST(request) {
    try {
        // Check if demo mode is enabled
        const isDemoMode = process.env.DEMO === 'true';
        
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const body = await request.json();
        const { sessionId, conversationId, title, messages: conversationMessages, projectId } = body;

        if (!sessionId || !conversationId || !conversationMessages) {
            return Response.json({ error: 'sessionId, conversationId, and messages are required' }, { status: 400 });
        }

        // In demo mode, skip database save and return success
        if (isDemoMode || userResult.user.isDemo) {
            return Response.json({ success: true, demo: true });
        }

        // Validate projectId if provided
        if (projectId) {
            const project = await getProjectById(projectId);
            if (!project) {
                return Response.json({ error: 'Project not found' }, { status: 400 });
            }
        }

        // Generate title from first user message if not provided
        let conversationTitle = title;
        if (!conversationTitle || conversationTitle === 'New Conversation') {
            const firstUserMessage = conversationMessages.find(m => m.role === 'user');
            if (firstUserMessage) {
                const text = firstUserMessage.content?.[0]?.text || firstUserMessage.text || '';
                conversationTitle = text.length > 50
                    ? text.substring(0, 50) + '...'
                    : text || 'New Conversation';
            } else {
                conversationTitle = 'New Conversation';
            }
        }

        // Save conversation
        await saveConversation(conversationId, sessionId, conversationTitle, conversationMessages, userResult.user.id, projectId || null);
        return Response.json({ success: true });
    } catch (err) {
        console.error('Failed to save conversation:', err.message);

        // Handle Snowflake account issues gracefully
        if (err.response && err.response.status === 422) {
            const errorData = err.response.data;
            if (errorData && (errorData.message?.includes('suspended') || errorData.message?.includes('payment'))) {
                console.warn('⚠️  Snowflake account suspended - conversation not persisted to database');
                return Response.json({ success: true, warning: 'Conversation not persisted - account suspended' });
            }
        }

        return Response.json({
            error: 'Failed to save conversation',
            details: err.message
        }, { status: 500 });
    }
}

