import OpenAI from "openai";
import { chromium, Page } from "playwright";

interface Node {
    url: string; 
    interactionElement: "button" | "link" | "form" | "other"; 
    children: Node[]; 
    representation?: string; //screenshot? DOM elements?
}

export class LLMCrawler3 {
    private client: OpenAI; 
    private baseUrl: string; 
    private websiteContext: string; 
    private workflows: Node[]; 

    constructor(apiKey: string, baseUrl: string, websiteContext: string) {
        this.client = new OpenAI({ apiKey });
        this.baseUrl = baseUrl; 
        this.websiteContext = websiteContext; 
        this.workflows = []; 
    }

    async exploreWebsite(url: string): Promise<Node[]> {
        const browser = await chromium.launch({ headless: false }); 
        const page = await browser.newPage();  
        try {
            await page.goto(url); 
            const pageState = await this.capturePageState(page); 

            const initialNode: Node = {
                url, 
                interactionElement: "other", 
                children: [], 
                representation: pageState
            }; 
        }
        catch(error) {
            console.error("Error navigating to URL:", error); 
            throw error; 
        }
        finally {
            await browser.close(); 
        } 
    }

    private async capturePageState(page: Page): Promise<{screenshot: string, html: string}> {
        const screenshot = await page.screenshot({ type: 'jpeg' , fullPage: true}).then(buffer => buffer.toString('base64')); //Full page? Or do we allow scrolling?
        const html = await page.content(); 
        return { screenshot, html }; 
    }

    private async askLLMForNextAction(currentNode: Node, websiteContext: string): Promise<Node> {
        
    }

    
}