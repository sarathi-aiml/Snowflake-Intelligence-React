import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { deleteAllConversations } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
    try {
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const { sessionId } = params;
        const isAdmin = userResult.user.role === 'ADMIN';
        
        console.log(`[clear-all] Deleting all conversations for sessionId: ${sessionId}, userId: ${userResult.user.id}, isAdmin: ${isAdmin}`);
        
        await deleteAllConversations(sessionId, userResult.user.id, isAdmin);
        
        console.log(`[clear-all] Successfully deleted all conversations`);
        
        return Response.json({ 
            success: true, 
            message: 'All conversations cleared successfully' 
        });
    } catch (err) {
        console.error('[clear-all] Failed to clear all conversations:', err.message);
        console.error('[clear-all] Error stack:', err.stack);
        return Response.json({
            error: 'Failed to clear all conversations',
            details: err.message
        }, { status: 500 });
    }
}

