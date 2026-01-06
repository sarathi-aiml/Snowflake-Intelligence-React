/**
 * GET /api/threads/:threadId - Describe a thread
 * POST /api/threads/:threadId - Update a thread
 * DELETE /api/threads/:threadId - Delete a thread
 */

import { describeSnowflakeThread, updateSnowflakeThread, deleteSnowflakeThread } from '@/lib/snowflake';

const USE_MOCK = String(process.env.MOCK_MODE).toLowerCase() === 'true';

export async function GET(request, { params }) {
    try {
        const { threadId } = params;
        const url = new URL(request.url);
        const page_size = url.searchParams.get('page_size');
        const last_message_id = url.searchParams.get('last_message_id');

        if (USE_MOCK) {
            return Response.json({
                metadata: {
                    thread_id: threadId,
                    thread_name: 'Mock Thread',
                    origin_application: 'cortex-chat',
                    created_on: Date.now(),
                    updated_on: Date.now()
                },
                messages: []
            });
        }

        const pageSize = page_size ? parseInt(page_size) : 20;
        const lastMsgId = last_message_id ? parseInt(last_message_id) : null;
        const threadData = await describeSnowflakeThread(threadId, pageSize, lastMsgId);
        return Response.json(threadData);
    } catch (err) {
        console.error('Failed to describe thread:', err.message);
        return Response.json({
            error: 'Failed to describe thread',
            details: err?.response?.data || err.message
        }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    try {
        const { threadId } = params;
        const body = await request.json();
        const { thread_name } = body;

        if (!thread_name) {
            return Response.json({ error: 'thread_name is required' }, { status: 400 });
        }

        if (USE_MOCK) {
            return Response.json({ status: `Thread ${threadId} successfully updated.` });
        }

        const result = await updateSnowflakeThread(threadId, thread_name);
        return Response.json(result);
    } catch (err) {
        console.error('Failed to update thread:', err.message);
        return Response.json({
            error: 'Failed to update thread',
            details: err?.response?.data || err.message
        }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { threadId } = params;

        if (USE_MOCK) {
            return Response.json({ success: true });
        }

        const result = await deleteSnowflakeThread(threadId);
        return Response.json(result);
    } catch (err) {
        console.error('Failed to delete thread:', err.message);
        return Response.json({
            error: 'Failed to delete thread',
            details: err?.response?.data || err.message
        }, { status: 500 });
    }
}

