/**
 * Project routes
 * GET /api/projects - List projects
 * POST /api/projects - Create a new project
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0; // No caching for projects

import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { getAllProjects, createProject } from '@/lib/db/projects';

export async function GET(request) {
    try {
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 100, 100); // Cap at 100
        const offset = Math.max(parseInt(url.searchParams.get('offset')) || 0, 0);
        const isAdmin = userResult.user.role === 'ADMIN';
        const includeCounts = url.searchParams.get('includeCounts') !== 'false'; // Default true

        // Single optimized query with counts
        const projects = await getAllProjects(limit, offset, userResult.user.id, isAdmin, includeCounts);

        console.log(`[GET /api/projects] Returning ${projects.length} projects for user ${userResult.user.id} (admin: ${isAdmin})`);

        return Response.json({
            projects: projects || [],
            count: projects ? projects.length : 0,
            limit,
            offset
        });
    } catch (err) {
        console.error('[GET /api/projects] Error:', err.message);
        console.error('[GET /api/projects] Stack:', err.stack);
        return Response.json({ error: 'Failed to get projects', details: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const body = await request.json();
        const { name, description } = body;

        if (!name || !name.trim()) {
            return Response.json({ error: 'Project name is required' }, { status: 400 });
        }

        const project = await createProject(name.trim(), description?.trim() || '', userResult.user.id);

        return Response.json({
            project: {
                id: project.id,
                name: project.name,
                description: project.description,
                createdBy: project.createdBy,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt
            }
        }, { status: 201 });
    } catch (err) {
        console.error('[POST /api/projects] Error:', err.message);
        return Response.json({ error: 'Failed to create project', details: err.message }, { status: 500 });
    }
}

