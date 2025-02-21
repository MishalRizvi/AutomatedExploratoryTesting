import { chromium, ElementHandle, Page } from 'playwright';
import OpenAI from 'openai'
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
interface Credentials {
    username: string; 
    password: string; 
}

interface CrawlerConfig {
    credentials?: Credentials; 
    websiteContext: string;
}

interface PageState {
    url: string; 
    screenshot: string; 
    html: string; 
}

interface WorkflowNode {
    name: string; 
    actions: string[];  //Sequential actions for this workflow 
    description: string; 
    startUrl: string; //URL where the workflow begins 
}

interface NavigationState {
    url: string; 
    workflows: Array<{name: string, description: string}>; 
    completed: Set<string>; //Workflows that have been completed 
}

interface WorkflowResponse {
    workflows: Array<{
        name: string;
        description: string;
    }>;
}

export class LLMCrawler {
    private client: OpenAI; 
    private workflows: WorkflowNode[] = []; 
    private websiteContext: string = ''; 
    private navigationStack: NavigationState[] = []; 
    private credentials?: Credentials; 

    constructor(apiKey: string, config: CrawlerConfig) {
        this.client = new OpenAI({ apiKey });
        this.websiteContext = config.websiteContext; 
        this.credentials = config.credentials; 
    }

    async exploreWebsite(url: string, websiteContext: string): Promise<WorkflowNode[]> {
        this.websiteContext = websiteContext; 
        const browser = await chromium.launch({ headless: false }); 
        const page = await browser.newPage(); 

        try {
            //Start exploration from initial URL 
            await page.goto(url); 

            //Begin exploration with empty set of visited URLs 
            await this.exploreCurrentPage(page, new Set<string>()); 

            return this.workflows; 
        }
        catch(error) {
            console.error('Error exploring website:', error); 
            throw error; 
        }
        finally {
            await browser.close(); 
        }
    }

    private async exploreCurrentPage(page: Page, visitedUrls: Set<string>): Promise<void> {
        const currentUrl = page.url(); 

        if (visitedUrls.has(currentUrl)) {
            console.log(`Already visited URL ${currentUrl}, skipping`); 
            return; 
        }

        console.log(`Exploring URL ${currentUrl}`); 
        visitedUrls.add(currentUrl); 

        //Create new navigation state for this URL 
        const currentState: NavigationState = {
            url: currentUrl, 
            workflows: await this.workflowStarterAgent(await this.capturePageState(page)),
            completed: new Set<string>(), 
        }; 

        //Push current state to navigation stack 
        this.navigationStack.push(currentState); 
        console.log('Navigation stack:', this.navigationStack.map(s => s.url)); 

        //Process workflows at current URL 
        for (const workflow of currentState.workflows) {
            if (currentState.completed.has(workflow.name)) {
                console.log(`Workflow ${workflow.name} already completed at URL ${currentUrl}, skipping`); 
                continue; 
            }

            try {
                console.log(`Starting workflow: ${workflow.name} at URL ${currentUrl}`); 
                const actions = await this.workflowActionsAgent(page, workflow.name); 

                //Store the workflow 
                this.workflows.push({
                    name: workflow.name, 
                    actions, 
                    description: workflow.description, 
                    startUrl: currentUrl, 
                }); 
                
                //Mark workflow as completed at this URL 
                currentState.completed.add(workflow.name); 

                //Check if we landed on a new page 
                const newUrl = await page.url(); 
                if (!visitedUrls.has(newUrl)) {
                    console.log(`Disovered new page: ${newUrl}, exploring...`); 
                    await this.exploreCurrentPage(page, visitedUrls); 
                }

                //After exploring new page (if any), backtrack
                await page.goto(currentUrl); 
            }
            catch(error) {
                console.error(`Error in workflow ${workflow.name}:`, error); 
            } 
        }
        //Pop current state when done with all workflows on this page 
        this.navigationStack.pop();
    }

    private async capturePageState(page: Page): Promise<PageState> {
        try {
            //Wait for page to be ready 
            await page.waitForLoadState('networkidle'); 

            //Capture all state in parallel for efficiency 
            const [screenshot, html, url] = await Promise.all([
                page.screenshot({
                    type: 'jpeg', 
                    quality: 50, 
                    fullPage: true
                }).then(buffer => buffer.toString('base64')), 
                page.content(), 
                page.url()
            ]); 

            return {
                url,
                screenshot, 
                html
            }
        }
        catch(error) {
            console.error('Error capturing page state:', error); 
            throw error; 
        }
    }

