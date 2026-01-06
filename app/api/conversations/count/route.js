/**
 * GET /api/conversations/count
 * Get live conversation counts (total and per project)
 * Supports Server-Sent Events (SSE) for real-time updates
 */

export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/middleware/auth-nextjs';
import { getConversationCounts } from '@/lib/snowflake';

export async function GET(request) {
    try {
        const userResult = await getUserFromRequest(request);
        if (userResult.error) {
            return Response.json({ error: userResult.error }, { status: userResult.status || 401 });
        }

        const url = new URL(request.url);
        const projectId = url.searchParams.get('project_id');
        const useSSE = url.searchParams.get('sse') === 'true';

        const isAdmin = userResult.user.role === 'ADMIN';

        // Handle project_id filter
        let projectIdFilter = undefined;
        if (projectId !== undefined && projectId !== null) {
            if (projectId === 'null' || projectId === '') {
                projectIdFilter = null; // Global conversations only
            } else {
                projectIdFilter = projectId; // Specific project
            }
        }

        // If SSE is requested, set up Server-Sent Events stream
        if (useSSE) {
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    const sendUpdate = async () => {
                        try {
                            const counts = await getConversationCounts(
                                userResult.user.id,
                                isAdmin,
                                projectIdFilter
                            );

                            const data = JSON.stringify({
                                type: 'counts',
                                data: counts,
                                timestamp: new Date().toISOString()
                            });

                            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                        } catch (err) {
                            console.error('[SSE] Error getting counts:', err.message);
                            const errorData = JSON.stringify({
                                type: 'error',
                                error: err.message
                            });
                            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
                        }
                    };

                    // Send initial count
                    await sendUpdate();

                    // Poll every 5 seconds for updates
                    const interval = setInterval(async () => {
                        try {
                            await sendUpdate();
                        } catch (err) {
                            console.error('[SSE] Polling error:', err.message);
                            clearInterval(interval);
                            controller.close();
                        }
                    }, 5000);

                    // Clean up on client disconnect
                    request.signal.addEventListener('abort', () => {
                        clearInterval(interval);
                        controller.close();
                    });
                }
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no' // Disable nginx buffering
                }
            });
        }

        // Regular JSON response (one-time fetch)
        const counts = await getConversationCounts(
            userResult.user.id,
            isAdmin,
            projectIdFilter
        );

        return Response.json({
            counts: counts,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[GET /api/conversations/count] Error:', err.message);
        return Response.json({
            error: 'Failed to get conversation counts',
            details: err.message
        }, { status: 500 });
    }
}


