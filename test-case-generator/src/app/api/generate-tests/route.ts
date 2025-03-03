import { NextResponse } from 'next/server'
import { LLMGuidedCrawler } from '@/services/llm-crawler'; 
import { TestCaseGenerator, TestCase } from '@/services/test-case-generator'; 
import { Phase1 } from '@/services/phase-1';

interface WebsiteRequest { 
    url: string; 
    username?: string; 
    password?: string; 
    requiresAuth: boolean; 
    websiteContext?: string; 
}

export async function POST(request: Request) {
    try {
        const data: WebsiteRequest = await request.json();

        //Validate input 
        if (!data.url) {
            return NextResponse.json({
                status: 400, 
                error: "URL is required"
            });
        }

        //Initialise crawler and explore website 

        const phase1 = new Phase1(
            process.env.OPENAI_API_KEY || "",
            data.websiteContext || "",
            {
                username: data.username,
                password: data.password,
                requiresAuth: data.requiresAuth
            }
        );
        await phase1.crawl(data.url); 
        console.log("Phase 1 completed");
        console.log("Printing results - msg from route"); 
        phase1.printResults(); 

        return NextResponse.json({
            status: "success",
            data: {
                url: data.url,
                summary: {
                    totalWorkflows: phase1.links.length,
                    workflowNames: phase1.links.map(w => w.url),
                },
                workflows: phase1.links.map((linkComponent: any) => ({
                    name: linkComponent.name,
                    description: linkComponent.description,
                    startUrl: linkComponent.startUrl,
                    actions: linkComponent.actions,
                    inputs: linkComponent.inputs  // Add inputs to the response if Phase1 provides them
                }))
            }
        });
    }
    catch (error: any) {
        console.error("Error generating tests:", error); 
        return NextResponse.json({
            status: 500, 
            error: error.message
        })
    }
}

export async function GET() {
    return NextResponse.json({
        status: "healthy"
    })
}




