/**
 * GET /api/agents
 * List available agents
 */

import { AVAILABLE_AGENTS, PROJECT_NAME } from '@/lib/agents';

export async function GET() {
    try {
        const agentsList = AVAILABLE_AGENTS.map(agent => ({
            id: agent.id,
            name: agent.name,
            project: agent.project
        }));

        return Response.json({
            agents: agentsList,
            projectName: PROJECT_NAME
        });
    } catch (err) {
        console.error('[GET /api/agents] Error:', err.message);
        return Response.json({ error: 'Failed to list agents' }, { status: 500 });
    }
}

