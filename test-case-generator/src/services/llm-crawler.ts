import { chromium, ElementHandle, Page } from 'playwright';
import OpenAI from 'openai'
import { createHash } from 'crypto';


interface ClickAction {
    type: 'click'; 
    target_selector: string; 
    reasoning: string; 
}

export interface FormFillAction {
    type: 'form_fill'; 
    formData: {
        selector: string; 
        value: string; 
    }[];
    submit_selector: string; 
    reasoning: string; 
}

interface NavigateAction {
    type: 'navigate'; 
    url: string; 
    reasoning: string; 
}

interface BacktrackAction {
    type: 'backtrack'; 
    steps_back: number; 
    reasoning: string; 
}

interface EndAction {
    type: 'end'; 
    reasoning: string; 
}

export type Action = ClickAction | FormFillAction | NavigateAction | BacktrackAction | EndAction; 

export class LLMGuidedCrawler {
    private client: OpenAI; 
    private visitedStates: Set<string>; 
    private currentPath: Action[]; 

    constructor(apiKey: string) {
        this.client = new OpenAI({ apiKey });
        this.visitedStates = new Set<string>(); 
        this.currentPath = []; 
    }

    async exploreWebsite(url: string, websiteContext: string) {
        const browser = await chromium.launch({ headless: false }); 
        const page = await browser.newPage(); 

        try {
            await page.goto(url); 

            while (true) {
                //1. Capture current state 
                const currentState = await this.capturePageState(page); 
                const stateHash = this.hashState(currentState);

                //Skip if we have seen this state 
                if (this.visitedStates.has(stateHash)) {
                    const nextMove = await this.askLLMForBacktrack(this.currentPath, websiteContext); 
                    if (nextMove.type === 'end') {
                        break; 
                    }
                    continue; 
                }

                this.visitedStates.add(stateHash); 

                //2. Ask LLM what to do next
                const nextAction = await this.askLLMForNextAction(currentState, websiteContext, this.currentPath); 
                if (nextAction.type === 'end') {
                    break; 
                }

                //3. Execute the suggested action 
                await this.executeAction(page, nextAction); 
                this.currentPath.push(nextAction); 
            }

            return this.currentPath; 
        }
        finally {
            await browser.close(); 
        }
    }

    private async capturePageState(page: Page) { //returns JSON object of type 'state', fed into askLLMForNextAction
        console.log("STAGE 1:Getting clickable elements", await this.getClickableElements(page));
        return {
            url: page.url(), 
            title: await page.title(), 
            clickableElements: await this.getClickableElements(page), 
            forms: await this.getForms(page),
            visibleText: await page.evaluate(() => document.body.innerText), 
            currentPath: this.currentPath, 
        }; 
    }

