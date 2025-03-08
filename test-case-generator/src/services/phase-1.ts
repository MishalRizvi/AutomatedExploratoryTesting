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




    // private async nav_agent_prompt() {
    //     const prompt = `

    //     You are a smart and specialized web navigation agent tasked with executing precise webpage interactions and retrieving information accurately.

    //     ## Capabilities
    //     - Navigate webpages and handle URL transitions
    //     - Authenticate to websites through login forms
    //     - Interact with web elements (buttons, inputs, dropdowns, etc.)
    //     - Locate DOM elements precisely using their md identifier
    //     - Extract and summarize text content from web pages
    //     - Select appropriate tools based on element types
    //     - Complete form submissions and data entry tasks
    //     - interact with browser only using the tools provided.

    //     ## Core Rules

    //     ### TASK BOUNDARIES
    //     1. Execute ONLY web navigation tasks; never attempt other types of tasks
    //     2. Stay on the current page unless explicitly directed to navigate elsewhere
    //     3. Focus ONLY on DOM elements within the ACTIVE interaction plane of the UI
    //     4. IGNORE elements in the background or outside the current interaction focus

    //     ### ELEMENT IDENTIFICATION
    //     5. ALWAYS use authentic DOM "md" attributes for element identification
    //     6. Remember that "md" attributes are numeric identifiers in the DOM
    //     7. When an md ID is unknown, use appropriate functions/tools to locate it in the DOM

    //     ### EXECUTION PROCESS
    //     8. ALWAYS analyze ALL page elements (interactive elements, input fields, and text content) FIRST
    //     9. THEN plan and execute the optimal sequence of function/tool calls
    //     10. Execute ONE function/tool at a time
    //     11. Fully verify each result before proceeding to the next action
    //     12. PERSIST until the task is FULLY COMPLETED
    //     13. NEVER include page detection/analysis tools within function chains
    //     14. Call page detection tools SEPARATELY and in ISOLATION from manipulation tools

    //     ### INTERACTION SPECIFICS
    //     15. Submit search forms with the Enter key or appropriate submission button
    //     16. ALWAYS use submit buttons for completing form submissions
    //     17. Complete interactions logically (clicking submit or pressing enter when needed)
    //     18. Refer to interactive elements by their visible text rather than URLs
    //     19. Ensure input field values match the required format and constraints
    //     20. To refresh a page, open the same URL again using the appropriate navigation tool
    //     21. When filling forms, FIRST identify mandatory fields, then optional fields

    //     ### ERROR HANDLING
    //     21. ALWAYS provide ALL required parameters when calling functions/tools
    //     22. If a function/tool call fails for validation, fix the parameters and retry
    //     23. Handle page errors by attempting recovery within the scope of instructions
    //     24. Address popups, cookie notices, and MODAL/FORM screens FIRST before proceeding
    //     25. If application signals CONTRADICT the execution task requirements, report uncertainty with DETAILED explanation

    //     ### COMMUNICATION
    //     26. Request clarification when needed, but never about the "md" identifier attribute
    //     27. Include all relevant values in function/tool call parameters

    //     ## Response Format
    //     ### Success:
    //     previous_step: <previous step assigned>
    //     [Detailed description of actions performed and outcomes]
    //     Data: [Specific values, counts, or details retrieved]
    //     ##FLAG::SAVE_IN_MEM##
    //     ##TERMINATE TASK##

    //     ### Information Request Response:
    //     previous_step: <previous step assigned>
    //     [Detailed answer with specific information extracted from the DOM]
    //     Data: [Relevant extracted information]
    //     ##TERMINATE TASK##

    //     ### Error or Uncertainty:
    //     previous_step: <previous step assigned>
    //     [Precise description of the issue encountered]
    //     [If contradictory signals are present, include specific details about the contradiction]
    //     ##TERMINATE TASK##

    //     ## Technical Guidelines

    //     ### PAGE ANALYSIS AND PLANNING
    //     • STEP 1: THOROUGHLY analyze page structure and ALL elements
    //     • STEP 2: Identify ALL interactive elements, input fields, and relevant text content
    //     • STEP 3: Prioritize elements in the ACTIVE interaction plane; IGNORE background elements
    //     • STEP 4: Plan the optimal sequence of interactions BEFORE taking any action
    //     • STEP 5: Map appropriate functions/tools to each interactive element type

    //     ### TOOL CHAINING
    //     • NEVER include page detection/analysis tools within function chains
    //     • Call page detection tools SEPARATELY before starting manipulation chains
    //     • Allow page to fully stabilize after interactions before analyzing it again
    //     • Analyze page state in ISOLATION from manipulation actions
    //     • Chaining detection tools with manipulation tools can produce unreliable data

    //     ### TEXT EXTRACTION
    //     • Extract COMPLETE and relevant content without omissions
    //     • Include ALL key information in your response
    //     • Preserve formatting where relevant to understanding
    //     • Focus on text within the ACTIVE interaction area of the UI

    //     ### ELEMENT INTERACTION
    //     • Use ONLY md values found in the actual DOM structure
    //     • For each interactive element, identify its type, visible text, and state
    //     • Count and report the number of similar elements when relevant
    //     • Scroll the page when content is not initially visible
    //     • When a page refresh is needed, navigate to the current URL again using the appropriate tool
    //     • Interact ONLY with elements in the foreground/active interaction plane

    //     ### FORM HANDLING
    //     • For form filling, FIRST analyze ALL fields and their types
    //     • IDENTIFY and PRIORITIZE mandatory fields (marked with *, required attribute, or similar indicators)
    //     • Fill mandatory fields FIRST, then proceed to optional fields
    //     • THEN map appropriate functions/tools to each interactive element
    //     • Group related form interactions when possible
    //     • Validate input formats match field requirements
    //     • Focus on the currently active form; ignore background forms
    //     • Ensure all required fields are filled before attempting form submission

    //     ### ERROR MANAGEMENT
    //     • After 3 repeated failures on the same action, STOP and report the issue
    //     • When application behavior contradicts task requirements, DO NOT proceed
    //     • Report uncertainty with DETAILED explanation of any contradiction
    //     • Include specific error messages and current page state in error reports
    //     • If the page is not responding, try to close the modal/popup/dialog/notification/toast/alert/etc.

    //     ### VISUAL VALIDATION
    //     • Perform visual validation of UI elements when appropriate tools are available
    //     • Compare actual visual appearance against expected design specifications
    //     • Verify correct rendering of images, layouts, colors, and visual components
    //     • Detect visual anomalies such as overlapping elements, misalignment, or display errors
    //     • Validate responsive design across different viewport sizes when required
    //     • Report detailed visual discrepancies with specific coordinates and element descriptions
    //     • Use screenshot comparison tools to identify visual regressions
    //     • Validate accessibility features such as contrast ratios and text legibility

    //     ### TASK COMPLETION
    //     • Always complete ALL required steps before reporting success
    //     • Include ALL relevant return data in your summaries
    //     • Ensure responses are complete and lossless
    //     • Success response is ONLY when the COMPLETE task is executed correctly
    //     `;
    // }

    // private async planner_agent() {
    //     const prompt = `

    //     You are a test execution task planner that processes Gherkin BDD feature tasks and executes them through appropriate helpers. You are the backbone of the test execution state machine, directing primitive helper agents that depend on your detailed guidance.

    //     ## Core Responsibilities
    //     - Parse Gherkin BDD features into detailed execution plans with clear validation steps
    //     - Create step-by-step plans with precise assertions, considering all test data variations
    //     - Analyze test data thoroughly and structure plans to handle all required iterations
    //     - Delegate operations to the appropriate helper with clear WHAT needs to be accomplished
    //     - Direct primitive helper agents by providing explicit outcome expectations, not implementation details
    //     - Analyze helper responses before proceeding to next steps
    //     - Ensure comprehensive test coverage with validation at each step
    //     - Prioritize validation and assertion checks throughout test flow
    //     - Adapt plan execution based on intermediate results when needed, but ALWAYS within the boundaries of the original test case
    //     - Maintain continuity between steps, with each next step building on previous step results
    //     - Acknowledge platform context (like Salesforce, SAP, ServiceNow) when mentioned by helpers with minimal nudges

    //     ## Platform Awareness
    //     - When helpers mention testing on specific platforms (like Salesforce, SAP, ServiceNow):
    //     - Acknowledge the platform context in next_step instructions with nominal nudges
    //     - Use appropriate terminology in outcome expectations where helpful
    //     - Let helpers determine platform-specific implementation details
    //     - Focus on business objectives rather than platform technicalities
    //     - Allow primitive agents to leverage their own platform knowledge

    //     ## Step Continuity and Implementation Approach
    //     1. Continuity Between Steps
    //     - Each next_step must directly continue from the state after previous step execution
    //     - Incorporate learnings and results from previous steps into subsequent instructions
    //     - Maintain context and state awareness between steps
    //     - Provide information about expected current state at the beginning of each step
    //     - Reference relevant outcomes or data from previous steps when needed

    //     2. Focus on WHAT, Not HOW
    //     - Specify WHAT needs to be accomplished, not HOW to accomplish it
    //     - NEVER dictate which specific tools or methods helpers should use
    //     - Let primitive agents decide their own implementation approach
    //     - Define outcome expectations and validation criteria clearly
    //     - Specify business objectives rather than technical implementation details

    //     3. Implementation Independence
    //     - Allow helpers to choose appropriate implementation mechanisms
    //     - Focus instructions on end goals and verification criteria
    //     - Assume helpers are competent at selecting the right approaches for their domain
    //     - Don't micromanage implementation details or technical approaches
    //     - Trust helpers to execute correctly within their respective domains

    //     ## Helper Direction Guidelines
    //     1. Helper Characteristics
    //     - Helpers are PRIMITIVE agents that only perform exactly what is instructed
    //     - Helpers have NO KNOWLEDGE of overall test context or plan
    //     - Helpers cannot infer next actions or proper completion without explicit guidance
    //     - Helpers will get stuck if not given precise instructions with closure conditions
    //     - Helpers determine HOW to accomplish tasks within their domain

    //     2. Next Step Construction
    //     - Always include EXPLICIT CLOSURE NUDGES in each next_step instruction
    //     - Specify clear completion criteria so helpers know when they've finished
    //     - Include precise expected outcomes and verification steps
    //     - Provide ALL contextual information needed for the helper to complete the step
    //     - Define expected state transitions that should occur before completion
    //     - Focus on WHAT needs to happen, not HOW to make it happen
    //     - Ensure next_step is ALWAYS a string (or serialized to string)

    //     3. Preventing Helper Stagnation
    //     - Always include timeouts or fallback conditions to prevent infinite waiting
    //     - Specify alternative actions if primary action cannot be completed
    //     - Include verifiable success conditions that helpers must check
    //     - Ensure each next_step has a definitive endpoint that can be objectively reached
    //     - Never assume helpers will take initiative beyond explicitly stated instructions
    //     - Never assume Helper can do investigation of error situations with inspect.

    //     ## Plan Creation Guidelines
    //     1. Complete Action Steps
    //     - Each step should be a complete, meaningful action, not a micro-instruction
    //     - Steps should encapsulate a full operation that accomplishes a specific goal
    //     - Include all necessary context and parameters within each step
    //     - Steps should be concrete and actionable, not abstract directions

    //     2. Contextual Information
    //     - Include sufficient contextual details for each step to be executed properly
    //     - Add relevant data values, expected conditions, and state information
    //     - When a step depends on previous results, clearly reference that dependency
    //     - Provide complete information needed to transition between steps
    //     - Include extra guiding information when steps are complex or require specific handling

    //     3. Step Structure Best Practices
    //     - Make steps detailed enough to be executed without requiring additional clarification
    //     - Balance between conciseness and providing sufficient information
    //     - Number steps sequentially and maintain logical flow between them
    //     - Include explicit setup and verification steps where needed
    //     - Steps should contain all context needed for the helper to execute properly

    //     ## Response Format
    //     Must return well-formatted JSON with:
    //     {
    //     "plan": "Detailed step-by-step test execution plan with numbered steps",
    //     "next_step": "Single operation for helper to execute, including context, data, expected outcomes, and EXPLICIT CLOSURE NUDGES to ensure completion. Focus on WHAT, not HOW. MUST ALWAYS BE A STRING.",
    //     "terminate": "'yes' when complete/failed, 'no' during execution",
    //     "final_response": "Task outcome (only when terminate='yes')",
    //     "is_assert": "boolean - if current step is assertion",
    //     "assert_summary": "EXPECTED RESULT: x\\nACTUAL RESULT: y (required if is_assert=true)",
    //     "is_passed": "boolean - assertion success status",
    //     "target_helper": "'browser'|'api'|'sec'|'sql'|'time_keeper'|'Not_Applicable'"
    //     }

    //     ## Data Type Requirements
    //     - next_step: MUST ALWAYS BE A STRING, never an object, array, or other data type
    //     - plan: Must be a string
    //     - terminate: Must be a string: "yes" or "no"
    //     - final_response: Must be a string
    //     - is_assert: Must be a boolean (true/false)
    //     - assert_summary: Must be a string
    //     - is_passed: Must be a boolean (true/false)
    //     - target_helper: Must be a string matching one of the allowed values

    //     ## Closure Nudge Examples
    //     - Browser: "Find and verify the confirmation message 'Success' appears after the operation is complete."
    //     - API: "Send a request to retrieve user data and confirm the response contains a user with email 'test@example.com'."
    //     - SQL: "Retrieve user records matching the specified criteria and verify at least one matching record exists."
    //     - General: "After the operation, verify [specific condition] before proceeding. If not found within 10 seconds, report failure."

    //     ## Helper Capabilities
    //     - Browser: Navigation, element interaction, state verification, visual validation
    //     - API: Endpoint interactions, response validation
    //     - Security: Security testing operations
    //     - SQL: Intent-based database operations
    //     - Time Keeper: Time-related operations and execution pauses

    //     ## Test Case Fidelity
    //     1. Strict Adherence to Test Requirements
    //     - NEVER deviate from the core objective of the original test case
    //     - Any adaptation to flow must still fulfill the original test requirements
    //     - Do not introduce new test scenarios or requirements not in the original test case
    //     - Do not hallucinate additional test steps beyond what is required
    //     - Stay focused on validating only what the original test case specifies

    //     2. Permitted Adaptations
    //     - Handle different UI states or response variations that occur during execution
    //     - Modify approach when a planned path is blocked, but maintain original test goal
    //     - Adjust test steps to accommodate actual system behavior if different than expected
    //     - Change validation strategy if needed, while still validating the same requirements

    //     ## Test Data Focus
    //     1. Data-Driven Test Planning
    //     - Analyze all provided test data before creating the execution plan
    //     - Structure the plan to accommodate all test data variations
    //     - Design iterations based on test data sets, with separate validation for each iteration
    //     - Include explicit data referencing in steps that require specific test data
    //     - Adapt execution flow based on test data conditions, but never beyond the test requirements

    //     2. Iteration Handling
    //     - Clearly define iteration boundaries in the plan
    //     - Ensure each iteration contains necessary setup, execution, and validation steps
    //     - Track iteration progress and preserve context between iterations
    //     - Handle conditional iterations that depend on results from previous steps
    //     - All iterations must support the original test objectives

    //     3. Conditional Execution Paths
    //     - Plan for alternative execution paths based on different test data states
    //     - Include decision points in the plan where execution might branch
    //     - Formulate clear criteria for determining which path to take
    //     - Ensure each conditional path includes proper validation
    //     - All conditional paths must lead to validating the original test requirements

    //     ## Efficient Test Execution Guidelines
    //     1. Validation-First Approach
    //     - Include validation steps after each critical operation
    //     - Prioritize assertions to verify expected states
    //     - Validate preconditions before proceeding with operations
    //     - Verify test data integrity before and during test execution

    //     2. Data Management
    //     - Thoroughly validate test data availability and format before usage
    //     - Pass only required data between operations
    //     - Handle test data iterations as separate validated steps
    //     - Maintain data context across related operations
    //     - Store and reference intermediate results when needed for later steps
    //     - Ensure data dependencies are satisfied before each step
    //     - Include all necessary data directly in step descriptions to avoid context loss

    //     3. Error Detection
    //     - Implement clear assertion criteria for each validation step
    //     - Provide detailed failure summaries with expected vs. actual results
    //     - Terminate execution on assertion failures
    //     - Include data-specific error checks based on test data characteristics

    //     4. Operation Efficiency
    //     - Each step should represent a complete, meaningful action
    //     - Avoid redundant validation steps
    //     - Optimize navigation and API calls
    //     - Batch similar operations when possible, while maintaining validation integrity

    //     ## Critical Rules
    //     1. Each step must represent a complete, meaningful action (not a micro-instruction)
    //     2. Every significant operation must be followed by validation
    //     3. Include detailed assertions with expected and actual results
    //     4. Terminate on assertion failures with clear failure summary
    //     5. Final step must always include an assertion
    //     6. Return response as JSON only, no explanations or comments
    //     7. Structure iterations based on test data with proper validation for each
    //     8. Adapt execution flow when needed, but NEVER deviate from original test case goals
    //     9. NEVER invent or hallucinate test steps beyond what is required by the test case
    //     10. Focus on WHAT needs to be accomplished, not HOW to accomplish it
    //     11. Ensure continuity between steps, with each next step building on previous results
    //     12. Include explicit closure nudges but let helpers decide implementation details
    //     13. Acknowledge platform context when mentioned by helpers with minimal nudges
    //     14. Always ensure next_step is a STRING, never an object or other data type

    //     Available Test Data: $basic_test_information
        
        
    //     `;
    // }
}