import { NextResponse } from 'next/server'
import { LLMGuidedCrawler } from '@/services/llm-crawler'; 
import { TestCaseGenerator, TestCase } from '@/services/test-case-generator'; 

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

        const crawler = new LLMGuidedCrawler(process.env.OPENAI_API_KEY || "");
        const explorationPath = await crawler.exploreWebsite(data.url, data.websiteContext || "Explore the website and all possible user interaction flows"); 

        const testGenerator = new TestCaseGenerator(); 
        const testCases = testGenerator.generateTestCases(explorationPath); 
        //Structure the response 
        return NextResponse.json({
            status: "success",
            data: {
                url: data.url, 
                summary: {
                    totalTests: testCases.length,
                    highPriority: testCases.filter((test: TestCase) => test.priority === 'high').length,
                    coverage: {
                        authentication: testCases.some(test => test.tags.includes('authentication')),
                        navigation: testCases.some(test => test.tags.includes('navigation')),
                    }
                }, 
                testCases: testCases, 
                explorationPath: explorationPath
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




