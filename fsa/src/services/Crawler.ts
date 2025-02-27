import { PlaywrightCrawler, Dataset } from 'crawlee';
import { Page } from 'playwright';

interface InteractionPath {
    startUrl: string;
    steps: string[];
    endUrl: string;
    isComplete: boolean;  // True if path reaches an end state
  }

  interface PageNode {
    url: string;
    title: string;
    links: string[];
    buttons: string[];
    forms: string[];
    children: PageNode[];
}

export class Crawler {

    private requestCount: number = 0;

    // public paths: Array<{
    //     parentUrl: string;
    //     steps: Array<{
    //         type: string;
    //         context: string;
    //     }>;
    //     isComplete?: boolean;
    //     endReason?: string;
    // }> = [];

    public paths: Array<{}> = []; 

    // async crawl(startUrl: string, context: string, auth?: {email: string, password: string}) {
    //     const self = this;
    //     const crawler = new PlaywrightCrawler({
    //                     // Add configuration to handle maximum depth and prevent infinite loops
    //         maxRequestsPerCrawl: 1000,
    //         maxRequestRetries: 1,
    //         requestHandlerTimeoutSecs: 60,
    //         async requestHandler ({ page, request, enqueueLinks, log }) {
    //             // Auto-scroll to load all content
    //             await page.evaluate(async () => {
    //                 await new Promise<void>((resolve) => {
    //                     let totalHeight = 0;
    //                     const distance = 100;
    //                     const timer = setInterval(() => {
    //                         const scrollHeight = document.body.scrollHeight;
    //                         window.scrollBy(0, distance);
    //                         totalHeight += distance;

    //                         if(totalHeight >= scrollHeight){
    //                             clearInterval(timer);
    //                             resolve();
    //                         }
    //                     }, 100);
    //                 });
    //             });
    //             // Wait for any dynamic content to load
    //             await page.waitForLoadState('networkidle');
    //             page.setDefaultTimeout(60000);

    //             const currentUrl = request.url;
    //             const currentTitle = await page.title();
    //             log.info(`Navigating to ${currentUrl}`);     
                
    //             const currentPath = request.userData?.path || {
    //                 startUrl: currentUrl,
    //                 steps: []
    //             };

    //             // Check if we've reached an end state
    //             const { isEnd, reason } = await self.isEndState(page, currentUrl, currentTitle);
                
    //             if (isEnd) {
    //                 currentPath.isComplete = true;
    //                 currentPath.endReason = reason;  // Store the reason
    //                 self.paths.push(currentPath);
    //                 log.info(`End state reached: ${reason}`);
    //                 return;
    //             }

    //             // Store initial state to return to after each interaction
    //             const initialState = {
    //                 url: currentUrl,
    //                 path: currentPath
    //             };

    //             // 1. First, collect all interactive elements
    //             const interactiveElements = await Promise.all([
    //                 // Get all links
    //                 page.getByRole('link').all().then((links: any) => 
    //                     links.map((link: any) => ({ type: 'link', element: link }))),
    //                 // Get all buttons
    //                 page.getByRole('button').all().then((buttons: any) => 
    //                     buttons.map((button: any) => ({ type: 'button', element: button }))),
    //                 // Get all forms
    //                 page.getByRole('form').all().then((forms: any) => 
    //                     forms.map((form: any) => ({ type: 'form', element: form })))
    //             ]).then(arrays => arrays.flat());

    //             // 2. Try each interaction independently
    //             for (const { type, element } of interactiveElements) {
    //                 try {
    //                     // Reset to initial state if needed
    //                     if (page.url() !== initialState.url) {
    //                         await page.goto(initialState.url);
    //                         await page.waitForLoadState('networkidle');
    //                     }

    //                     const elementText = await element.textContent() || '';
    //                     log.info(`Trying ${type} interaction: ${elementText}`);

    //                     const newStep = { type, context: elementText };
    //                     const updatedPath = {
    //                         ...initialState.path,
    //                         steps: [...initialState.path.steps, newStep]
    //                     };

    //                     // Perform the interaction based on type
    //                     switch (type) {
    //                         case 'link':
    //                             console.log('link');
    //                             await element.click();
    //                             break;
    //                         case 'button':
    //                             console.log('button');
    //                             await element.click();
    //                             break;
    //                         case 'form':
    //                             console.log('form');
    //                             const inputs = await element.getByRole('textbox').all();
    //                             for (const input of inputs) {
    //                                 await input.fill('test input');
    //                             }
    //                             await element.evaluate((f: HTMLFormElement) => f.submit());
    //                             break;
    //                     }

    //                     await page.waitForLoadState('networkidle');

