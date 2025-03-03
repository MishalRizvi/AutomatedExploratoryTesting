import { chromium, ElementHandle, Page } from 'playwright';
import OpenAI from 'openai'
import { createHash } from 'crypto';
import { ElementFinderAgent } from '../lib/agents/elementFinderAgent';

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

interface VisualLocation {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface VisualProperties {
    backgroundColor: string;
    fontSize: string;
    isClickable: boolean;
}

interface VisualConfirmation {
    expectedType: string;
    expectedLocation: VisualLocation;
    expectedVisuals: VisualProperties;
}

interface WaitOptions {
    timeout: number;
    waitForState: 'attached' | 'visible' | 'hidden';
    expectsNavigation: boolean;
}

interface Action {
    type: string;
    selector: string;
    value: string;
    visualConfirmation: VisualConfirmation;
    waitForOptions: WaitOptions;
}

interface ActionResponse {
    nextAction: Action;
    status: 'CONTINUE' | 'COMPLETE';
    reasoning: string;
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

    private async getInteractiveElements(page: Page) {
        const elements = [];
    
        // Get elements with their visual properties
        const elementInfo = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('input, button, a, select, textarea')).map(el => {
                const rect = el.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(el);
                
                return {
                    type: el.tagName.toLowerCase(),
                    inputType: el.getAttribute('type'),
                    name: el.getAttribute('name'),
                    id: el.getAttribute('id'),
                    placeholder: el.getAttribute('placeholder'),
                    value: el.getAttribute('value'),
                    text: el.textContent?.trim(),
                    isVisible: (el as HTMLElement).offsetParent !== null,
                    attributes: {
                        name: el.getAttribute('name'),
                        type: el.getAttribute('type'),
                        placeholder: el.getAttribute('placeholder'),
                        'data-testid': el.getAttribute('data-testid'),
                        role: el.getAttribute('role')
                    },
                    visualProperties: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        backgroundColor: computedStyle.backgroundColor,
                        color: computedStyle.color,
                        fontSize: computedStyle.fontSize,
                        isButton: computedStyle.cursor === 'pointer'
                    }
                };
            }).filter(el => el.isVisible);
        });

            // Process elements and generate selectors
        for (const el of elementInfo) {
            let selector;
            if (el.type === 'input') {
                if (el.attributes.name) {
                    selector = `input[name="${el.attributes.name}"]`;
                } else if (el.placeholder) {
                    selector = `input[placeholder="${el.placeholder}"]`;
                } else if (el.id) {
                    selector = `#${el.id}`;
                }
            }

            elements.push({
                ...el,
                selector
            });
        }

        return elements; 
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
            workflows: await this.workflowStarterAgent(page),
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
            // Wait for page to be ready 
            await page.waitForLoadState('networkidle');
    
            // Set a reasonable viewport size if not already set
            await page.setViewportSize({ width: 1280, height: 720 });
    
            // Capture all state in parallel for efficiency 
            const [screenshot, html, url] = await Promise.all([
                page.screenshot({
                    type: 'jpeg',
                    quality: 30,  // Reduced quality
                    fullPage: false,  // Only viewport
                }).then(async buffer => {
                    // Further compress with sharp
                    const sharp = require('sharp');
                    const optimized = await sharp(buffer)
                        .resize({
                            width: 800,  // Max width
                            height: 600,  // Max height
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({
                            quality: 30,
                            mozjpeg: true,  // Better compression
                            chromaSubsampling: '4:2:0'  // Reduce color data
                        })
                        .toBuffer();
                    return optimized.toString('base64');
                }),
                // Minimize HTML by removing unnecessary elements
                page.evaluate(() => {
                    // Remove scripts, styles, and other heavy elements
                    const doc = document.cloneNode(true) as Document;
                    const elementsToRemove = [
                        'script',
                        'style',
                        'link',
                        'meta',
                        'noscript',
                        'iframe',
                        'svg',
                        'img',
                        'video',
                        'audio'
                    ];
                    elementsToRemove.forEach(tag => {
                        doc.querySelectorAll(tag).forEach(el => el.remove());
                    });
                    // Remove all comments
                    const removeComments = (node: Node) => {
                        for (let i = node.childNodes.length-1; i >= 0; i--) {
                            const child = node.childNodes[i];
                            if (child.nodeType === 8) { // Comment node
                                child.remove();
                            } else if (child.nodeType === 1) { // Element node
                                removeComments(child);
                            }
                        }
                    };
                    removeComments(doc);
                    return doc.documentElement.outerHTML;
                }),
                page.url()
            ]);
    
            return {
                url,
                screenshot,
                html: html.trim()  // Remove extra whitespace
            };
        } catch (error) {
            console.error('Error capturing page state:', error);
            throw error;
        }
    }

    private async workflowStarterAgent(page: Page): Promise<Array<{name: string, description: string}>> {
        const state = await this.capturePageState(page); 
        const interactiveElements = await this.getInteractiveElements(page); 
        
        const credentialsContext = this.credentials 
            ? `Available test credentials:
               - Username: ${this.credentials.username}
               - Password: ${this.credentials.password}
               Use these credentials when login or authentication is needed.`
            : 'No test credentials provided. Skip workflows requiring authentication, such as login or account creation.';

        const prompt = `
            Website context: ${this.websiteContext}
            ${credentialsContext}

            Given this webpage: 
            URL: ${state.url}

            Given this webpage screenshot and interactive elements: 
            <screenshot>
                ${state.screenshot}
            </screenshot>

            Visual Layout of Interactive Elements:
            ${interactiveElements.map(el => `
                ${el.type.toUpperCase()} at (${el.visualProperties.x}, ${el.visualProperties.y}):
                - Type: ${el.type} ${el.inputType ? `(${el.inputType})` : ''}
                - Text/Placeholder: ${el.text || el.placeholder || 'None'}
                - Size: ${el.visualProperties.width}x${el.visualProperties.height}
                - Selector: ${el.selector}
                - Visual: ${el.visualProperties.backgroundColor} text, ${el.visualProperties.fontSize} size
                ${el.visualProperties.isButton ? '- Appears clickable (cursor: pointer)' : ''}
            `).join('\n')}

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

            Prioritize workflows that match these categories:
            1. Authentication Flows:
            - Find and use the Login/Signup buttons 
            - Use provided credentials: ${this.credentials?.username} and ${this.credentials?.password}

            2. Core User Actions: 
            - Create/Edit/Delete operations 
            - Form submissions 
            - Dashboard interactions 
            - Profile management 

            3. Business-Critical Flows:
            - Job posting (for recruiters)
            - Application submission (for candidates)
            - Booking/Scheduling features 

            4. Secondary Actions:
            - Settings changes 
            - Preference updates
            - Notification management 


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
                const interactiveElements = await this.getInteractiveElements(page); 

                const credentialsContext = this.credentials 
                ? `Use these credentials if needed:
                   Username: ${this.credentials.username}
                   Password: ${this.credentials.password}`
                : 'No credentials available - skip any actions that require authentication such as login or account creation';

                const nextActionPrompt = `
                    Given this webpage screenshot and interactive elements: 
                    <screenshot>
                        ${state.screenshot}
                    </screenshot>

                    Visual Layout of Interactive Elements:
                    ${interactiveElements.map(el => `
                        ${el.type.toUpperCase()} at (${el.visualProperties.x}, ${el.visualProperties.y}):
                        - Type: ${el.type} ${el.inputType ? `(${el.inputType})` : ''}
                        - Text/Placeholder: ${el.text || el.placeholder || 'None'}
                        - Size: ${el.visualProperties.width}x${el.visualProperties.height}
                        - Selector: ${el.selector}
                        - Visual: ${el.visualProperties.backgroundColor} text, ${el.visualProperties.fontSize} size
                        ${el.visualProperties.isButton ? '- Appears clickable (cursor: pointer)' : ''}
                    `).join('\n')}

                    Authentication context: ${credentialsContext}


                    You are building the ${workflowName} workflow. 
                    Previous actions taken: 
                    ${actions.length > 0 ? actions.join('\n') : 'No actions taken yet'}

                    Choose the next action to take based on the visual layout and workflow context:
                    1. Choose elements that are clearly visible in the UI
                    2. Prefer elements that look interactive (buttons, inputs)
                    3. Use exact selectors from the interactiveElements list above
                    4. Consider the spatial layout when choosing next actions
                    5. Choose actions that are most likely to progress the workflow forward

                    If the workflow is complete, return a "COMPLETE" status. 

                    SUPPORTED ACTION TYPES:
                    - "click": Click an element
                    - "fill": Fill a form field
                    - "press": Press a keyboard key
                    - "check": Check a checkbox
                    - "uncheck": Uncheck a checkbox
                    - "selectOption": Select from dropdown
                    - "hover": Hover over element
                    - "dblclick": Double click element
                    - "focus": Focus an element
                    - "type": Type into an element
                    - "keyboard.press": Press a specific key
                    - "keyboard.type": Type a sequence of keys
                    - "mouse.click": Click at specific coordinates
                    - "mouse.dblclick": Double click at coordinates
                    - "mouse.hover": Hover at coordinates

                    Return your response as a JSON object with the following structure:

                    {
                        "nextAction": {
                            "type": "the next action to take, choose from supported action types",
                            "selector": "EXACT selector from above",
                            "value": "value to fill in for fill/type actions, otherwise leave as empty string",
                            "visualConfirmation": {
                                "expectedType": "the element type (input, button, etc.)",
                                "expectedLocation": {
                                    "x": number,
                                    "y": number,
                                    "width": number,
                                    "height": number
                                },
                                "expectedVisuals": {
                                    "backgroundColor": "expected color",
                                    "fontSize": "expected size",
                                    "isClickable": boolean
                                }
                            },
                            "waitForOptions": {
                                "timeout": number,
                                "waitForState": "attached" | "visible" | "hidden",
                                "expectsNavigation": boolean
                            }
                        },
                        "status": "CONTINUE" or "COMPLETE",
                        "reasoning": "Explain why this element was chosen based on visual layout"
                    }

                Examples:
                  1. Clicking a Login Button:
                    {
                        "nextAction": {
                            "type": "click",
                            "selector": "button[data-testid='login-button']",
                            "value": "",
                            "visualConfirmation": {
                                "expectedType": "button",
                                "expectedLocation": {
                                    "x": 250,
                                    "y": 300,
                                    "width": 100,
                                    "height": 40
                                },
                                "expectedVisuals": {
                                    "backgroundColor": "rgb(59, 130, 246)",
                                    "fontSize": "14px",
                                    "isClickable": true
                                }
                            },
                            "waitForOptions": {
                                "timeout": 5000,
                                "waitForState": "visible",
                                "expectsNavigation": true
                            }
                        },
                        "status": "CONTINUE",
                        "reasoning": "Clicking the blue login button in the center of the form"
                    }
                2. Filling an Email Input:
                    {
                        "nextAction": {
                            "type": "fill",
                            "selector": "input[name='email']",
                            "value": "test@example.com",
                            "visualConfirmation": {
                                "expectedType": "input",
                                "expectedLocation": {
                                    "x": 200,
                                    "y": 250,
                                    "width": 300,
                                    "height": 40
                                },
                                "expectedVisuals": {
                                    "backgroundColor": "rgb(255, 255, 255)",
                                    "fontSize": "16px",
                                    "isClickable": false
                                }
                            },
                            "waitForOptions": {
                                "timeout": 5000,
                                "waitForState": "visible",
                                "expectsNavigation": false
                            }
                        },
                        "status": "CONTINUE",
                        "reasoning": "Filling the email input field at the top of the form"
                    } 

                3. Selecting from a Dropdown:
                    {
                        "nextAction": {
                            "type": "selectOption",
                            "selector": "select[name='country']",
                            "value": "US",
                            "visualConfirmation": {
                                "expectedType": "select",
                                "expectedLocation": {
                                    "x": 200,
                                    "y": 400,
                                    "width": 200,
                                    "height": 40
                                },
                                "expectedVisuals": {
                                    "backgroundColor": "rgb(255, 255, 255)",
                                    "fontSize": "14px",
                                    "isClickable": true
                                }
                            },
                            "waitForOptions": {
                                "timeout": 5000,
                                "waitForState": "visible",
                                "expectsNavigation": false
                            }
                        },
                        "status": "CONTINUE",
                        "reasoning": "Selecting US from the country dropdown menu"
                    }

                4. Workflow Completion:
                    {
                        "nextAction": {
                            "type": "click",
                            "selector": "button[type='submit']",
                            "visualConfirmation": {
                                "expectedType": "button",
                                "expectedLocation": {
                                    "x": 250,
                                    "y": 500,
                                    "width": 120,
                                    "height": 40
                                },
                                "expectedVisuals": {
                                    "backgroundColor": "rgb(34, 197, 94)",
                                    "fontSize": "16px",
                                    "isClickable": true
                                }
                            },
                            "waitForOptions": {
                                "timeout": 5000,
                                "waitForState": "visible",
                                "expectsNavigation": true
                            }
                        },
                        "status": "COMPLETE",
                        "reasoning": "Submitting the form with the green submit button at the bottom"
                    }
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

                const result = JSON.parse(actionCompletion.choices[0].message.content || '{}') as ActionResponse; 
                const status = result.status; 

                if (status === 'COMPLETE') {
                    console.log(`Workflow ${workflowName} complete`); 
                    break; 
                }

                console.log("next action", result.nextAction);
                
                //Convert action to Playwright command 
                const {type, selector, value, visualConfirmation, waitForOptions} = result.nextAction; 

                console.log(`Executing action for ${workflowName}:`, {type, selector, value,visualConfirmation, waitForOptions}); 

                const successfulAction = await this.validateAndExecuteAction(page, result.nextAction); 
                if (!successfulAction) {
                    console.error(`Action failed for ${workflowName}:`, result.nextAction); 
                    break; 
                }

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

    private async validateAndExecuteAction(page: Page, action: any) {
        try {
            // Try visual/coordinate-based action first
            try {
                const { expectedLocation, expectedType } = action.visualConfirmation;
                const centerX = Math.floor(expectedLocation.x + expectedLocation.width / 2);
                const centerY = Math.floor(expectedLocation.y + expectedLocation.height / 2);

                // For mouse-based actions, use direct coordinates
                if (action.type === 'click') {
                    await page.mouse.click(centerX, centerY);
                    return true;
                } else if (action.type === 'fill' || action.type === 'type') {
                    // For inputs, find element at coordinates first
                    const element = await page.evaluateHandle((opts) => {
                        const el = document.elementFromPoint(opts.x, opts.y);
                        if (el?.tagName.toLowerCase() === opts.expectedType.toLowerCase()) {
                            return el;
                        }
                        return null;
                    }, { 
                        x: centerX, 
                        y: centerY,
                        expectedType: expectedType 
                    });

                    if (element) {
                        await element.evaluate((el, value) => {
                            (el as HTMLInputElement).value = value;
                            el?.dispatchEvent(new Event('input', { bubbles: true }));
                            el?.dispatchEvent(new Event('change', { bubbles: true }));
                        }, action.value);
                        return true;
                    }
                }
                throw new Error('Visual interaction failed or unsupported action type');
            } 
            catch (visualError) {
                console.log('Visual interaction failed, falling back to selector', visualError);
                
                // Fallback to selector-based action
                const locator = page.locator(action.selector);

                // Wait for element to be ready
                await locator.waitFor({ 
                    state: action.waitForOptions.waitForState,
                    timeout: action.waitForOptions.timeout 
                });

                // Start navigation wait if needed
                const loadPromise = action.waitForOptions.expectsNavigation 
                    ? page.waitForLoadState('networkidle', { timeout: action.waitForOptions.timeout })
                    : null;
    
                // Execute the action
                switch (action.type) {
                    case 'click':
                        await locator.click({
                            timeout: action.waitForOptions.timeout,
                            force: false
                        });
                        break;
                    case 'fill':
                    case 'type':  // type is handled as fill
                        await locator.fill(action.value || '', {
                            timeout: action.waitForOptions.timeout
                        });
                        break;
                    case 'press':
                        await locator.press(action.value, {
                            timeout: action.waitForOptions.timeout
                        });
                        break;
                    case 'check':
                        await locator.check({
                            timeout: action.waitForOptions.timeout
                        });
                        break;
                    case 'uncheck':
                        await locator.uncheck({
                            timeout: action.waitForOptions.timeout
                        });
                        break;
                    case 'selectOption':
                        await locator.selectOption(action.value, {
                            timeout: action.waitForOptions.timeout
                        });
                        break;
                    case 'hover':
                        await locator.hover({
                            timeout: action.waitForOptions.timeout,
                            force: false
                        });
                        break;
                    case 'dblclick':
                        await locator.dblclick({
                            timeout: action.waitForOptions.timeout,
                            force: false
                        });
                        break;
                    case 'focus':
                        await locator.focus({
                            timeout: action.waitForOptions.timeout
                        });
                        break;
                    case 'keyboard.press':
                        await page.keyboard.press(action.value);
                        break;
                    case 'keyboard.type':
                        await page.keyboard.type(action.value);
                        break;
                    case 'mouse.click':
                        await page.mouse.click(
                            action.visualConfirmation.expectedLocation.x,
                            action.visualConfirmation.expectedLocation.y
                        );
                        break;
                    case 'mouse.dblclick':
                        await page.mouse.dblclick(
                            action.visualConfirmation.expectedLocation.x,
                            action.visualConfirmation.expectedLocation.y
                        );
                        break;
                    case 'mouse.hover':
                        await page.mouse.move(
                            action.visualConfirmation.expectedLocation.x,
                            action.visualConfirmation.expectedLocation.y
                        );
                        break;
                    default:
                        throw new Error(`Unsupported action type: ${action.type}`);
                }
    
                // Wait for navigation if needed
                if (loadPromise) {
                    await loadPromise;
                }
            }
    
            return true;
        } 
        catch (error) {
            console.error('Both visual and selector-based interactions failed:', error);
            throw error; // Re-throw to handle at higher level
        }
    }
}