    private async workflowStarterAgent(state: PageState): Promise<Array<{name: string, description: string}>> {
        
        const credentialsContext = this.credentials 
            ? `Available test credentials:
               - Username: ${this.credentials.username}
               - Password: ${this.credentials.password}
               Use these credentials when login or authentication is needed.`
            : 'No test credentials provided. Skip workflows requiring authentication.';

        
        // Trim HTML to essential parts
        const $ = cheerio.load(state.html);
        
        // Remove heavy/unnecessary elements
        $('script').remove();
        $('style').remove();
        $('svg').remove();
        $('meta').remove();
        $('link').remove();
        $('noscript').remove();
        $('iframe').remove();
        $('img').remove();

        // Focus on interactive elements and their context
        const interactiveElements = {
            forms: $('form').map((_, form) => {
                const $form = $(form);
                return {
                    id: $form.attr('id'),
                    class: $form.attr('class'),
                    inputs: $form.find('input, select, textarea').map((_, input) => ({
                        type: $(input).attr('type'),
                        name: $(input).attr('name'),
                        placeholder: $(input).attr('placeholder'),
                        label: $(input).attr('aria-label') || $(`label[for="${$(input).attr('id')}"]`).text().trim()
                    })).get(),
                    buttons: $form.find('button').map((_, btn) => $(btn).text().trim()).get()
                };
            }).get(),
            buttons: $('button').map((_, btn) => ({
                text: $(btn).text().trim(),
                type: $(btn).attr('type'),
                id: $(btn).attr('id'),
                class: $(btn).attr('class')
            })).get(),
            links: $('a[href]').map((_, link) => ({
                text: $(link).text().trim(),
                href: $(link).attr('href'),
                id: $(link).attr('id'),
                class: $(link).attr('class')
            })).get(),
            // Include important headings for context
            headings: $('h1, h2, h3').map((_, h) => ({
                level: h.name,
                text: $(h).text().trim()
            })).get()
        };    

        const prompt = `
            Website context: ${this.websiteContext}
            ${credentialsContext}

            Given this webpage: 
            URL: ${state.url}


            Page Structure:
            ${interactiveElements.headings.map(h => `${h.level}: ${h.text}`).join('\n')}

            Forms:
            ${JSON.stringify(interactiveElements.forms, null, 2)}

            Buttons:
            ${JSON.stringify(interactiveElements.buttons, null, 2)}

            Links:
            ${JSON.stringify(interactiveElements.links, null, 2)}


            You are an expert at identifying possible user interaction workflows on web applications. 
            Your task is to use the elements on the page to identify ALL possible workflows that can be started from here. 

            Consider:
            1. Interactive elements like buttons, forms, links 
            2. Main actions users might want to take 
            3. Only workflows that can be STARTED from this exact page 
            4. Only workflows that involve user interactions

            Examples of good workflows:
            - "login" - when there is a login button or form 
            - "create-new-project" - when there is a "New Project" button 
            - "edit-profile" - when there is a profile edit section 
            - "submit-job-application" - when there is a job application form 

            Examples of bad workflows:
            - "scroll-page" - too basic 
            - workflows that require multiple page navigations to start 
            - "view-profile" - if it just viewing content 
            - "navigate-to-dashboard" - if it is just a link to another page 

            Return array of workflows as a JSON array with this format:
            {
                "workflows": [
                    {
                        "name": "Workflow Name", 
                        "description": "Detailed description of what this workflow does"
                    }
                ]
            }
        `; 

        try {
            const completion = await this.client.chat.completions.create({
                messages: [{
                    role: 'user', 
                    content: [
                        {
                            type: 'text', 
                            text: prompt, 
                        }, 
                        {
                            type: 'image_url', 
                            image_url: {
                                url: `data:image/png;base64,${state.screenshot}`
                            }
                        }
                    ], 
                }], 
                model: 'gpt-4o',
                response_format: { type: 'json_object' }
            }); 

            const result = JSON.parse(completion.choices[0].message.content || '[]') as WorkflowResponse; 
            console.log('Workflows:', result);
            console.log('Workflows parsed:', result.workflows);
            console.log(`Found workflows on ${state.url}:`, result.workflows.map((w: {name: string, description: string}) => w.name)); 
            return result.workflows; 
        }
        catch(error) {
            console.error('Error in workflow starter agent:', error); 
            throw error; 
        }
    }

