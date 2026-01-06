/**
 * GET /api/threads - List all threads
 * POST /api/threads - Create a new thread
 */

import { createSnowflakeThread, listSnowflakeThreads } from '@/lib/snowflake';

const USE_MOCK = String(process.env.MOCK_MODE).toLowerCase() === 'true';

export async function GET(request) {
    try {
        const url = new URL(request.url);
        const origin_application = url.searchParams.get('origin_application');

        if (USE_MOCK) {
            return Response.json([]);
        }

        const threads = await listSnowflakeThreads(origin_application);
        return Response.json(threads);
    } catch (err) {
        console.error('Failed to list threads:', err.message);
        return Response.json({
            error: 'Failed to list threads',
            details: err?.response?.data || err.message
        }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { origin_application, agent_id } = body;

        if (USE_MOCK) {
            const mockThreadId = `mock_thread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            return Response.json(mockThreadId);
        }

        const threadId = await createSnowflakeThread(origin_application, agent_id);
        return Response.json(threadId);
    } catch (err) {
        console.error('Failed to create thread:', err.message);
        return Response.json({
            error: 'Failed to create thread',
            details: err?.response?.data || err.message
        }, { status: 500 });
    }
}

