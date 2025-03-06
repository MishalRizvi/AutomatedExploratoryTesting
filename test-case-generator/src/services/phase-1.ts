import { PlaywrightCrawler } from "crawlee";
import { chromium, Page } from "playwright";
import OpenAI from "openai";



export interface LinkComponent {
    url: string; 
    interactiveElements: any; 
    testCases: any; 
}

export class Phase1 {

    private client: OpenAI; 
    private websiteContext: string; 
    public links: Array<LinkComponent>; 
    private requiresAuth: boolean; 
    private auth: { username?: string, password?: string }; 
    private visitedUrls: Array<string>; 

    constructor(apiKey: string, websiteContext: string, auth: { username?: string, password?: string, requiresAuth: boolean }) {
        this.client = new OpenAI({ apiKey: apiKey }); 
        this.websiteContext = websiteContext; 
        this.links = []; 
        this.requiresAuth = auth.requiresAuth; 
        this.auth = { username: auth.username, password: auth.password }; 
        this.visitedUrls = []; 
        console.log("Login required:", this.requiresAuth);
        console.log("Auth:", { username: this.auth.username, password: this.auth.password });    }

        private async login(page: Page) {
            if (this.requiresAuth && this.auth?.username && this.auth?.password) {
                try {
                    console.log("Starting login process...");
                    
                    await page.waitForLoadState('networkidle');
                    
                    // Fill in login form
                    await page.getByPlaceholder(/email/i).fill(this.auth.username);
                    await page.getByPlaceholder(/password/i).fill(this.auth.password);
                    
                    await page.waitForTimeout(2000);
        
                    // Click login button without using Promise.all
                    await page.getByRole('button', { name: 'Login' }).first().click();
                    
                    // Wait for navigation with increased timeout
                    await page.waitForLoadState('networkidle', { timeout: 60000 });
                    
                    // Additional verification that we're logged in
                    await page.waitForTimeout(5000);
                    console.log('Successfully logged in');
                } catch (error) {
                    console.error('Failed to login:', error);
                    throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
        }
    }

    async crawl(startUrl: string) {
        let initialPage: string = startUrl;
        const self = this;
        if (this.requiresAuth) {
            const browser = await chromium.launch();
            const page = await browser.newPage();
            try {
                console.log("Navigating to start URL for login...");
                await page.goto(startUrl);
                await this.login(page);
                
                                
                // Wait for redirect and get the final URL
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(5000); // Give extra time for any client-side redirects
                
                // Get the final URL after all redirects
                initialPage = page.url();

                // If we're still on the login page, wait for the "Your Jobs" text and try again
                if (initialPage.includes('login')) {
                    await page.waitForSelector('text=Your Jobs', { timeout: 10000 });
                    initialPage = page.url();
                }

                console.log("Post-login URL:", initialPage);
    
                // Get the cookies from the authenticated session
                const cookies = await page.context().cookies();
                await browser.close();
    
                // Configure the crawler with authenticated context
                const crawler = new PlaywrightCrawler({
                    maxRequestsPerCrawl: 20,
                    // Set up context with cookies
                    requestHandlerTimeoutSecs: 180,
                    navigationTimeoutSecs: 120,
                    async requestHandler({ request, page, enqueueLinks, log }) {
                        // Set cookies for each new page
                        await page.context().addCookies(cookies);
                        
                        const currentUrl = request.url;
                        log.info(`Processing: ${currentUrl}`);

                        if (self.visitedUrls.includes(currentUrl)) {
                            console.log("URL already visited, skipping");
                            return;
                        }
                        else {
                            self.visitedUrls.push(currentUrl);
                        }
    
                        const { links, buttons, inputs, forms } = await self.processDOM(page);
    
                        const linkComponent: LinkComponent = {
                            url: currentUrl,
                            interactiveElements: { links, buttons, inputs, forms },
                            testCases: []
                        };
    
                        linkComponent.testCases = await self.generateTestCases(linkComponent);
                        // await self.generateButtonTestCases(linkComponent);
                        // await self.generateInputTestCases(linkComponent);
                        // await self.generateFormTestCases(linkComponent);
                        // await self.generateLinkTestCases(linkComponent);
                        self.links.push(linkComponent);
                        
                        const enqueuedRequests = await enqueueLinks({
                            strategy: 'same-domain',
                            // transformRequestFunction: (req) => {
                            //     // Skip login page
                            //     if (req.url.includes('login')) {
                            //         return false;
                            //     }
                            //     return req;
                            // }
                        });
                        log.info(`Enqueued ${enqueuedRequests.processedRequests.length} URLs for processing`);

                    }, 
                            // Add failure handling
                    failedRequestHandler: async ({ request, error }) => {
                        console.error(`Request failed ${request.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                });
    
                // Start crawling from the post-login page
                await crawler.run([initialPage]);
    
            } catch (error) {
                await browser.close();
                throw error;
            }
        } else {
            // Non-authenticated crawling
            const crawler = new PlaywrightCrawler({
                maxRequestsPerCrawl: 20,
                async requestHandler({ request, page, enqueueLinks, log }) {
                    const currentUrl = request.url;
                    log.info(`Processing: ${currentUrl}`);

                    if (self.visitedUrls.includes(currentUrl)) {
                        console.log("URL already visited, skipping");
                        return;
                    }
                    else {
                        self.visitedUrls.push(currentUrl);
                    }

    
                    const { links, buttons, inputs, forms } = await self.processDOM(page);
    
                    const linkComponent: LinkComponent = {
                        url: currentUrl,
                        interactiveElements: { links, buttons, inputs, forms },
                        testCases: []
                    };
    
                    linkComponent.testCases = await self.generateTestCases(linkComponent);
                    //const testCasesButton = await self.generateButtonTestCases(linkComponent);
                    //const testCasesInput = await self.generateInputTestCases(linkComponent);
                    //const testCasesForm = await self.generateFormTestCases(linkComponent);
                    //const testCasesLink = await self.generateLinkTestCases(linkComponent);
                    //linkComponent.testCases = [...testCasesButton, ...testCasesInput, ...testCasesForm, ...testCasesLink];
                    self.links.push(linkComponent);
                    
                    const enqueuedRequests = await enqueueLinks({
                        strategy: 'same-domain'
                    });
                    log.info(`Enqueued ${enqueuedRequests.processedRequests.length} URLs for processing`);
                }, 
                // Add failure handling
                failedRequestHandler: async ({ request, error }) => {
                    console.error(`Request failed ${request.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });
    
            await crawler.run([startUrl]);
        }
    }

    async processDOM(page: Page) {
        const currentDomain = new URL(page.url()).origin;
        const links = await page.$$eval("a", (links: any, domain: string) => 
            links.map((el: any) => ({
                type: el.tagName.toLowerCase(),
                id: el.id,
                text: el.textContent,
                href: el.href
            }))
            // Filter out external links and non-HTTP(S) protocols
            .filter((link: any) => {
                try {
                    const url = new URL(link.href);
                    return url.origin === domain && 
                           (url.protocol === 'http:' || url.protocol === 'https:');
                } catch {
                    return false;
                }
            })
        , currentDomain);

        const buttons = await page.$$eval("button:not(form button):not([form])", (buttons: any) => 
            buttons.map((el: any) => ({
                type: el.tagName.toLowerCase(),
                id: el.id,
                text: el.textContent.trim(),
                className: el.className,
                ariaLabel: el.getAttribute('aria-label'),
                ariaExpanded: el.getAttribute('aria-expanded'),
                buttonType: el.type,  // button, submit, reset
                disabled: el.disabled
            }))
        );

        //Find a way of getting inputs that are not part of a form 
        const inputs = await page.$$eval("input:not(form input)", (inputs: any) => 
            inputs.map((el: any) => ({
                type: el.tagName.toLowerCase(),
                id: el.id,
                name: el.name,
                inputType: el.type,  // Added to get the input type (text, checkbox, etc.)
                value: el.value,
                text: el.textContent,
                href: el.href
            }))
        );
        const forms = await page.$$eval("form", (forms: any) => 
            forms.map((form: any) => ({
                type: form.tagName.toLowerCase(),
                id: form.id,
                formId: form.getAttribute('data-form-id'),
                action: form.action,
                method: form.method,
                role: form.getAttribute('role'),
                class: form.className,
                inputs: Array.from(form.querySelectorAll('input')).map((input: any) => ({
                    type: input.type,
                    id: input.id,
                    name: input.name,
                    placeholder: input.placeholder,
                    value: input.value,
                    class: input.className,
                    required: input.required,
                    hidden: input.type === 'hidden'
                })),
                buttons: Array.from(form.querySelectorAll('button')).map((button: any) => ({
                    type: button.type,
                    id: button.id,
                    text: button.textContent.trim(),
                    class: button.className,
                    ariaLabel: button.getAttribute('aria-label')
                })),
                labels: Array.from(form.querySelectorAll('label')).map((label: any) => ({
                    for: label.getAttribute('for'),
                    text: label.textContent.trim(),
                    class: label.className
                }))
            }))
        );

        // console.log("URL: ", page.url());
        // console.log("Links: ", links);
        // console.log("Buttons: ", buttons);
        // console.log("Inputs: ", inputs);
        // console.log("Forms: ", forms);
        return { links, buttons, inputs, forms }; 
    }

    //Assertions are assumed - need to finalise assertions by executing Playwright commands 
    
    private async generateTestCases(linkComponent: LinkComponent) {
        const prompt = `
        You are a senior QA automation engineer specializing in Playwright. Generate detailed, executable test cases in JSON format.
        You MUST generate at least one test case for EACH interactive element found on the page.
    
        Current Page URL: ${linkComponent.url}
        Website Context: ${this.websiteContext}
    
        Available Elements:
        Buttons: ${JSON.stringify(linkComponent.interactiveElements.buttons, null, 2)}
        Forms: ${JSON.stringify(linkComponent.interactiveElements.forms, null, 2)}
        Inputs: ${JSON.stringify(linkComponent.interactiveElements.inputs, null, 2)}
        Links: ${JSON.stringify(linkComponent.interactiveElements.links, null, 2)}
    
        REQUIREMENTS:
        1. Generate at least one test case for EACH link found in the 'links' array
        2. Generate at least one test case for EACH button found in the 'buttons' array
        3. Generate at least one test case for EACH input found in the 'inputs' array
        4. Generate at least one test case for EACH form found in the 'forms' array
        5. Generate additional test cases for complex interactions between related elements
        6. For forms, generate both valid and invalid submission test cases
    
        Example test cases for each element type:
        {
          "testCases": [
            {
              "url": "https://example.com/about",
              "id": "link-0-navigation",
              "type": "navigation",
              "elementType": "link",
              "elementIndex": 0,
              "description": "Verify navigation for 'About' link",
              "priority": "high",
              "selectors": {
                "targetElement": "a[href='/about']",
                "relatedElements": {
                  "navigationMenu": "nav.main-menu",
                  "activeIndicator": ".active-page-indicator"
                }
              },
              "steps": [
                {
                  "action": "click",
                  "selector": "a[href='/about']",
                  "description": "Click About link"
                }
              ],
              "assertions": [
                {
                  "type": "url",
                  "expected": "/about",
                  "operator": "contains"
                },
                {
                  "type": "text",
                  "selector": "h1",
                  "expected": "About Us",
                  "operator": "equals"
                }
              ]
            },
            {
              "url": "https://example.com/search",
              "id": "button-1-toggle",
              "type": "interaction",
              "elementType": "button",
              "elementIndex": 1,
              "description": "Verify search button toggles search panel",
              "priority": "high",
              "selectors": {
                "targetElement": "button[aria-label='Toggle search']",
                "relatedElements": {
                  "searchPanel": "#search-panel",
                  "searchInput": "#search-panel input[type='search']"
                }
              },
              "steps": [
                {
                  "action": "click",
                  "selector": "button[aria-label='Toggle search']",
                  "description": "Click search toggle button"
                }
              ],
              "assertions": [
                {
                  "type": "visibility",
                  "selector": "#search-panel",
                  "expected": true,
                  "operator": "equals"
                },
                {
                  "type": "state",
                  "selector": "button[aria-label='Toggle search']",
                  "expected": "true",
                  "operator": "hasAttribute",
                  "attributeName": "aria-expanded"
                }
              ]
            },
            {
              "url": "https://example.com/search",
              "id": "input-2-search",
              "type": "interaction",
              "elementType": "input",
              "elementIndex": 2,
              "description": "Verify search input with autocomplete",
              "priority": "high",
              "selectors": {
                "targetElement": "input[type='search']",
                "relatedElements": {
                  "resultsList": ".search-results",
                  "firstResult": ".search-results > :first-child"
                }
              },
              "steps": [
                {
                  "action": "fill",
                  "selector": "input[type='search']",
                  "value": "test query",
                  "description": "Enter search term"
                },
                {
                  "action": "wait",
                  "timeout": 500,
                  "description": "Wait for results"
                }
              ],
              "assertions": [
                {
                  "type": "visibility",
                  "selector": ".search-results",
                  "expected": true,
                  "operator": "equals"
                },
                {
                  "type": "count",
                  "selector": ".search-results > *",
                  "expected": 0,
                  "operator": "greaterThan"
                }
              ]
            },
            {
              "url": "https://example.com/signup",
              "id": "form-0-submission",
              "type": "form",
              "elementType": "form",
              "elementIndex": 0,
              "description": "Verify signup form submission with validation",
              "priority": "high",
              "selectors": {
                "targetElement": "form#signup-form",
                "relatedElements": {
                  "emailInput": "#email",
                  "passwordInput": "#password",
                  "confirmPassword": "#confirm-password",
                  "submitButton": "button[type='submit']",
                  "errorMessages": ".error-message"
                }
              },
              "steps": [
                {
                  "action": "fill",
                  "selector": "#email",
                  "value": "test@example.com",
                  "description": "Enter email"
                },
                {
                  "action": "fill",
                  "selector": "#password",
                  "value": "SecurePass123!",
                  "description": "Enter password"
                },
                {
                  "action": "fill",
                  "selector": "#confirm-password",
                  "value": "SecurePass123!",
                  "description": "Confirm password"
                },
                {
                  "action": "click",
                  "selector": "button[type='submit']",
                  "description": "Submit form"
                }
              ],
              "assertions": [
                {
                  "type": "url",
                  "expected": "/dashboard",
                  "operator": "contains",
                  "description": "Should redirect to dashboard"
                },
                {
                  "type": "text",
                  "selector": ".welcome-message",
                  "expected": "Welcome",
                  "operator": "contains"
                }
              ]
            }
          ],
          "coverage": {
            "totalElements": 4,
            "coveredElements": 4,
            "elementTypes": {
              "links": { "total": 1, "covered": 1, "indices": [0] },
              "buttons": { "total": 1, "covered": 1, "indices": [1] },
              "inputs": { "total": 1, "covered": 1, "indices": [2] },
              "forms": { "total": 1, "covered": 1, "indices": [0] }
            }
          }
        }
    
        IMPORTANT:
        1. EVERY interactive element MUST have at least one test case
        2. Use the actual properties from the provided elements arrays
        3. Include the element index in the test case ID
        4. Provide accurate coverage information
        5. Use precise selectors from the actual elements
        6. Consider the context of each element
        7. Include appropriate assertions for each element type
        8. Consider error states where applicable
        `;
    
        const completion = await this.client.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a senior QA automation engineer. Generate precise, detailed test cases in JSON format that can be directly used to create E2E tests."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: "gpt-4o",  
            response_format: { type: "json_object" }
        });
    
        try {
            const testCases = JSON.parse(completion.choices[0].message.content ?? "{}");
            return testCases;
        } 
        catch (error) {
            console.error("Failed to parse test cases:", error);
            return { error: "Failed to generate test cases" };
        }
    }

    private async generateButtonTestCases(linkComponent: LinkComponent) {
        const prompt = `
        You are a senior QA automation engineer specializing in Playwright. 
        Generate detailed, executable test cases for buttons found on the page in JSON format.
        You MUST generate at least one test case for EACH button found on the page.
    
        Current Page URL: ${linkComponent.url}
        Website Context: ${this.websiteContext}
        Buttons: ${JSON.stringify(linkComponent.interactiveElements.buttons, null, 2)}
    
        Other Available Elements:
        Forms: ${JSON.stringify(linkComponent.interactiveElements.forms, null, 2)}
        Inputs: ${JSON.stringify(linkComponent.interactiveElements.inputs, null, 2)}
        Links: ${JSON.stringify(linkComponent.interactiveElements.links, null, 2)}
    
        REQUIREMENTS:
        1. Generate at least one test case for EACH button found in the 'buttons' array
    
        Example test cases for each element type:
        {
          "testCases": [
            {
              "url": "${linkComponent.url}",
              "id": "button-1-toggle",
              "type": "interaction",
              "elementType": "button",
              "elementIndex": 1,
              "description": "Verify search button toggles search panel",
              "priority": "high",
              "selectors": {
                "targetElement": "button[aria-label='Toggle search']",
                "relatedElements": {
                  "searchPanel": "#search-panel",
                  "searchInput": "#search-panel input[type='search']"
                }
              },
              "steps": [
                {
                  "action": "click",
                  "selector": "button[aria-label='Toggle search']",
                  "description": "Click search toggle button"
                }
              ],
              "assertions": [
                {
                  "type": "visibility",
                  "selector": "#search-panel",
                  "expected": true,
                  "operator": "equals"
                },
                {
                  "type": "state",
                  "selector": "button[aria-label='Toggle search']",
                  "expected": "true",
                  "operator": "hasAttribute",
                  "attributeName": "aria-expanded"
                }
              ]
            }
          ],
          "coverage": {
            "totalElements": 4,
            "coveredElements": 4
          }
        }
    
        IMPORTANT:
        1. EVERY interactive element MUST have at least one test case
        2. Use the actual properties from the provided buttons array
        3. Include the element index in the test case ID
        4. Provide accurate coverage information
        5. Use precise selectors from the actual elements
        6. Consider the context of each element
        7. Include appropriate assertions for each element type
        8. Consider error states where applicable
        `;
    
        const completion = await this.client.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a senior QA automation engineer. Generate precise, detailed test cases for buttons found on the page in JSON format that can be directly used to create E2E tests."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: "gpt-4o",  
            response_format: { type: "json_object" }
        });
    
        try {
            const testCases = JSON.parse(completion.choices[0].message.content ?? "{}");
            return testCases;
        } catch (error) {
            console.error("Failed to parse test cases:", error);
            return { error: "Failed to generate test cases" };
        }
    }

    private async generateLinkTestCases(linkComponent: LinkComponent) {
        const prompt = `
        You are a senior QA automation engineer specializing in Playwright. 
        Generate detailed, executable test cases for links found on the page in JSON format.
        You MUST generate at least one test case for EACH link found on the page.
    
        Current Page URL: ${linkComponent.url}
        Website Context: ${this.websiteContext}
        Links: ${JSON.stringify(linkComponent.interactiveElements.links, null, 2)}
    
        Other Available Elements:
        Forms: ${JSON.stringify(linkComponent.interactiveElements.forms, null, 2)}
        Inputs: ${JSON.stringify(linkComponent.interactiveElements.inputs, null, 2)}
        Buttons: ${JSON.stringify(linkComponent.interactiveElements.buttons, null, 2)}
    
        REQUIREMENTS:
        1. Generate at least one test case for EACH link found in the 'links' array
    
        Example test cases for each element type:
        {
          "testCases": [
            {
              "url": "${linkComponent.url}",
              "id": "link-0-navigation",
              "type": "navigation",
              "elementType": "link",
              "elementIndex": 0,
              "description": "Verify navigation for 'About' link",
              "priority": "high",
              "selectors": {
                "targetElement": "a[href='/about']",
                "relatedElements": {
                  "navigationMenu": "nav.main-menu",
                  "activeIndicator": ".active-page-indicator"
                }
              },
              "steps": [
                {
                  "action": "click",
                  "selector": "a[href='/about']",
                  "description": "Click About link"
                }
              ],
              "assertions": [
                {
                  "type": "url",
                  "expected": "/about",
                  "operator": "contains"
                },
                {
                  "type": "text",
                  "selector": "h1",
                  "expected": "About Us",
                  "operator": "equals"
                }
              ]
            }
          ],
          "coverage": {
            "totalElements": 4,
            "coveredElements": 4
          }
        }
    
        IMPORTANT:
        1. EVERY interactive element MUST have at least one test case
        2. Use the actual properties from the provided buttons array
        3. Include the element index in the test case ID
        4. Provide accurate coverage information
        5. Use precise selectors from the actual elements
        6. Consider the context of each element
        7. Include appropriate assertions for each element type
        8. Consider error states where applicable
        `;
    
        const completion = await this.client.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a senior QA automation engineer. Generate precise, detailed test cases for links found on the page in JSON format that can be directly used to create E2E tests."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: "gpt-4o",  
            response_format: { type: "json_object" }
        });
    
