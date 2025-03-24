import { NextResponse } from 'next/server';
import { Intelligence } from '@/services/intelligence';

export async function POST(request: Request) {
    try {
        const data = await request.json();
        console.log("Starting flow analysis for URL:", data.url);

        const intelligence = new Intelligence();
        const interactiveElements = await intelligence.extractInteractiveElements(data.url);
        await intelligence.expandTree(data.url);
        
        // Get the graph data
        const flows = await intelligence.findAllPathsInGraph();
        flows.forEach(flow => {
            console.log("Flow:", flow);
        });

        return new Response(JSON.stringify({ 
            success: true, 
            flows: flows 
        }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Error in flow analysis:", error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}