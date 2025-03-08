import { Graph, DirectedGraph } from 'typescript-graph';
import { chromium, Locator } from 'playwright';

// Interfaces
export interface WebComponent {
    name: string;
    type: WebPage | InteractiveElement | InteractiveElementGeneric;
}

export interface WebPage {
    url: string;
    interactiveElements: InteractiveElementGeneric[] | InteractiveElement[];
}

export type InteractiveElement = Button | Input | Link | Select | Hover | Form | SelectableDiv;

export interface InteractiveElementGeneric {
    type: string;
    name: string;
    selector?: string;
    id?: string;
    role?: string;
    href?: string;
    inputElements?: Locator[];
    buttonElements?: Locator[];
    attributes?: any;
}

export interface Form {
    type: "form";
    name: string;
    role: string;
    selector: string;
    inputElements: Input[];
    buttonElements: Button[];
}

export interface Button {
    type: "button";
    name: string;
    role: string;
    selector: string;
    href?: string;
}

export interface SelectableDiv {
    type: "selectableDiv";
    name: string;
    role?: string;
    selector: string;
    href?: string;
}
export interface Input {
    type: "input";
    name: string;
    role: string;
    selector: string;
}

export interface Link {
    type: "link";
    name: string;
    role: string;
    selector: string;
    href: string;
}

export interface Select {
    type: "select";
    name: string;
    role: string;
    selector: string;
}

export interface Hover {
    type: "hover";
    name: string;
    role: string;
    selector: string;
    elementsExposedOnHover: InteractiveElement[];
}



//For now, the graph is expanded by clicking on buttons and links 
//However user interaction can be more complex
//TODO: Handle forms
//TODO: Handle hover and see what else needs to be handled - can use hercules? or quora?
export class Intelligence {

    private webAppGraph: DirectedGraph<WebComponent>;
    private visitedElements: Set<string>;
    private directChildren: Map<string, string[]>; // Map to store direct children


    constructor() {
        this.webAppGraph = new DirectedGraph<WebComponent>((n: WebComponent) => n.name);
        this.visitedElements = new Set();
        this.directChildren = new Map();
    }


    // async recordInteractions(url: string, timeout: number = 90000): Promise<InteractiveElementFromPlaywright[]> {
    //     const browser = await chromium.launch({ headless: false });
    //     const page = await browser.newPage();
    //     const interactiveElementsFromPlaywright: Set<InteractiveElementFromPlaywright> = new Set();
    
    //     // Login code...
    
    //     // Navigate to target page
    //     await page.goto(url);
    //     console.log('Please interact with the page. Recording will stop in', timeout/1000, 'seconds');
    
    //     // Track clicks using page.mouse
    //     await page.evaluate(() => {
    //         document.addEventListener('click', (event) => {
    //             const element = event.target as HTMLElement;
    //             console.log('Clicked:', element);
    //         }, true);
    //     });
    
    //     // Record clicked elements
    //     page.on('click' as any, async (event: any) => {
    //         try {
    //             const clickedElement = await page.evaluateHandle(() => {
    //                 return document.activeElement;
    //             });
                
    //             const element = await page.locator(':focus').first();
    //             console.log('Detected click on element', element);
    
    //             const elementInfo = {
    //                 type: await element.evaluate(el => el.tagName.toLowerCase()),
    //                 name: await element.textContent() || "Unnamed Element",
    //                 role: await element.getAttribute('role') || 'button',
    //                 selector: await this.generateSelector(element), 
    //                 href: await element.getAttribute('href') || undefined,
    //                 inputElements: await element.locator('input').all(),
    //                 buttonElements: await element.locator('button').all()
    //             };
    
    //             console.log('Element info:', elementInfo);
    //             interactiveElementsFromPlaywright.add(elementInfo);
    //         } catch (error) {
    //             console.error('Error processing click:', error);
    //         }
    //     });
    
    //     await page.waitForTimeout(timeout);
    //     console.log(`Recording complete. Found ${interactiveElementsFromPlaywright.size} elements`);
        