        try {
            const testCases = JSON.parse(completion.choices[0].message.content ?? "{}");
            return testCases;
        } catch (error) {
            console.error("Failed to parse test cases:", error);
            return { error: "Failed to generate test cases" };
        }
    }

    private async generateInputTestCases(linkComponent: LinkComponent) {
        const prompt = `
        You are a senior QA automation engineer specializing in Playwright. 
        Generate detailed, executable test cases for inputs found on the page in JSON format.
        You MUST generate at least one test case for EACH input found on the page.
    
        Current Page URL: ${linkComponent.url}
        Website Context: ${this.websiteContext}
        Inputs: ${JSON.stringify(linkComponent.interactiveElements.inputs, null, 2)}
    
        Other Available Elements:
        Forms: ${JSON.stringify(linkComponent.interactiveElements.forms, null, 2)}
        Inputs: ${JSON.stringify(linkComponent.interactiveElements.inputs, null, 2)}
        Buttons: ${JSON.stringify(linkComponent.interactiveElements.buttons, null, 2)}
    
        REQUIREMENTS:
        1. Generate at least one test case for EACH input found in the 'inputs' array
        2. Include validation tests where appropriate
        3. Consider related elements (labels, submit buttons, error messages)
    
        Example test cases for each element type:
        {
          "testCases": [
            {
              "url": "${linkComponent.url}",
              "id": "input-0-search",
              "type": "search",
              "elementType": "input",
              "elementIndex": 0,
              "description": "Verify search input functionality",
              "priority": "high",
              "selectors": {
                "targetElement": "#is-search-input-25569",
                "relatedElements": {
                  "form": "form.is-search-form",
                  "submitButton": "button[type='submit']",
                  "label": "label[for='is-search-input-25569']"
                }
              },
              "steps": [
                {
                  "action": "fill",
                  "selector": "#is-search-input-25569",
                  "value": "test query",
                  "description": "Enter search term"
                },
                {
                  "action": "click",
                  "selector": "button[type='submit']",
                  "description": "Click search submit button"
                }
              ],
              "assertions": [
                {
                  "type": "url",
                  "expected": "s=test+query",
                  "operator": "contains"
                },
                {
                  "type": "visibility",
                  "selector": ".search-results",
                  "operator": "visible"
                }
              ]
            },
            {
              "url": "${linkComponent.url}",
              "id": "input-1-email",
              "type": "validation",
              "elementType": "input",
              "elementIndex": 1,
              "description": "Validate email input field",
              "priority": "medium",
              "selectors": {
                "targetElement": "#email-input",
                "relatedElements": {
                  "form": "form.contact-form",
                  "errorMessage": "#email-error",
                  "submitButton": "button[type='submit']"
                }
              },
              "steps": [
                {
                  "action": "fill",
                  "selector": "#email-input",
                  "value": "invalid-email",
                  "description": "Enter invalid email format"
                },
                {
                  "action": "click",
                  "selector": "button[type='submit']",
                  "description": "Submit form"
                }
              ],
              "assertions": [
                {
                  "type": "validation",
                  "selector": "#email-input",
                  "operator": "invalid"
                },
                {
                  "type": "visibility",
                  "selector": "#email-error",
                  "operator": "visible"
                }
              ]
            }
          ],
          "coverage": {
            "totalElements": 4,
            "coveredElements": 4
          }
        }
    
        IMPORTANT:
        1. EVERY interactive element MUST have at least one test case
        2. Use the actual properties from the provided buttons array
        3. Include the element index in the test case ID
        4. Provide accurate coverage information
        5. Use precise selectors from the actual elements
        6. Consider the context of each element
        7. Include appropriate assertions for each element type
        8. Consider error states where applicable
        `;
    
        const completion = await this.client.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a senior QA automation engineer. Generate precise, detailed test cases for inputs found on the page in JSON format that can be directly used to create E2E tests."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: "gpt-4o",  
            response_format: { type: "json_object" }
        });
    
        try {
            const testCases = JSON.parse(completion.choices[0].message.content ?? "{}");
            return testCases;
        } catch (error) {
            console.error("Failed to parse test cases:", error);
            return { error: "Failed to generate test cases" };
        }
    }

    private async generateFormTestCases(linkComponent: LinkComponent) {
        const prompt = `
        You are a senior QA automation engineer specializing in Playwright. 
        Generate detailed, executable test cases for forms found on the page in JSON format.
        You MUST generate at least one test case for EACH form found on the page.
    
        Current Page URL: ${linkComponent.url}
        Website Context: ${this.websiteContext}
        Forms: ${JSON.stringify(linkComponent.interactiveElements.forms, null, 2)}
    
        Other Available Elements:
        Links: ${JSON.stringify(linkComponent.interactiveElements.links, null, 2)}
        Inputs: ${JSON.stringify(linkComponent.interactiveElements.inputs, null, 2)}
        Buttons: ${JSON.stringify(linkComponent.interactiveElements.buttons, null, 2)}
    
        REQUIREMENTS:
        1. Generate at least one test case for EACH form found in the 'forms' array
    
        Example test cases for each element type:
        {
          "testCases": [
            {
              "url": "https://example.com/signup",
              "id": "form-0-submission",
              "type": "form",
              "elementType": "form",
              "elementIndex": 0,
              "description": "Verify signup form submission with validation",
              "priority": "high",
              "selectors": {
                "targetElement": "form#signup-form",
                "relatedElements": {
                  "emailInput": "#email",
                  "passwordInput": "#password",
                  "confirmPassword": "#confirm-password",
                  "submitButton": "button[type='submit']",
                  "errorMessages": ".error-message"
                }
              },
              "steps": [
                {
                  "action": "fill",
                  "selector": "#email",
                  "value": "test@example.com",
                  "description": "Enter email"
                },
                {
                  "action": "fill",
                  "selector": "#password",
                  "value": "SecurePass123!",
                  "description": "Enter password"
                },
                {
                  "action": "fill",
                  "selector": "#confirm-password",
                  "value": "SecurePass123!",
                  "description": "Confirm password"
                },
                {
                  "action": "click",
                  "selector": "button[type='submit']",
                  "description": "Submit form"
                }
              ],
              "assertions": [
                {
                  "type": "url",
                  "expected": "/dashboard",
                  "operator": "contains",
                  "description": "Should redirect to dashboard"
                },
                {
                  "type": "text",
                  "selector": ".welcome-message",
                  "expected": "Welcome",
                  "operator": "contains"
                }
              ]
            }
            
          ],
          "coverage": {
            "totalElements": 4,
            "coveredElements": 4
          }
        }
    
        IMPORTANT:
        1. EVERY interactive element MUST have at least one test case
        2. Use the actual properties from the provided buttons array
        3. Include the element index in the test case ID
        4. Provide accurate coverage information
        5. Use precise selectors from the actual elements
        6. Consider the context of each element
        7. Include appropriate assertions for each element type
        8. Consider error states where applicable
        `;
    
        const completion = await this.client.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a senior QA automation engineer. Generate precise, detailed test cases for forms found on the page in JSON format that can be directly used to create E2E tests."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: "gpt-4o",  
            response_format: { type: "json_object" }
        });
    
        try {
            const testCases = JSON.parse(completion.choices[0].message.content ?? "{}");
            return testCases;
        } catch (error) {
            console.error("Failed to parse test cases:", error);
            return { error: "Failed to generate test cases" };
        }
    }

    

    public async getResults() {
        const results = {
            totalPages: this.links.length,
            pages: this.links.map(linkComponent => ({
                url: linkComponent.url,
                elementCounts: {
                    buttons: linkComponent.interactiveElements.buttons?.length || 0,
                    forms: linkComponent.interactiveElements.forms?.length || 0,
                    inputs: linkComponent.interactiveElements.inputs?.length || 0,
                    links: linkComponent.interactiveElements.links?.length || 0
                },
                testCases: linkComponent.testCases
            }))
        };

        // Log results to server console
        console.log("Generated Results:", JSON.stringify(results, null, 2));
        
        return results;
    }

    public printResults() {
        const results = this.getResults();
        console.log("Full Test Generation Results:", JSON.stringify(results, null, 2));
    }
}