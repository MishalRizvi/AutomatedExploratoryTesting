import { PlaywrightCrawler, Dataset } from 'crawlee';
import { Page } from 'playwright';
import { LLMAgent } from './LLMAgent';

export interface State {
    url: string;
    title: string;
    interactions: {
        links: Array<{ text: string, url: string }>;
        buttons: Array<{ text: string, selector: string }>;
        forms: Array<{ id: string, inputs: string[] }>;
    };
}

interface Transition {
    from: string;
    to: string;
    action: {
        //type: 'link' | 'button' | 'form';
        type: string;
        context: string;
    };
}

export class Crawler {

    private states: Map<string, State> = new Map();
    private transitions: Transition[] = [];
    private visitedUrls: Set<string> = new Set();

    private workflows: Map<string, Set<string>> = new Map();
    private currentWorkflowId: string | null = null;
    private llm: LLMAgent;

    constructor() {
        this.llm = new LLMAgent();
    }

    public paths: Array<{}> = []; 

    // async crawl(startUrl: string) {
    //     const self = this;
    //     const crawler = new PlaywrightCrawler({
    //         maxRequestsPerMinute: 10, 
    //         async requestHandler({ request, page, enqueueLinks, log }) {
    //             const currentUrl = request.url;
    //             const currentTitle = await page.title();
    //             log.info(`Processing: ${currentUrl}`);

    //             console.log("---------------------------------REQUEST", JSON.stringify(request, null, 2));


    //             // const links = await page.$$eval('a[href]', els => 
    //             //     els.map(el => el.getAttribute('href')).filter(Boolean) as string[]
    //             // );
                
    //             // const buttons = await page.$$eval('button', els => 
    //             //     els.map(el => el.textContent?.trim()).filter(Boolean) as string[]
    //             // );
                
    //             // const forms = await page.$$eval('form', els => 
    //             //     els.map(el => el.getAttribute('action')).filter(Boolean) as string[]
    //             // );
                
    //             Dataset.pushData({
    //                 url: currentUrl,
    //                 title: currentTitle
    //             });

    //             const currentPath = request.userData?.path ?? [currentUrl];

    //             const enqueuedRequests = await enqueueLinks({ 
    //                 transformRequestFunction: (request) => {
    //                     if (request.url.endsWith('.pdf')) return false; 
    //                     // Get existing path or initialize empty array
    //                     // Add current URL to path
    //                     const updatedPath = [...currentPath, request.url];
    //                     // Update request with new path
    //                     request.userData = { title: currentTitle, currentUrl: request.url, path: updatedPath };
    //                     return request;
    //                 }, 
    //                 forefront: true
    //             });

    //             if (enqueuedRequests.processedRequests.length <= 0) {
    //                 //This is an end state 
    //                 console.log("End state reached - no more requests");
    //                 console.log("Current path:", request.userData.path);
    //                 self.paths.push(request.userData.path); 
    //             }

    //             // Check if we're at max requests
    //             if (self.requestCount === 20) {
    //                 // This is an end state
    //                 console.log("End state reached - max requests");
    //                 console.log("Current path:", request.userData.path);
    //                 self.paths.push(request.userData.path);
    //                 return;
    //             }
    //         }
    //     });
    //     // Create initial request with initialized userData
    //     const initialRequest = {
    //         url: startUrl,
    //         userData: {
    //             title: '',
    //             currentUrl: startUrl,
    //             path: [startUrl]  // Initialize with start URL
    //         }
    //         };
    //     await crawler.run([initialRequest]);
    //     console.log(self.paths);
    //     console.log(self.requestCount);
    //     return this.paths;
    // }

