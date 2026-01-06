/**
 * GET /api/conversations/:sessionId
 * Get all conversations for a session
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { getAllConversations, getAllConversationsMetadata } from '@/lib/snowflake';

export async function GET(request, { params }) {
    try {
        // Check if demo mode is enabled
        const isDemoMode = process.env.DEMO === 'true';
        
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        // In demo mode, return empty conversations array (conversations stored in localStorage)
        if (isDemoMode || userResult.user.isDemo) {
            const { sessionId } = params;
            return Response.json({
                conversations: [],
                count: 0,
                sessionId: sessionId,
                demo: true
            });
        }

        // sessionId from params is ignored - conversations are filtered by user_id and project_id only
        // This allows the same user to see all their conversations across different browsers/devices
        const { sessionId } = params;
        const url = new URL(request.url);
        const search = url.searchParams.get('search');
        const user_id = url.searchParams.get('user_id');
        const project_id = url.searchParams.get('project_id');
        const metadataOnly = url.searchParams.get('metadataOnly') === 'true';

        const isAdmin = userResult.user.role === 'ADMIN';

        // Handle project_id filter
        let projectIdFilter = undefined;
        if (project_id !== undefined && project_id !== null) {
            if (project_id === 'null' || project_id === '') {
                projectIdFilter = null; // Global conversations only
            } else {
                projectIdFilter = project_id; // Specific project
            }
        }

        // Use lightweight metadata endpoint for list view (much faster)
        // Pass null for sessionId so it's not used as a filter - only user_id and project_id matter
        if (metadataOnly) {
            const conversations = await getAllConversationsMetadata(
                null, // sessionId is ignored - show all conversations for user/project
                search, 
                userResult.user.id, 
                isAdmin,
                isAdmin && user_id ? user_id : null,
                projectIdFilter
            );
            
            return Response.json({
                conversations: conversations,
                count: conversations.length,
                sessionId: sessionId, // Returned for backward compatibility, but not used for filtering
                metadataOnly: true
            });
        } else {
            // Full conversations with messages (for backward compatibility)
            // Pass null for sessionId so it's not used as a filter - only user_id and project_id matter
            const conversations = await getAllConversations(
                null, // sessionId is ignored - show all conversations for user/project
                search, 
                userResult.user.id, 
                isAdmin,
                isAdmin && user_id ? user_id : null,
                projectIdFilter
            );
            
            return Response.json({
                conversations: conversations,
                count: conversations.length,
                sessionId: sessionId
            });
        }
    } catch (err) {
        console.error('[GET /api/conversations/:sessionId] Error:', err.message);
        return Response.json({
            error: 'Failed to get conversations',
            details: err.message
        }, { status: 500 });
    }
}

