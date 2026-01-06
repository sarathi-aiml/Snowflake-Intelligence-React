/**
 * GET /api/reports/users
 * Get detailed user activity report (admin only)
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest, requireAdmin } from '@/lib/middleware/auth-nextjs';
import { executeSnowflakeSQL, getTableName } from '@/lib/snowflake';

export async function GET(request) {
    try {
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const adminCheck = requireAdmin(userResult.user);
        if (adminCheck) {
            return Response.json({ error: adminCheck.error }, { status: adminCheck.status });
        }

        const usersTable = getTableName('users');
        const conversationsTable = getTableName('conversations');

        const sql = `
            SELECT 
                u.id,
                u.email,
                u.name,
                u.role,
                u.picture,
                u.created_at,
                u.updated_at,
                u.last_login,
                COUNT(c.conversation_id) as conversation_count,
                COUNT(DISTINCT c.project_id) as projects_used,
                MAX(c.created_at) as last_conversation_created,
                MAX(c.updated_at) as last_conversation_updated
            FROM ${usersTable} u
            LEFT JOIN ${conversationsTable} c ON u.id = c.user_id
            GROUP BY u.id, u.email, u.name, u.role, u.picture, u.created_at, u.updated_at, u.last_login
            ORDER BY u.last_login DESC NULLS LAST, u.created_at DESC
        `;

        const result = await executeSnowflakeSQL(sql);
        const users = (result.data || []).map(row => ({
            id: row[0],
            email: row[1],
            name: row[2],
            role: row[3],
            picture: row[4],
            createdAt: row[5],
            updatedAt: row[6],
            lastLogin: row[7],
            conversationCount: row[8] || 0,
            projectsUsed: row[9] || 0,
            lastConversationCreated: row[10],
            lastConversationUpdated: row[11]
        }));

        return Response.json({ users });
    } catch (err) {
        console.error('[GET /api/reports/users] Error:', err.message);
        return Response.json({ error: 'Failed to get user reports', details: err.message }, { status: 500 });
    }
}

