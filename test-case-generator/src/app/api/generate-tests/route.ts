import { NextResponse } from 'next/server'
import { LLMGuidedCrawler } from '@/services/llm-crawler'; 
import { TestCaseGenerator, TestCase } from '@/services/test-case-generator'; 
import { LLMCrawler } from '@/services/llm-crawler-2';

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

        const crawler = new LLMCrawler(process.env.OPENAI_API_KEY || "", {
            credentials: data.requiresAuth ? {
                username: data.username || "",
                password: data.password || ""
            } : undefined,
            websiteContext: data.websiteContext || ""
        });
        const workflows= await crawler.exploreWebsite(data.url, data.websiteContext || "Explore the website and all possible user interaction flows"); 

        // const testGenerator = new TestCaseGenerator(); 
        // const testCases = testGenerator.generateTestCases(explorationPath); 
        return NextResponse.json({
            status: "success",
            data: {
                url: data.url,
                summary: {
                    totalWorkflows: workflows.length,
                    workflowNames: workflows.map(w => w.name),
                },
                workflows: workflows.map(workflow => ({
                    name: workflow.name,
                    description: workflow.description,
                    startUrl: workflow.startUrl,
                    actions: workflow.actions
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