    //     await browser.close();
    //     return Array.from(interactiveElementsFromPlaywright);
    // }

    // async generateSelector(element: Locator): Promise<string> {
    //     return await element.evaluate((el: Element) => {
    //         // Get element type and classes
    //         const tag = el.tagName.toLowerCase();
    //         const classes = Array.from(el.classList).join('.');
            
    //         // Get any important attributes
    //         const id = el.id ? `#${el.id}` : '';
    //         const type = el.getAttribute('type') ? `[type="${el.getAttribute('type')}"]` : '';
    //         const role = el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : '';
            
    //         // Combine into selector
    //         return `${tag}${id}${classes ? `.${classes}` : ''}${type}${role}`;
    //     });
    // }
    
    //Original method - alternative to DOM Tree 

    // async extractInteractiveElements(url: string): Promise<InteractiveElement[]> {
    //     const browser = await chromium.launch({ headless: true });
    //     const page = await browser.newPage();
    //     const interactiveElements: InteractiveElement[] = [];

    //     // Extract buttons
    //     const buttons = await page.locator("button").all();
    //     for (const button of buttons) {
    //         interactiveElements.push({
    //             type: "button",
    //             name: (await button.textContent())?.trim() || "Unnamed Button", //but unnamed buttons will not be added as edges - handling to be refined 
    //             role: "button",
    //             selector: await this.generateSelector(button),
    //             href: await button.getAttribute("href") || undefined
    //         });
    //     }

    //     const selectableDivs = await page.locator('div[class*="cursor-pointer"]').all();
    //     for (const div of selectableDivs) {
    //         interactiveElements.push({
    //             type: "selectableDiv",
    //             name: (await div.textContent())?.trim() || "Unnamed Div",
    //             selector: await this.generateSelector(div),
    //             href: await div.getAttribute("href") || undefined
    //         });
    //     }

    //     // Extract links
    //     const links = await page.locator("a").all();
    //     for (const link of links) {
    //         interactiveElements.push({
    //             type: "link",
    //             name: (await link.textContent())?.trim() || "Unnamed Link",
    //             role: "link",
    //             selector: await this.generateSelector(link),
    //             href: await link.getAttribute("href") || "#"
    //         });
    //     }

    //     // Extract input fields
    //     const inputs = await page.locator("input").all();
    //     for (const input of inputs) {
    //         interactiveElements.push({
    //             type: "input",
    //             name: (await input.getAttribute("placeholder")) || "Unnamed Input",
    //             role: "textbox",
    //             selector: await this.generateSelector(input)
    //         });
    //     }

    //     // Extract select dropdowns
    //     const selects = await page.locator("select").all();
    //     for (const select of selects) {
    //         interactiveElements.push({
    //             type: "select",
    //             name: (await select.getAttribute("name")) || "Unnamed Select",
    //             role: "combobox",
    //             selector: await this.generateSelector(select)
    //         });
    //     }

    //     await browser.close();
    //     return interactiveElements;
    // }

    //New method - exploring DOM tree 
    isInteractiveElement(nodeName: string): boolean {
        return ['button', 'a', 'input', 'select', 'textarea', 'label', 'form'].includes(nodeName.toLowerCase());
    }

