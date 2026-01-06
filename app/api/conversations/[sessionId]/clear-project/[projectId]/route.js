import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { deleteProjectConversations } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
    try {
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const { sessionId, projectId } = params;
        const isAdmin = userResult.user.role === 'ADMIN';
        
        await deleteProjectConversations(sessionId, projectId, userResult.user.id, isAdmin);
        
        return Response.json({ 
            success: true, 
            message: 'Project conversations cleared successfully' 
        });
    } catch (err) {
        console.error('Failed to clear project conversations:', err.message);
        return Response.json({
            error: 'Failed to clear project conversations',
            details: err.message
        }, { status: 500 });
    }
}

