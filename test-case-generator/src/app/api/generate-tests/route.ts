// import { NextResponse } from 'next/server'
// import { LLMGuidedCrawler } from '@/services/llm-crawler'; 
// import { TestCaseGenerator, TestCase } from '@/services/test-case-generator'; 
// import { Phase1 } from '@/services/phase-1';

// interface WebsiteRequest { 
//     url: string; 
//     username?: string; 
//     password?: string; 
//     requiresAuth: boolean; 
//     websiteContext?: string; 
// }

// export async function POST(request: Request) {
//     try {
//         const data = await request.json();
//         console.log("Starting test generation for URL:", data.url);

//         const phase1 = new Phase1(
//             process.env.OPENAI_API_KEY || '',
//             data.websiteContext || '',
//             {
//                 username: data.username,
//                 password: data.password,
//                 requiresAuth: data.requiresAuth
//             }
//         );

//         await phase1.crawl(data.url);
//         console.log("Phase 1 completed");

//         // Wait for results to be ready
//         const results = await phase1.getResults(); // New method to get results

//         // Log results to server console
//         console.log("Test Generation Results:", JSON.stringify(results, null, 2));

//         return new Response(JSON.stringify({ 
//             success: true, 
//             results: results 
//         }), {
//             headers: { 'Content-Type': 'application/json' },
//         });

//     } catch (error) {
//         console.error("Error in test generation:", error);
//         return new Response(JSON.stringify({ 
//             success: false, 
//             error: error instanceof Error ? error.message : 'Unknown error' 
//         }), {
//             status: 500,
//             headers: { 'Content-Type': 'application/json' },
//         });
//     }
// }

// export async function GET() {
//     return NextResponse.json({
//         status: "healthy"
//     })
// }



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
