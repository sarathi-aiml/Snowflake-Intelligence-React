/**
 * POST /api/chat
 * Chat endpoint with SSE streaming
 */

import { streamSnowflakeAgent, createSnowflakeThread, buildMockReply } from '@/lib/snowflake';
import { AVAILABLE_AGENTS } from '@/lib/agents';

const USE_MOCK = String(process.env.MOCK_MODE).toLowerCase() === 'true';

export async function POST(request) {
    try {
        const body = await request.json();
        const { messages, stream, thread_id, parent_message_id, agent_id } = body;
        
        console.log('[Backend] /api/chat request received:', {
            hasMessages: !!messages,
            messagesCount: messages?.length,
            stream,
            thread_id,
            parent_message_id,
            agent_id
        });

        // Validate the request format
        if (!messages || !Array.isArray(messages)) {
            return Response.json({ error: 'messages array is required' }, { status: 400 });
        }

        // Validate messages format - must have exactly one user message
        if (messages.length !== 1 || messages[0].role !== 'user') {
            return Response.json({ error: 'messages must contain exactly one user message' }, { status: 400 });
        }

        if (stream !== true) {
            return Response.json({ error: 'stream must be true' }, { status: 400 });
        }

        // Prepare request body
        const requestBody = {
            messages,
            stream: true
        };

        // Handle thread_id
        let threadId = thread_id;
        if (thread_id) {
            if (typeof thread_id === 'object' && thread_id !== null) {
                threadId = thread_id.thread_id || thread_id.threadId || thread_id.id || thread_id;
                console.log('[Backend] Extracted thread_id from object:', threadId);
            }
            requestBody.thread_id = threadId;
        } else {
            // Create a new thread if none provided
            try {
                threadId = await createSnowflakeThread('cortex-chat', agent_id || null);
                requestBody.thread_id = threadId;
                console.log('[Backend] Created new thread:', threadId);
            } catch (threadErr) {
                console.error('[Backend] Failed to create thread:', threadErr.message);
            }
        }

        // Handle parent_message_id
        if (parent_message_id !== undefined && parent_message_id !== null) {
            requestBody.parent_message_id = parent_message_id;
        } else {
            requestBody.parent_message_id = 0;
        }

        // Create ReadableStream for SSE
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    if (USE_MOCK) {
                        const mockMessage = messages[0]?.content?.[0]?.text || 'Hello';
                        const reply = buildMockReply(mockMessage);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: reply })}\n\n`));
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                        controller.close();
                        return;
                    }

                    // Use streamSnowflakeAgent but adapt for Next.js streaming
                    // We'll need to modify streamSnowflakeAgent or create a wrapper
                    // For now, call the existing function which expects Express res object
                    // We need to adapt this for Next.js streaming response
                    
                    // Create a mock response-like object that works with streamSnowflakeAgent
                    const mockRes = {
                        write: (chunk) => {
                            controller.enqueue(encoder.encode(chunk));
                            return true;
                        },
                        end: () => {
                            controller.close();
                        },
                        destroyed: false,
                        headersSent: true
                    };

                    const mockReq = {
                        on: () => {} // Stub event handlers
                    };

                    await streamSnowflakeAgent({ 
                        requestBody, 
                        res: mockRes, 
                        req: mockReq, 
                        agentId: agent_id 
                    });
                } catch (err) {
                    console.error('[Backend] Chat request error:', err.message);
                    try {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`));
                    } catch (writeErr) {
                        // Ignore
                    }
                    controller.close();
                }
            }
        });

        return new Response(readableStream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        });
    } catch (err) {
        console.error('[Backend] Chat request error:', err.message);
        return Response.json({
            error: 'Chat request failed',
            details: err?.response?.data || err.message
        }, { status: 500 });
    }
}