    async crawl(startUrl: string) {
        const self = this; 
        //this.visitedUrls.add(startUrl); we might comment this back in 
        const crawler = new PlaywrightCrawler({
            maxRequestsPerCrawl: 20, 
            async requestHandler({ request, page, enqueueLinks, log }) {
                const currentUrl = request.url;
                const currentTitle = await page.title();
                log.info(`Processing: ${currentUrl}`);

                const interactions = await Promise.all([
                    page.$$eval('a', els => els.map(el => ({ text: el.textContent?.trim() || '', url: el.getAttribute('href') || '' }))),
                    page.$$eval('button', els => els.map(el => ({ text: el.textContent?.trim() || '', selector: el.getAttribute('selector') || '' }))),
                    page.$$eval('form', els => els.map(el => ({ id: el.getAttribute('id') || '', inputs: Array.from(el.querySelectorAll('input')).map(input => input.getAttribute('type') || '') })))
                ]);

                // Create current state
                const currentState: State = {
                    url: currentUrl,
                    title: currentTitle,
                    interactions: {
                        links: interactions[0],
                        buttons: interactions[1],
                        forms: interactions[2]
                    }
                };
                self.states.set(currentUrl, currentState);

                // Ask LLM if this page is part of current workflow
                const { isSameWorkflow, reason } = await self.llm.call(currentUrl, currentState);
                console.log(`\nLLM Decision for ${currentTitle}:`);
                console.log(`Same workflow? ${isSameWorkflow}`);
                console.log(`Reason: ${reason}\n`);

                if (!isSameWorkflow) {
                    // Start new workflow
                    self.currentWorkflowId = crypto.randomUUID();
                    self.workflows.set(self.currentWorkflowId, new Set([currentUrl]));
                    console.log(`Starting new workflow: ${self.currentWorkflowId}`);
                }
                else if (self.currentWorkflowId) {
                    // Add to existing workflow
                    self.workflows.get(self.currentWorkflowId)?.add(currentUrl);
                    console.log(`Added to workflow: ${self.currentWorkflowId}`);
                }

                // Print current FSA state after each page
                console.log("\n=== Current FSA State ===");
                self.printFSA();
                console.log("========================\n");

                const enqueuedRequests = await enqueueLinks({ 
                    transformRequestFunction: (request) => {
                        if (request.url.endsWith('.pdf')) return false;
                        if (self.visitedUrls.has(request.url)) return false;
                        self.transitions.push({
                            from: currentUrl,
                            to: request.url,
                            action: {
                                type: 'link',
                                context: request.url
                            }
                        });

                        self.visitedUrls.add(request.url);
                        return request;
                    },
                    forefront: true
                });   
            }
        })
        await crawler.run([startUrl]);
        return self.generatePaths(); 
    }

    generatePaths() {
        const paths: string[][] = [];
        const visited = new Set<string>();

        const dfs = (currentUrl: string, currentPath: string[]) => {
            if (visited.has(currentUrl)) return;
            visited.add(currentUrl);

            const state = this.states.get(currentUrl);
            if (!state) return;

            paths.push([...currentPath]);

            // Find all transitions from this state
            const outgoingTransitions = this.transitions.filter(t => t.from === currentUrl);
            for (const transition of outgoingTransitions) {
                dfs(transition.to, [...currentPath, transition.to]);
            }
        };

        // Start DFS from all entry points
        const startStates = Array.from(this.states.keys());
        for (const startUrl of startStates) {
            dfs(startUrl, [startUrl]);
        }

        return paths;
    }

    printFSA() {
        console.log('\nStates:');
        this.states.forEach((state, url) => {
            console.log(`\nState: ${state.title} (${url})`);
            console.log(`├─ Links: ${state.interactions.links.length}`);
            console.log(`├─ Buttons: ${state.interactions.buttons.length}`);
            console.log(`└─ Forms: ${state.interactions.forms.length}`);
        });

        console.log('\nTransitions:');
        this.transitions.forEach(t => {
            console.log(`${t.from} --[${t.action.type}: ${t.action.context}]--> ${t.to}`);
        });
    }

    generateInteractionSequences() {
        const sequences: string[] = [];
        const baseUrl = new URL(Array.from(this.states.keys())[0]).origin;
        
        this.transitions.forEach(t => {
            const fromState = this.states.get(t.from);
            const toState = this.states.get(t.to);
            
            if (fromState && toState) {
                // Skip self-references
                if (fromState.url === toState.url) return;
                
                // Clean up titles (remove common website suffix/prefix)
                const commonSuffix = fromState.title.split('|').pop()?.trim();
                const fromTitle = commonSuffix ? 
                    fromState.title.replace(`| ${commonSuffix}`, '').trim() : 
                    fromState.title;
                const toTitle = commonSuffix ? 
                    toState.title.replace(`| ${commonSuffix}`, '').trim() : 
                    toState.title;
                
                sequences.push(`${fromTitle} → ${toTitle}`);
            }
        });

        // Sort and remove duplicates
        return [...new Set(sequences)].sort();
    }

    generateWorkflowPaths() {
        const workflowPaths: Record<string, string[][]> = {};

        this.workflows.forEach((urls, workflowId) => {
            const paths: string[][] = [];
            const visited = new Set<string>();

            const dfs = (currentUrl: string, currentPath: string[]) => {
                if (visited.has(currentUrl)) return;
                if (!urls.has(currentUrl)) return;
                
                visited.add(currentUrl);
                const state = this.states.get(currentUrl);
                if (!state) return;

                paths.push([...currentPath]);

                // Only follow transitions within this workflow
                const outgoingTransitions = this.transitions
                    .filter(t => t.from === currentUrl && urls.has(t.to));

                for (const transition of outgoingTransitions) {
                    dfs(transition.to, [...currentPath, transition.to]);
                }
            };

            // Start from each URL in the workflow
            Array.from(urls).forEach(url => {
                dfs(url, [url]);
            });

            workflowPaths[workflowId] = paths;
        });

        return workflowPaths;
    }

}