    async extractInteractiveElements(url: string): Promise<InteractiveElementGeneric[]> {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(url);
    
        // Start CDP session
        const client = await page.context().newCDPSession(page);
        
        // Get the root DOM node
        const { root } = await client.send('DOM.getDocument');
        const interactiveElements: InteractiveElementGeneric[] = [];
    
        // Function to check if an element is interactive (button, a, form, etc.)
        const isInteractiveElement = (nodeName: string) => {
            return ['button', 'a', 'input', 'select', 'textarea', 'label', 'form'].includes(nodeName.toLowerCase());
        };
    
        // Helper function to recursively find the closest interactive child element
        const findChildInteractive = async (node: any): Promise<any> => {
            if (!node.children) return null;
    
            for (const child of node.children) {
                if (isInteractiveElement(child.nodeName)) {
                    return child;
                }
                const foundChild = await findChildInteractive(child);
                if (foundChild) {
                    return foundChild;
                }
            }
            return null; // Return null if no interactive child is found
        };
    
        const processNode = async (nodeId: number, backendNodeId?: number) => {
            try {
                console.log("Processing node: ", nodeId);
                // Use either nodeId or backendNodeId for describing the node
                const describeParams = nodeId > 0 
                    ? { nodeId , depth: 1 }
                    : { backendNodeId, depth: 1 };
                // Get the node details
                console.log("Describing node: ", describeParams);
                const { node } = await client.send('DOM.describeNode', describeParams);

                const resolveParams = nodeId > 0 
                ? { nodeId }
                : { backendNodeId: node.backendNodeId };

                console.log("Node: ", node);
    
                // Handle all types of nodes (element nodes, document nodes, etc.)
                const { object } = await client.send('DOM.resolveNode', resolveParams);
    
                if (object?.objectId) {
                    const events = await client.send('DOMDebugger.getEventListeners', {
                        objectId: object.objectId
                    });
    
                    // If event listeners are found, check if the element is interactive
                    if (events.listeners.length > 0) {
                        console.log(`Event Found: ${events.listeners.map((l: any) => l.type).join(', ')}`);
    
                        // Look for a specific interactive child (e.g., button, link, etc.)
                        console.log("Node: ", node);
                        let foundInteractive = await findChildInteractive(node);
    
                        // If no specific child is found, keep the current element
                        if (!foundInteractive) {
                            foundInteractive = node;
                        }
                        const processAttributes = (attributes: string[] | undefined) => {
                            if (!attributes || !Array.isArray(attributes)) return {};
                            
                            const result: { [key: string]: string } = {};
                            for (let i = 0; i < attributes.length; i += 2) {
                                if (i + 1 < attributes.length) {  // ensure we have a value
                                    result[attributes[i]] = attributes[i + 1];
                                }
                            }
                            return result;
                        };

                        const attrs = processAttributes(foundInteractive.attributes);
    
                        const selector = `#${foundInteractive.nodeId}-${foundInteractive.backendNodeId}`;  // Use nodeId to generate a unique selector
    
                        interactiveElements.push({
                            type: foundInteractive.nodeName.toLowerCase(),
                            name: foundInteractive.nodeValue || foundInteractive.localName || 'Unnamed Element',
                            id: attrs.id,
                            selector: selector,
                            href: attrs.href,
                            role: attrs.role,
                            attributes: attrs,
                            inputElements: [],  // These can be populated later as needed - add processing for forms
                            buttonElements: [], // These can be populated later as needed - add processing for forms
                        });
                    }
                }
    
                // Process children, requesting nodeIds when needed
                if (node.children && Array.isArray(node.children)) {
                    const childPromises = node.children.map(async (child) => {
                        // If we have a nodeId, use it directly
                        if (child.nodeId && child.nodeId > 0) {
                            return processNode(child.nodeId, child.backendNodeId);
                        }
                        // If we only have backendNodeId, use that
                        else if (child.backendNodeId) {
                            try {
                                return processNode(0, child.backendNodeId); // Pass backendNodeId as second parameter
                            } catch (error) {
                                console.error(`Failed to process backendNodeId ${child.backendNodeId}:`, error);
                            }
                        }
                    });

                    await Promise.all(childPromises);
                }
    
            } catch (error) {
                console.error('Error processing node: ', nodeId, error);
            }
        };
    
        // Start processing from the root node
        await processNode(root.nodeId);
        await browser.close();

        if (interactiveElements.length > 0) {
            console.log("Interactive Elements for url: ", url, interactiveElements);
        }
        else {
            console.log("No interactive elements found for url: ", url);
        }
        return interactiveElements;
    }
    

