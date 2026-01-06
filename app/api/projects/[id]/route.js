/**
 * Individual project routes
 * GET /api/projects/:id - Get project details
 * PATCH /api/projects/:id - Update project
 * DELETE /api/projects/:id - Delete project
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { getProjectById, updateProject, deleteProject } from '@/lib/db/projects';

export async function GET(request, { params }) {
    try {
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const { id } = params;
        // Get project with count in a single optimized query
        const project = await getProjectById(id, true);

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        return Response.json({
            project: project
        });
    } catch (err) {
        console.error('[GET /api/projects/:id] Error:', err.message);
        return Response.json({ error: 'Failed to get project', details: err.message }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
    try {
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const { id } = params;
        const updates = await request.json();
        const isAdmin = userResult.user.role === 'ADMIN';

        if (!updates.name && !updates.description) {
            return Response.json({ error: 'At least one field (name, description) must be provided' }, { status: 400 });
        }

        const project = await getProjectById(id);
        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        if (!isAdmin && project.createdBy !== userResult.user.id) {
            return Response.json({ error: 'You can only edit your own projects' }, { status: 403 });
        }

        const updatedProject = await updateProject(id, updates);

        return Response.json({
            project: {
                id: updatedProject.id,
                name: updatedProject.name,
                description: updatedProject.description,
                createdBy: updatedProject.createdBy,
                createdAt: updatedProject.createdAt,
                updatedAt: updatedProject.updatedAt
            }
        });
    } catch (err) {
        console.error('[PATCH /api/projects/:id] Error:', err.message);
        
        if (err.message.includes('not found')) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        return Response.json({ error: 'Failed to update project', details: err.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const { id } = params;
        const isAdmin = userResult.user.role === 'ADMIN';
        
        const project = await getProjectById(id);
        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        if (!isAdmin && project.createdBy !== userResult.user.id) {
            return Response.json({ error: 'You can only delete your own projects' }, { status: 403 });
        }

        // Get project with count before deletion
        const projectWithCount = await getProjectById(id, true);
        const conversationsCount = projectWithCount?.conversationsCount || 0;
        
        await deleteProject(id);

        return Response.json({ 
            success: true, 
            message: 'Project deleted successfully',
            conversationsCount
        });
    } catch (err) {
        console.error('[DELETE /api/projects/:id] Error:', err.message);
        return Response.json({ error: 'Failed to delete project', details: err.message }, { status: 500 });
    }
}

