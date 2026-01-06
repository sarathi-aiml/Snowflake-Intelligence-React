/**
 * API endpoint to check if demo mode is enabled
 * This allows client-side code to know if demo mode is active
 */

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const isDemoMode = process.env.DEMO === 'true';
        return Response.json({ 
            demo: isDemoMode 
        });
    } catch (err) {
        console.error('[GET /api/demo/check] Error:', err.message);
        return Response.json({ 
            demo: false,
            error: err.message 
        }, { status: 500 });
    }
}

