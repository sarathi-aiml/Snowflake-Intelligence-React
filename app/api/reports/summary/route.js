/**
 * GET /api/reports/summary
 * Get overall system reports (admin only)
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
        const projectsTable = getTableName('projects');

        const usersStatsSQL = `
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN role = 'ADMIN' THEN 1 END) as admin_count,
                COUNT(CASE WHEN role = 'USER' THEN 1 END) as user_count,
                COUNT(CASE WHEN last_login IS NOT NULL THEN 1 END) as users_with_login,
                MAX(last_login) as most_recent_login,
                MIN(created_at) as first_user_created,
                MAX(created_at) as latest_user_created
            FROM ${usersTable}
        `;

        const conversationsStatsSQL = `
            SELECT 
                COUNT(*) as total_conversations,
                COUNT(DISTINCT user_id) as unique_users_with_conversations,
                COUNT(DISTINCT project_id) as projects_with_conversations,
                COUNT(CASE WHEN project_id IS NULL THEN 1 END) as global_conversations,
                MIN(created_at) as first_conversation,
                MAX(created_at) as latest_conversation,
                MAX(updated_at) as most_recent_activity
            FROM ${conversationsTable}
        `;

        const projectsStatsSQL = `
            SELECT 
                COUNT(*) as total_projects,
                COUNT(DISTINCT created_by) as unique_project_creators,
                MIN(created_at) as first_project_created,
                MAX(created_at) as latest_project_created
            FROM ${projectsTable}
        `;

        const userActivitySQL = `
            SELECT 
                u.id,
                u.email,
                u.name,
                u.role,
                u.last_login,
                u.created_at,
                COUNT(c.conversation_id) as conversation_count
            FROM ${usersTable} u
            LEFT JOIN ${conversationsTable} c ON u.id = c.user_id
            GROUP BY u.id, u.email, u.name, u.role, u.last_login, u.created_at
            ORDER BY u.last_login DESC NULLS LAST, u.created_at DESC
        `;

        const conversationActivitySQL = `
            SELECT 
                u.id as user_id,
                u.email,
                u.name,
                u.role,
                u.last_login,
                COUNT(c.conversation_id) as total_conversations,
                COUNT(CASE WHEN c.project_id IS NOT NULL THEN 1 END) as project_conversations,
                COUNT(CASE WHEN c.project_id IS NULL THEN 1 END) as global_conversations,
                MAX(c.created_at) as last_conversation_created,
                MAX(c.updated_at) as last_conversation_updated
            FROM ${usersTable} u
            LEFT JOIN ${conversationsTable} c ON u.id = c.user_id
            GROUP BY u.id, u.email, u.name, u.role, u.last_login
            ORDER BY total_conversations DESC, u.last_login DESC NULLS LAST
        `;

        const projectActivitySQL = `
            SELECT 
                p.id,
                p.name,
                p.description,
                p.created_by,
                u.email as creator_email,
                u.name as creator_name,
                p.created_at,
                COUNT(c.conversation_id) as conversation_count,
                COUNT(DISTINCT c.user_id) as unique_users,
                MAX(c.created_at) as last_conversation_created
            FROM ${projectsTable} p
            LEFT JOIN ${conversationsTable} c ON p.id = c.project_id
            LEFT JOIN ${usersTable} u ON p.created_by = u.id
            GROUP BY p.id, p.name, p.description, p.created_by, u.email, u.name, p.created_at
            ORDER BY conversation_count DESC, p.created_at DESC
        `;

        const [
            usersStatsResult,
            conversationsStatsResult,
            projectsStatsResult,
            userActivityResult,
            conversationActivityResult,
            projectActivityResult
        ] = await Promise.all([
            executeSnowflakeSQL(usersStatsSQL),
            executeSnowflakeSQL(conversationsStatsSQL),
            executeSnowflakeSQL(projectsStatsSQL),
            executeSnowflakeSQL(userActivitySQL),
            executeSnowflakeSQL(conversationActivitySQL),
            executeSnowflakeSQL(projectActivitySQL)
        ]);

        const usersStatsRow = usersStatsResult.data?.[0] || [];
        const conversationsStatsRow = conversationsStatsResult.data?.[0] || [];
        const projectsStatsRow = projectsStatsResult.data?.[0] || [];
        
        const usersStats = {
            total: usersStatsRow[0] || 0,
            admins: usersStatsRow[1] || 0,
            regularUsers: usersStatsRow[2] || 0,
            usersWithLogin: usersStatsRow[3] || 0,
            mostRecentLogin: usersStatsRow[4] || null,
            firstUserCreated: usersStatsRow[5] || null,
            latestUserCreated: usersStatsRow[6] || null
        };
        
        const conversationsStats = {
            total: conversationsStatsRow[0] || 0,
            uniqueUsers: conversationsStatsRow[1] || 0,
            projectsWithConversations: conversationsStatsRow[2] || 0,
            globalConversations: conversationsStatsRow[3] || 0,
            firstConversation: conversationsStatsRow[4] || null,
            latestConversation: conversationsStatsRow[5] || null,
            mostRecentActivity: conversationsStatsRow[6] || null
        };
        
        const projectsStats = {
            total: projectsStatsRow[0] || 0,
            uniqueCreators: projectsStatsRow[1] || 0,
            firstProjectCreated: projectsStatsRow[2] || null,
            latestProjectCreated: projectsStatsRow[3] || null
        };

        const userActivity = (userActivityResult.data || []).map(row => ({
            id: row[0],
            email: row[1],
            name: row[2],
            role: row[3],
            lastLogin: row[4],
            createdAt: row[5],
            conversationCount: row[6] || 0
        }));

        const conversationActivity = (conversationActivityResult.data || []).map(row => ({
            userId: row[0],
            email: row[1],
            name: row[2],
            role: row[3],
            lastLogin: row[4],
            totalConversations: row[5] || 0,
            projectConversations: row[6] || 0,
            globalConversations: row[7] || 0,
            lastConversationCreated: row[8],
            lastConversationUpdated: row[9]
        }));

        const projectActivity = (projectActivityResult.data || []).map(row => ({
            id: row[0],
            name: row[1],
            description: row[2],
            createdBy: row[3],
            creatorEmail: row[4],
            creatorName: row[5],
            createdAt: row[6],
            conversationCount: row[7] || 0,
            uniqueUsers: row[8] || 0,
            lastConversationCreated: row[9]
        }));

        const activeUsers = userActivity.filter(u => u.lastLogin !== null).length;
        const inactiveUsers = userActivity.length - activeUsers;
        const usersWithConversations = conversationActivity.filter(u => u.totalConversations > 0).length;

        return Response.json({
            summary: {
                users: {
                    total: usersStats.total,
                    admins: usersStats.admins,
                    regularUsers: usersStats.regularUsers,
                    activeUsers: activeUsers,
                    inactiveUsers: inactiveUsers,
                    usersWithLogin: usersStats.usersWithLogin,
                    usersWithConversations: usersWithConversations,
                    mostRecentLogin: usersStats.mostRecentLogin,
                    firstUserCreated: usersStats.firstUserCreated,
                    latestUserCreated: usersStats.latestUserCreated
                },
                conversations: {
                    total: conversationsStats.total,
                    uniqueUsers: conversationsStats.uniqueUsers,
                    projectsWithConversations: conversationsStats.projectsWithConversations,
                    globalConversations: conversationsStats.globalConversations,
                    projectConversations: conversationsStats.total - conversationsStats.globalConversations,
                    firstConversation: conversationsStats.firstConversation,
                    latestConversation: conversationsStats.latestConversation,
                    mostRecentActivity: conversationsStats.mostRecentActivity
                },
                projects: {
                    total: projectsStats.total,
                    uniqueCreators: projectsStats.uniqueCreators,
                    firstProjectCreated: projectsStats.firstProjectCreated,
                    latestProjectCreated: projectsStats.latestProjectCreated
                }
            },
            userActivity: userActivity,
            conversationActivity: conversationActivity,
            projectActivity: projectActivity
        });
    } catch (err) {
        console.error('[GET /api/reports/summary] Error:', err.message);
        return Response.json({ error: 'Failed to generate reports', details: err.message }, { status: 500 });
    }
}