    private async askLLMForBacktrack(currentPath: Action[], websiteContext: string): Promise<Action> {
        const prompt = `
        We have reached a previously visited state. 
        Current exploration path: ${JSON.stringify(currentPath, null, 2)}
        Website Context: ${websiteContext}
        Suggest how to backtrack or if we should end the exploration. 
        Consider: 
        1. Are there unexplored important features?
        2. Should we go back to a previous state?
        3. Have we sufficiently explored the website?

        You have two actions to choose from: 
        1. If you want to end the exploration, then choose 'end'
        2. If you want to continue exploring and backtrack, then choose 'backtrack'

        If you choose 'end', return JSON with:
        - type: 'end'
        - reasoning: explanation for the ending the exploration 

        If you choose 'backtrack', return JSON with:
        - type: 'backtrack'
        - steps_back: number of steps to go back
        - reasoning: explanation for the backtracking 
        `; 

        try {
            const completion = await this.client.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a web crawler deciding how to backtrack in web crawling." }, 
                    { role: "user", content: prompt}
                ], 
                model: "gpt-4o", //explore alternatives?
                response_format: { type: "json_object" }
            }); 

            const response = JSON.parse(completion.choices[0].message.content ?? "{}"); 

            if (response.type=== 'backtrack' && response.steps_back > 0) {
                //Remove the specified number of steps from the path 
                this.currentPath = this.currentPath.slice(0, -response.steps_back); 

                //Clear visited states that were after the backtrack point 
                const stateToBacktrack = await this.capturePageState(await this.navigateToPathState(this.currentPath)); 

                const backTrackHash = this.hashState(stateToBacktrack); 

                //Remove states after backtrack point 
                this.visitedStates = new Set(
                    Array.from(this.visitedStates).filter(hash => hash <= backTrackHash)
                )
            }
            return response; 
        }
        catch (error) {
            console.error(`Error asking LLM for backtrack: ${error}`); 
            return { type: 'end', reasoning: 'Error with askLLMForBacktrack' }; 
        }
    }

    private async askLLMForNextAction(currentPageState: any, websiteContext: string, path: any[]) { //path = currentPath
        const prompt = `
        You are an intelligent web crawler. You are focused on testing USER WORKFLOWS. 
        Your primary goal is to test functional paths that users would take, in this order of priority: 

        1. Authentication Flows:
        - Find and use the Login/Signup buttons 
        - Use provided credentials: username: ${currentPageState.auth?.username}, password: ${currentPageState.auth?.password}

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
        
        AVOID spending time on informational pages (e.g. About Us, Blog, etc) unless specifically instructed. 

        Website Context: ${websiteContext}
        Current URL: ${currentPageState.url}
        Current Path: ${JSON.stringify(path)} 

        Available Interactions: 
        Clickable Elements: ${JSON.stringify(currentPageState.clickableElements)}
        Forms: ${JSON.stringify(currentPageState.forms)}

        Choose the next action that progresses through a user workflow. Prefer functional interactions over informational pages. 

        If you see a login form or button, USE IT FIRST with the provided credentials. 
        If you are already logged in, look for core user actions like "Create", "Add", "Submit", etc.
        
        Your task:
        1. Analyze the current state 
        2. Consider the website context 
        3. Suggest the next interaction
        4. Explain your reasoning 

        You have five actions to choose from: 
        1. If you would like to click on an element, then choose 'click'
        2. If you would like to fill out a form, then choose 'form_fill'
        3. If you would like to navigate to a new page, then choose 'navigate'
        4. If you would like to backtrack, then choose 'backtrack'
        5. If you would like to end the exploration, then choose 'end'

        If you choose 'click', return JSON with: 
        - type: 'click'
        - target_selector: the selector of the element to click
        - reasoning: explanation for the clicking 

        If you choose 'form_fill', return JSON with: 
        - type: 'form_fill'
        - formData: array of objects. Each object has: 
            - selector: CSS selector of the input field
            - value: the value to fill in
            - Example: 
                [
                    { "selector": "#username", "value": "admin" }, 
                    { "selector": "#password", "value": "password" }
                ]
            - formData should capture all the input fields in the form
        - submit_selector: the selector of the submit button
        - reasoning: explanation for the form filling
        - Example: (this is not included in the formData. Also, it is JUST an example. You should strictly list what YOU see on the form.)
            { 
                "type": "form_fill", 
                "formData": [
                    { "selector": "#username", "value": "admin" }, 
                    { "selector": "#password", "value": "password" }
                ], 
                "submit_selector": "button[type='submit']", 
                "reasoning": "The form has a submit button with type 'submit'"
            }

        If you choose 'navigate', return JSON with: 
        - type: 'navigate'
        - url: the URL to navigate to
        - reasoning: explanation for the navigation

        If you choose 'backtrack', return JSON with: 
        - type: 'backtrack'
        - steps_back: number of steps to go back
        - reasoning: explanation for the backtracking

        If you choose 'end', return JSON with: 
        - type: 'end'
        - reasoning: explanation for the ending the exploration
        `;

        const completion = await this.client.chat.completions.create({ 
            messages: [
                { role: "system", content: "You are a web crawler deciding how to explore a website." }, 
                { role: "user", content: prompt}
            ], 
            model: "gpt-4o", 
            response_format: { type: "json_object" }
        })

        console.log("STAGE 2: Asking LLM for next action");
        console.log("currentPageState", currentPageState);
        console.log("websiteContext", websiteContext);
        console.log("path", path);
        console.log("completion", completion.choices[0].message.content);

        return JSON.parse(completion.choices[0].message.content ?? "{}");
    }

    private async getClickableElements(page: Page) {
        const elements = []; 
        const selectors = [
            'button', 
            'a', 
            '[role="button"]', 
            '[onclick]', 
            'input[type="submit"]'
        ]; 

        for (const selector of selectors) {
            const foundElements = await page.$$(selector); 
            for (const element of foundElements) {
                const isVisible = await element.isVisible(); 
                if (isVisible) {
                    elements.push({ 
                        type: await element.evaluate(e => e.tagName.toLowerCase()), 
                        text: (await element.textContent() || '').trim(), 
                        href: await element.getAttribute('href'), 
                        selector: await this.getUniqueSelector(element)
                    })
                }
            }
        }

        return elements; 
    }

    private async getForms(page: Page) {
        const forms = []; 
        const formElements = await page.$$('form'); 

        for (const form of formElements) {
            const inputs = []; 
            const inputElements = await form.$$('input, select, textarea'); 

            for (const input of inputElements) {
                const isVisible = await input.isVisible(); 
                if (isVisible) {
                    inputs.push({
                        type: await input.getAttribute('type'), 
                        name: await input.getAttribute('name'), 
                        placeholder: await input.getAttribute('placeholder'), 
                        required: await input.getAttribute('required') !== null, 
                    }); 
                }
            }

            forms.push({
                inputs,
                action: await form.getAttribute('action'),
                method: await form.getAttribute('method'),
                selector: this.getUniqueSelector(form)
            }); 
        }

        return forms; 
    }

    private async executeAction(page: Page, action: any) {
        try {
            switch (action.type) {
                case 'click': 
                    const element = await page.waitForSelector(action.target_selector); 
                    await element?.click(); 
                    await page.waitForLoadState('networkidle'); 
                    break; 

                case 'form_fill': 
                    for (const input of action.formData) {
                        await page.fill(input.selector, input.value); 
                    }
                    await page.click(action.submit_selector); 
                    await page.waitForLoadState('networkidle'); 
                    break; 

                case 'navigate':
                    await page.goto(action.url); 
                    await page.waitForLoadState('networkidle'); //alternative better?
                    break; 
                case 'backtrack':
                    //Handle backtracking by navigating back 
                    await page.goBack(); 
                    await page.waitForLoadState('networkidle'); 
                    break; 
                
            }
            return true; 
        }
        catch (error) {
            console.error(`Error executing action: ${error}`); 
            return false; 
        }     
    }

    private hashState(state: any) {
        return createHash('md5').update(JSON.stringify(state)).digest('hex'); 
    }

    private async getUniqueSelector(element: any): Promise<string> {
        try {
            //Step 1: Try to get ID-based selector first 
            const id = await element.getAttribute('id'); 
            if (id) {
                return `#${id}`; 
            }

            //Step 2: Try to get data-testid-based selector
            const testId = await element.getAttribute('data-testid');  
            if (testId) {
                return `[data-testid="${testId}"]`; 
            }

            //Step 3: Try to get anchor tag with text 
            const tagName = await element.evaluate((el: Element) => el.tagName.toLowerCase());
            if (tagName === 'a') {
                const text = (await element.textContent() || '').trim(); 
                if (text) {
                    return `a:text("${text}")`;
                }
            }

            //Step 4: Generate a unique selector based on element attributes and position 
            return await element.evaluate((el: Element) => {
                function getPath(element: Element): string {
                    if (!element || !element.parentElement) {
                        return ''; 
                    }

                    let selector = element.tagName.toLowerCase(); 

                    if (element.id) {
                        return `#${element.id}`; 
                    }

                    const classes = Array.from(element.classList).join('.');
                    if (classes) {
                        selector += `.${classes}`; 
                    }

                    const siblings = element.parentElement.children; 
                    if (siblings.length > 1) {
                        let index = 1;
                        for (let i=0; i<siblings.length; i++){
                            const sibling = siblings[i]; 
                            if (sibling === element) {
                                break; 
                            }
                            if (sibling.tagName === element.tagName) {
                                index ++; 
                            }
                        }
                        if (index > 1) {
                            selector += `:nth-of-type(${index})`; 
                        }
                    }
                    const parentPath = getPath(element.parentElement); 
                    return parentPath ? `${parentPath} > ${selector}` : selector; 
                }
                console.log("Returning promise");
                return getPath(el); 
            }); 
        }
        catch (error) {
            //Fallback to a basic selector if something goes wrong 
            const tag = await element.evaluate((el: Element) => el.tagName.toLowerCase()); 
            return tag; 
        }  
    } 

    private async navigateToPathState(path: any[]): Promise<Page> {
        const browser = await chromium.launch({ headless: true }); 
        const page = await browser.newPage(); 

        try {
            //Replay the path up to the backtrack point 
            for (const action of path) {
                await this.executeAction(page, action); 
            }
            return page; 
        }
        catch (error) {
            console.error("Error navigating to path state:", error); 
            await browser.close(); 
            throw error; 
        }
    }
}