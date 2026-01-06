/**
 * GET /api/reports/conversations
 * Get detailed conversation statistics (admin only)
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

        const conversationsTable = getTableName('conversations');
        const usersTable = getTableName('users');
        const projectsTable = getTableName('projects');

        const sql = `
            SELECT 
                c.conversation_id,
                c.user_id,
                u.email as user_email,
                u.name as user_name,
                c.project_id,
                p.name as project_name,
                c.title,
                c.created_at,
                c.updated_at,
                CASE 
                    WHEN c.messages IS NOT NULL THEN 
                        ARRAY_SIZE(TRY_PARSE_JSON(c.messages::STRING))
                    ELSE 0
                END as message_count
            FROM ${conversationsTable} c
            LEFT JOIN ${usersTable} u ON c.user_id = u.id
            LEFT JOIN ${projectsTable} p ON c.project_id = p.id
            ORDER BY c.updated_at DESC
            LIMIT 1000
        `;

        const result = await executeSnowflakeSQL(sql);
        const conversations = (result.data || []).map(row => ({
            conversationId: row[0],
            userId: row[1],
            userEmail: row[2],
            userName: row[3],
            projectId: row[4],
            projectName: row[5],
            title: row[6],
            createdAt: row[7],
            updatedAt: row[8],
            messageCount: row[9] || 0
        }));

        return Response.json({ conversations });
    } catch (err) {
        console.error('[GET /api/reports/conversations] Error:', err.message);
        return Response.json({ error: 'Failed to get conversation reports', details: err.message }, { status: 500 });
    }
}