    async expandTree(url: string, currentPath: Set<string> = new Set()) {
        if (currentPath.has(url)) {
            return; 
        }

        currentPath.add(url); 
        console.log(`Visiting ${url}`);

        const interactiveElements = await this.extractInteractiveElements(url);
        const currentPage: WebPage = { url, interactiveElements };

        const webComponent: WebComponent = {
            name: currentPage.url,
            type: currentPage
        };
        
        if (!this.webAppGraph.getNode(webComponent.name)) {
            this.webAppGraph.insert(webComponent);
        }
        else {

        }

        const baseUrl = new URL(url); 
        const baseDomain = baseUrl.hostname; 

        for (const element of interactiveElements) {

            const elementId = `${element.id}`;
            if (this.visitedElements.has(elementId)) continue;
            this.visitedElements.add(elementId);

            const elementComponent: WebComponent = {
                name: elementId,
                type: element
            };

            if (!this.webAppGraph.getNode(elementComponent.name)) {
                this.webAppGraph.insert(elementComponent);
            }
            this.addEdgeWithTracking(webComponent.name, elementComponent.name);

            // Check if element has href property and it's not undefined
            if ('href' in element && element.href) {
                const nextUrl = this.getNavigationUrl(element.href, baseUrl);
                if (nextUrl) {
                    try {
                        const linkDomain = new URL(nextUrl).hostname;
                        if (linkDomain === baseDomain && !currentPath.has(nextUrl)) {
                            await this.expandTree(nextUrl, currentPath);
                        }
                    }
                    catch (error) {
                        console.error(`Error parsing link URL: ${element.href}`, error);
                    }
                }
            }
        };

        currentPath.delete(url);
    }

    //This method will add edges and track direct children
    async addEdgeWithTracking(from: string, to: string): Promise<void> {
        // Get or create the entry for the "from" node in the directChildren map
        if (!this.directChildren.has(from)) {
            this.directChildren.set(from, []);    
        }

        try {
            const children = await this.getChildren(from);
            if (!children.includes(to)) {
                this.webAppGraph.addEdge(from, to);
                this.directChildren.get(from)!.push(to);
                console.log(`Added edge from '${from}' to '${to}'`);
            }
        }
        catch (error) {
            console.error(`Error adding edge from '${from}' to '${to}':`, error);
        }
    }

    // // Find all unique paths from startNode to endNode using DFS
    // async findAllPaths(startNode: string, endNode: string): Promise<string[][]> {
    //     const allPaths: string[][] = [];
    //     const visited: Set<string> = new Set();
    //     await this.dfs(startNode, endNode, visited, [], allPaths);
    //     return allPaths;
    // }

    // Modified DFS to find all paths in the entire graph
    async findAllPathsInGraph(): Promise<string[][]> {
        const allPaths: string[][] = [];
        
        // Start DFS from each node in the graph
        const allNodes = this.webAppGraph.getNodes(); // Get all nodes in the graph
        for (const node of allNodes) {
            await this.dfs(node.name, new Set(), [], allPaths);
        }
        return allPaths;
    }

    // Depth-First Search (DFS) to explore all paths
    async dfs(currentNode: string, visited: Set<string>, path: string[], allPaths: string[][]): Promise<void> {

        // Add current node to the path
        path.push(currentNode);
        visited.add(currentNode); //mark this node as visited

        const children = await this.getChildren(currentNode);
        if (children.length === 0 && path.length > 1) {
            allPaths.push([...path]);
        }
        else {
            for (const child of children) {
                if (!visited.has(child)) {
                    await this.dfs(child, visited, path, allPaths); // Recursively explore each child
                }
            }
        }

        // Backtrack: remove the current node from the path and visited set
        path.pop();
        visited.delete(currentNode);
    }

    async getChildren(nodeName: string) {
        return this.directChildren.get(nodeName) || [];
    }

    private getNavigationUrl(href: string, baseUrl: URL): string | null {
        try {
            // Remove query parameters if they cause issues
            const cleanHref = href.split('?')[0];
            
            // Handle relative URLs
            if (cleanHref.startsWith('/')) {
                return baseUrl.origin + cleanHref;
            }
            
            // Handle absolute URLs
            if (cleanHref.startsWith('http')) {
                return cleanHref;
            }

            return null;
        } catch (error) {
            console.error(`Error processing URL: ${href}`, error);
            return null;
        }
    }
}