    //                     // Check if interaction caused navigation
    //                     const newUrl = page.url();
    //                     if (newUrl !== initialState.url) {
    //                         console.log('newUrl', newUrl);
    //                         // Enqueue the new page with updated path
    //                         await enqueueLinks({
    //                             userData: {
    //                                 path: {
    //                                     ...updatedPath,
    //                                     steps: [...updatedPath.steps, 
    //                                         { type: 'navigation', context: newUrl }]
    //                                 }
    //                             }
    //                         });
    //                     } else {
    //                         // If no navigation, look for any new interactive elements
    //                         // that might have appeared (like expanded menus)
    //                         await enqueueLinks({
    //                             userData: { path: updatedPath }
    //                         });
    //                     }

    //                 } catch (error) {
    //                     log.error(`Error with ${type} interaction: ${error}`);
    //                     continue;
    //                 }
    //             }
    //         },

    //     });

    //     await crawler.run([startUrl]);
    // }

    private async isEndState(page: Page, url: string, title: string): Promise<{isEnd: boolean, reason: string}> {
        try {
            // 1. Check for successful network responses
            let hasSuccessResponse = false;
            page.on('response', async (response: any) => {
                const status = response.status();
                const contentType = response.headers()['content-type'] || '';
                
                if (status === 200 && contentType.includes('application/json')) {
                    try {
                        const json = await response.json();
                        if (json.success || json.status === 'success') {
                            hasSuccessResponse = true;
                        }
                    } catch (e) {
                        // Ignore parsing errors
                    }
                }
            });

            // 2. Check for interactive elements
            const interactiveElements = await Promise.all([
                page.getByRole('button').count(),
                page.getByRole('link').count(),
                page.getByRole('textbox').count(),
                page.getByRole('form').count()
            ]);

            const totalInteractiveElements = interactiveElements.reduce((a, b) => a + b, 0);

            if (hasSuccessResponse) {
                return { 
                    isEnd: true, 
                    reason: 'Successful network response detected' 
                };
            }

            if (totalInteractiveElements === 0) {
                return { 
                    isEnd: true, 
                    reason: 'No more interactive elements found' 
                };
            }

            return { 
                isEnd: false, 
                reason: 'Page still has interactive elements' 
            };

        } catch (error) {
            console.error('Error in isEndState:', error);
            return { 
                isEnd: true, 
                reason: `Error occurred: ${(error as Error).message}` 
            };
        }
    }

    async crawl(startUrl: string) {
        const self = this;
        const crawler = new PlaywrightCrawler({
            maxRequestsPerMinute: 10, 
            async requestHandler({ request, page, enqueueLinks, log }) {
                const currentUrl = request.url;
                const currentTitle = await page.title();
                log.info(`Processing: ${currentUrl}`);

                console.log("---------------------------------REQUEST", JSON.stringify(request, null, 2));


                // const links = await page.$$eval('a[href]', els => 
                //     els.map(el => el.getAttribute('href')).filter(Boolean) as string[]
                // );
                
                // const buttons = await page.$$eval('button', els => 
                //     els.map(el => el.textContent?.trim()).filter(Boolean) as string[]
                // );
                
                // const forms = await page.$$eval('form', els => 
                //     els.map(el => el.getAttribute('action')).filter(Boolean) as string[]
                // );
                
                Dataset.pushData({
                    url: currentUrl,
                    title: currentTitle
                });

                const currentPath = request.userData?.path ?? [currentUrl];

                const enqueuedRequests = await enqueueLinks({ 
                    transformRequestFunction: (request) => {
                        if (request.url.endsWith('.pdf')) return false; 
                        // Get existing path or initialize empty array
                        // Add current URL to path
                        const updatedPath = [...currentPath, request.url];
                        // Update request with new path
                        request.userData = { title: currentTitle, currentUrl: request.url, path: updatedPath };
                        return request;
                    }, 
                    forefront: true
                });

                if (enqueuedRequests.processedRequests.length <= 0) {
                    //This is an end state 
                    console.log("End state reached - no more requests");
                    console.log("Current path:", request.userData.path);
                    self.paths.push(request.userData.path); 
                }

                // Check if we're at max requests
                if (self.requestCount === 20) {
                    // This is an end state
                    console.log("End state reached - max requests");
                    console.log("Current path:", request.userData.path);
                    self.paths.push(request.userData.path);
                    return;
                }
            }
        });
        // Create initial request with initialized userData
        const initialRequest = {
            url: startUrl,
            userData: {
                title: '',
                currentUrl: startUrl,
                path: [startUrl]  // Initialize with start URL
            }
            };
        await crawler.run([initialRequest]);
        console.log(self.paths);
        console.log(self.requestCount);
        return this.paths;
    }

    printTree(node: PageNode, level = 0) {
        const indent = '  '.repeat(level);
        console.log(`${indent}📄 ${node.title} (${node.url})`);
        
        if (node.buttons.length > 0) {
            console.log(`${indent}  🔘 Buttons: ${node.buttons.length}`);
        }
        if (node.forms.length > 0) {
            console.log(`${indent}  📝 Forms: ${node.forms.length}`);
        }
        if (node.links.length > 0) {
            console.log(`${indent}  🔗 Links: ${node.links.length}`);
        }

        node.children.forEach(child => {
            this.printTree(child, level + 1);
        });
    }
}