    private async workflowActionsAgent(page: Page, workflowName: string): Promise<string[]> { //later add interactiveElements as an attribute to workflow so it can be passed rather than re-captured
        const actions: string[] = []; 
        let retryCount = 0; 
        const MAX_RETRIES = 3; 

        while (true) {
            try {
                const state = await this.capturePageState(page); 

                // Trim HTML to essential parts
                const $ = cheerio.load(state.html);
                
                // Remove heavy/unnecessary elements
                $('script').remove();
                $('style').remove();
                $('svg').remove();
                $('meta').remove();
                $('link').remove();
                $('noscript').remove();
                $('iframe').remove();
                $('img').remove();

                const interactiveElements = {
                    forms: $('form').map((_, form) => {
                        const $form = $(form);
                        return {
                            id: $form.attr('id'),
                            class: $form.attr('class'),
                            inputs: $form.find('input, select, textarea').map((_, input) => ({
                                type: $(input).attr('type'),
                                name: $(input).attr('name'),
                                placeholder: $(input).attr('placeholder'),
                                label: $(input).attr('aria-label') || $(`label[for="${$(input).attr('id')}"]`).text().trim()
                            })).get(),
                            buttons: $form.find('button').map((_, btn) => $(btn).text().trim()).get()
                        };
                    }).get(),
                    buttons: $('button').map((_, btn) => ({
                        text: $(btn).text().trim(),
                        type: $(btn).attr('type'),
                        id: $(btn).attr('id'),
                        class: $(btn).attr('class')
                    })).get(),
                    links: $('a[href]').map((_, link) => ({
                        text: $(link).text().trim(),
                        href: $(link).attr('href'),
                        id: $(link).attr('id'),
                        class: $(link).attr('class')
                    })).get(),
                    // Include important headings for context
                    headings: $('h1, h2, h3').map((_, h) => ({
                        level: h.name,
                        text: $(h).text().trim()
                    })).get()
                };
        

                const credentialsContext = this.credentials 
                ? `Use these credentials if needed:
                   Username: ${this.credentials.username}
                   Password: ${this.credentials.password}`
                : 'No credentials available';

                const nextActionPrompt = `
                    Given this webpage: 
                    URL: ${state.url}

                    
                    Page Structure:
                    ${interactiveElements.headings.map(h => `${h.level}: ${h.text}`).join('\n')}

                    Forms:
                    ${JSON.stringify(interactiveElements.forms, null, 2)}

                    Buttons:
                    ${JSON.stringify(interactiveElements.buttons, null, 2)}

                    Links:
                    ${JSON.stringify(interactiveElements.links, null, 2)}

                    Authentication context: ${credentialsContext}


                    You are building the ${workflowName} workflow. 
                    Previous actions taken: 
                    ${actions.length > 0 ? actions.join('\n') : 'No actions taken yet'}

                    What is the next action to take?
                    Consider:
                    1. Use clear selectors (id, data-testid, aria-label, or visible text)
                    2. Prefer role-based selectors when available 
                    3. Handle any required form inputs 
                    4. Wait for elements when needed 

                    Return your response as a JSON object with the following structure:

                    {
                        "nextAction": {
                            "type": "click" | "fill" | "press" | "type" | "check" | "uncheck" | 
                                   "select" | "hover" | "dblclick" | "focus" | "waitForSelector" |
                                   "waitForTimeout" | "waitForNavigation" | "getByRole" | "getByText" |
                               "getByLabel" | "getByPlaceholder" | "getByTestId" | "keyboard.press" |
                               "keyboard.type" | "mouse.click" | "mouse.dblclick" | "mouse.hover",
                        "selector": "the selector (if needed)",
                        "value": "the value (if needed)",
                        "timeout": "optional timeout in ms"
                        },
                        "status": "CONTINUE" or "COMPLETE"
                    }      
                        
                    Examples:
                    {
                        "nextAction": {
                            "type": "click",
                            "selector": "text=Login",
                            "value": null
                        },
                        "status": "CONTINUE"
                    }

                    {
                        "nextAction": {
                            "type": "fill",
                            "selector": "input[name='email']",
                            "value": "test@example.com"
                        },
                        "status": "CONTINUE"
                    }

                    {
                        "nextAction": {
                            "type": "",
                            "selector": "",
                            "value": ""
                        },
                        "status": "COMPLETE"
                    }

                    Include waiting for elements/navigation when needed. 
                    Return ONLY the command, no explanation. 
                `; 

                const actionCompletion = await this.client.chat.completions.create({
                    messages: [{
                        role: 'user', 
                        content: [
                            {
                                type: 'text', 
                                text: nextActionPrompt, 
                            }, 
                            {
                                type: 'image_url', 
                                image_url: {
                                    url: `data:image/png;base64,${state.screenshot}`
                                }
                            }
                        ]
                    }], 
                    model: 'gpt-4o', 
                    response_format: { type: 'json_object' }
                }); 

                const result = JSON.parse(actionCompletion.choices[0].message.content || '{}') as {nextAction: {type: string, selector: string, value: string, timeout: number}, status: string}; 
                const status = result.status; 

                if (status === 'COMPLETE') {
                    console.log(`Workflow ${workflowName} complete`); 
                    break; 
                }
                
                //Convert action to Playwright command 
                const {type, selector, value, timeout} = result.nextAction; 
                console.log(`Executing action for ${workflowName}:`, {type, selector, value}); 
                switch (type) {
                    // Basic actions
                    case 'click':
                        await page.click(selector, { timeout });
                        break;
                    case 'fill':
                        await page.fill(selector, value, { timeout });
                        break;
                    case 'type':
                        await page.type(selector, value, { timeout });
                        break;
                    case 'press':
                        await page.press(selector, value);
                        break;

                    // Form interactions
                    case 'check':
                        await page.check(selector, { timeout });
                        break;
                    case 'uncheck':
                        await page.uncheck(selector, { timeout });
                        break;
                    case 'select':
                        await page.selectOption(selector, value, { timeout });
                        break;

                    // Mouse actions
                    case 'hover':
                        await page.hover(selector, { timeout });
                        break;
                    case 'dblclick':
                        await page.dblclick(selector, { timeout });
                        break;
                    case 'focus':
                        await page.focus(selector, { timeout });
                        break;

                    // Locator strategies
                    case 'getByRole':
                        await page.getByRole(selector as any).click();
                        break;
                    case 'getByText':
                        await page.getByText(selector).click();
                        break;
                    case 'getByLabel':
                        await page.getByLabel(selector).click();
                        break;
                    case 'getByPlaceholder':
                        await page.getByPlaceholder(selector).click();
                        break;
                    case 'getByTestId':
                        await page.getByTestId(selector).click();
                        break;

                    // Keyboard actions
                    case 'keyboard.press':
                        await page.keyboard.press(value);
                        break;
                    case 'keyboard.type':
                        await page.keyboard.type(value);
                        break;

                    // Mouse actions
                    case 'mouse.click':
                        await page.mouse.click(parseInt(selector), parseInt(value));
                        break;
                    case 'mouse.dblclick':
                        await page.mouse.dblclick(parseInt(selector), parseInt(value));
                        break;
                    case 'mouse.hover':
                        await page.mouse.move(parseInt(selector), parseInt(value));
                        break;
                    
                    // Waiting
                    case 'waitForSelector':
                        await page.waitForSelector(selector, { timeout });
                        break;
                    case 'waitForTimeout':
                        await page.waitForTimeout(parseInt(value));
                        break;
                    case 'waitForNavigation':
                        await page.waitForNavigation({ timeout });
                        break;

                    default:
                        throw new Error(`Unknown action type: ${type}`);
                }

                //Wait for any navigation or network requests
                await page.waitForLoadState('networkidle'); 

                //Store successful action 
                actions.push(JSON.stringify(result.nextAction)); 

                //Reset retry count on success
                retryCount = 0;   
            }
            catch(error) {
                console.error(`Error executing action for ${workflowName}:`, error); 
                retryCount++; 

                if (retryCount >= MAX_RETRIES) {
                    console.warn(`Max retries reached for workflow ${workflowName}, stopping`); 
                    break; 
                }

                //Wait before retry 
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); 
            }
        }

        return actions; 
    }
}
