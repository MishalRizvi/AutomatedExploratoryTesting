import { Graph, DirectedGraph } from 'typescript-graph';
import { CDPSession, chromium, Locator, Page } from 'playwright';
import cssEscape from 'css.escape';  

// Interfaces
export interface WebComponent {
    name: string;
    type: WebPage | InteractiveElementGeneric;
}

export interface WebPage {
    url: string;
    interactiveElements: InteractiveElementGeneric[];
}

// Type definitions
export interface DOMNode {
    nodeId: number;
    backendNodeId: number;
    nodeName: string;
    nodeType: number;
    attributes?: string[];
    children?: DOMNode[];
    nodeValue?: string;
    localName?: string;
}

export interface InteractiveElementGeneric {
    type: string;
    name: string;
    selector?: string;
    id?: string;
    role?: string;
    href?: string;
    inputElements?: any[]; //locator[]
    buttonElements?: any[];
    attributes?: any;
    triggerElement?: any;
    relationships?: any;
    chain?: Array<{type: string, selector: string, attributes: any}>;
    formInfo?: any;
    isExternal?: boolean;
    target?: string;
    events?: string[];
}


//For now, the graph is expanded by clicking on buttons and links 
//However user interaction can be more complex
//TODO: Handle forms
//TODO: Handle hover and see what else needs to be handled - can use hercules? or quora?
export class Intelligence {

    private webAppGraph: DirectedGraph<WebComponent>;
    private visitedElements: Set<string>;
    private directChildren: Map<string, string[]>; // Map to store direct children
    private errorInteractingWithElements: InteractiveElementGeneric[];
    private readonly SKIP_KEYWORDS = [
        'login', 'signin', 'sign-in', 'signup', 'sign-up', 'register',
        'authentication', 'auth', 'password', 'account'
    ];
    
    constructor() {
        this.webAppGraph = new DirectedGraph<WebComponent>((n: WebComponent) => n.name);
        this.visitedElements = new Set();
        this.directChildren = new Map();
        this.errorInteractingWithElements = [];
    }

    private shouldSkipUrl(url: string): boolean {
        const skipKeywords = new Set([
            'login', 'signin', 'sign-in', 'signup', 'sign-up', 'register',
            'authentication', 'auth', 'password', 'account'
        ]);
    
        try {
            // Handle relative URLs by checking the path directly
            const path = url.startsWith('http') ? new URL(url).pathname : url;
            
            // Get the last segment of the path
            const lastSegment = path.split('/').filter(Boolean).pop()?.toLowerCase() || '';
        
            const shouldSkip = skipKeywords.has(lastSegment);
            if (shouldSkip) {
                console.log('⚠️ Skipping auth page:', lastSegment);
            }
            return shouldSkip;
        } catch (error) {
            console.warn('Invalid URL:', url);
            return false;
        }
    }

    private shouldSkipElement(element: InteractiveElementGeneric): boolean {
        // Check element text, href, id, and other attributes
        const elementText = element.name?.toLowerCase() || '';
        const elementHref = element.href?.toLowerCase() || '';
        const elementId = element.id?.toLowerCase() || '';
        
        return this.SKIP_KEYWORDS.some(keyword => 
            elementText.includes(keyword) || 
            elementHref.includes(keyword) || 
            elementId.includes(keyword)
        );
    }
    
    isInteractiveElement(nodeName: string, attributes?: any): boolean {
        const nodeLower = nodeName.toLowerCase();
        
        // Always interactive elements
        if (['button', 'a', 'input', 'select', 'textarea', 'form', 'fieldset', 'option', 'menuitem'].includes(nodeLower)) {
            return true;
        }

        // For divs, check if they have cursor-pointer class
        if (nodeLower === 'div' && attributes?.class) {
            return attributes.class.includes('cursor-pointer') || attributes.class.includes('!cursor-pointer');
        }

        return false;
    }

    private escapeSelector(str: string): string {
        return str.replace(/[ "!#$%&'()*+,./:<=>?@[\\\]^`{|}~]/g, '\\$&');    
    }

    async extractInteractiveElements(url: string): Promise<InteractiveElementGeneric[]> {
        console.log('\n=== Starting Interactive Elements Extraction ===');
        console.log(`URL: ${url}`);
        
        let browser;
        try {
            browser = await this.setupBrowser(url);
            const { page, client, root } = browser;
            const interactiveElements = await this.processDocument(page, client, root);
            
            console.log(`\n✅ Extraction complete. Found ${interactiveElements.length} interactive elements`);
            return interactiveElements;
        } 
        catch (error) {
            console.error('❌ Fatal error in extractInteractiveElements:', error);
            throw error;
        }
        finally {
            if (browser?.browser) {
                await browser.browser.close();
                console.log('Browser closed');
            }
        }
    }
    
    private async setupBrowser(url: string) {
        console.log('\n🌐 Setting up browser...');
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        console.log('Navigating to page...');
        await page.goto(url);
        
        console.log('Setting up CDP session...');
        const client = await page.context().newCDPSession(page);
        const { root } = await client.send('DOM.getDocument');
        
        console.log('✅ Browser setup complete');
        return { browser, page, client, root };
    }

    private async processDocument(page: Page, client: CDPSession, root: DOMNode): Promise<InteractiveElementGeneric[]> {
        console.log('\n🔍 Starting document processing...');
        const interactiveElements: InteractiveElementGeneric[] = [];
    
        const processNode = async (node: DOMNode): Promise<boolean> => {
            try {
                // Ensure we have either nodeId or backendNodeId
                if (!node.nodeId && !node.backendNodeId) {
                    console.log('⚠️ Node missing both nodeId and backendNodeId, skipping');
                    return false;
                }
                const nodeDetails = await this.getNodeDetails(client, node.nodeId, node.backendNodeId);
                if (!nodeDetails) {
                    console.log('⚠️ Node details not found, skipping');
                    return false;
                }

                const nodeName = nodeDetails.nodeName.toLowerCase();
                if (this.shouldSkipNode(nodeName)) {
                    console.log(`Skipping non-interactive node: ${nodeName}`);
                    return false;
                }

                console.log(`\nChecking node: ${nodeDetails.nodeName} (Node ID: ${nodeDetails.nodeId}, Backend Node ID: ${nodeDetails.backendNodeId})`);

                // Process children first
                let childHasListeners = false;
                console.log(`Processing children of ${nodeDetails.nodeName}`);
                console.log(`Children: ${nodeDetails.children?.map(c => c.backendNodeId).join(', ')}`);
                
                if (nodeDetails.children) {
                    for (const child of nodeDetails.children) {
                        const hasListeners = await processNode(child);
                        if (hasListeners) {
                            childHasListeners = true;
                        }
                    }
                }

                // If a child has listeners, skip processing this node
                if (childHasListeners) {
                    console.log('⚠️ Skipping parent node as child has listeners:', {
                        parent: nodeDetails.nodeName
                    });
                    return true;
                }

                // Get this node's listeners
                const listeners = await this.getNodeEventListeners(client, nodeDetails);
                
                if (listeners.length > 0 && this.isInteractiveElement(nodeName)) {
                    console.log(`✨ Found interactive ${nodeName} with ${listeners.length} listeners`);
                    const element = await this.createInteractiveElement(nodeDetails, listeners, page);
                    if (element) {
                        element.events = listeners.map(l => l.type);
                        interactiveElements.push(element);
                        console.log(`Added element with selector: ${element.selector}, events: ${element.events.join(', ')}`);
                        return true;
                    }
                }

                return false;
            } catch (error) {
                console.error(`Error processing node ${node.nodeName}:`, error);
                return false;
            }
        };
    
        await processNode(root);
        console.log(`\n🎯 Found ${interactiveElements.length} interactive elements`);
        return interactiveElements;
    }

    private async getNodeEventListeners(client: CDPSession, node: DOMNode): Promise<any[]> {
        try {
            const resolveParams = node.nodeId > 0 ? { nodeId: node.nodeId } : { backendNodeId: node.backendNodeId };
            const { object } = await client.send('DOM.resolveNode', resolveParams);
            
            if (!object?.objectId) return [];
    
            const { listeners } = await client.send('DOMDebugger.getEventListeners', {
                objectId: object.objectId
            });
    
            // Priority order of events that drive user flows
            const eventPriority = [
                'click',        // Highest priority - most common interaction
                'submit',       // Form submissions
                'change',       // Select/dropdown changes
                'input',        // Text input
                'mousedown',    // Lower priority mouse events
                'mouseup',
                'touchstart',
                'touchend',
                'keydown',      // Lowest priority keyboard events
                'keyup',
                'keypress'
            ];
    
            // Filter for supported events and sort by priority
            const supportedListeners = listeners.filter(l => eventPriority.includes(l.type));
            
            if (supportedListeners.length === 0) return [];
    
            // Sort listeners by priority and return only the highest priority one
            supportedListeners.sort((a, b) => 
                eventPriority.indexOf(a.type) - eventPriority.indexOf(b.type)
            );
    
            const primaryListener = supportedListeners[0];
            console.log(`Selected primary listener: ${primaryListener.type} for ${node.nodeName}`);
            
            return [primaryListener];
        } 
        catch (error) {
            console.log('No event listeners found');
            return [];
        }
    }


    private async getNodeDetails(client: CDPSession, nodeId: number, backendNodeId?: number): Promise<DOMNode | null> {
        try {
            const describeParams = nodeId > 0 ? { nodeId, depth: -1 } : { backendNodeId, depth: -1 };
            const { node } = await client.send('DOM.describeNode', describeParams);
            return node;
        } 
        catch (error) {
            console.error('Error getting node details:', error);
            return null;
        }
    }
    
    private shouldSkipNode(nodeName: string): boolean {
        //Add as needed
        return ['script', 'style', 'link', 'meta', 'img', 'path', 'svg', 'noscript', 'video', 'audio'].includes(nodeName);
    }
    

    
    private generateElementId(element: DOMNode, attrs: any): string {
        console.log('\n🏷️ Generating element ID');
        console.log('Element:', {
            nodeName: element.nodeName,
            nodeId: element.nodeId,
            attributes: attrs
        });
    
        const idParts = [
            attrs.id,
            attrs.name,
            attrs.class,
            `${element.nodeName.toLowerCase()}-${attrs.type || ''}-${attrs.placeholder || ''}`
        ].filter(Boolean);
    
        const stableId = idParts.join('-');
        console.log('Generated ID:', stableId);
        return stableId;
    }
    
    // private async generateSelector(element: DOMNode, attrs: any, page: Page): Promise<string | null> {
    //     console.log('\n🎯 Attempting to generate valid selector (Chrome Recorder style)');
    
    //     // Selector attempts ordered by Chrome Recorder's preferences
    //     const selectorAttempts = [
    //         // 1. aria selectors (Chrome Recorder's top preference)
    //         () => attrs.role && attrs['aria-label'] ? 
    //             `aria/${attrs['aria-label']}[role="${attrs.role}"]` : null,
    
    //         // 2. role-based aria
    //         () => attrs.role ? `[role="${attrs.role}"]` : null,
    
    //         // 3. text-based selectors
    //         () => element.nodeValue?.trim() ? 
    //             `text=${element.nodeValue.trim()}` : null,
    
    //         // 4. data-testid
    //         () => attrs['data-testid'] ? 
    //             `[data-testid="${attrs['data-testid']}"]` : null,
    
    //         // // 5. CSS selectors with tag and class
    //         // () => attrs.class ? 
    //         //     `${element.nodeName.toLowerCase()}.${attrs.class.split(' ').map(c => this.escapeSelector(c)).join('.')}` : null,

    //             // 5. Direct class-based selector (Playwright style)
    //         () => {
    //             if (!attrs.class) return null;
    //             const selector = `${element.nodeName.toLowerCase()}.${attrs.class
    //                 .split(' ')
    //                 .map(c => cssEscape(c))
    //                 .join('.')}`;
    //             console.log('Generated Playwright selector:', selector);
    //             return selector;
    //         },

    //         // 5. Class-based selectors with text content
    //         () => {
    //             if (!attrs.class) return null;
    //             const classNames = attrs.class.split(' ')
    //                 .map((c: string) => cssEscape(c)) // Use cssEscape instead of JSON.stringify
    //                 .join('.');
    //             const baseSelector = `${element.nodeName.toLowerCase()}.${classNames}`;
                
    //             // If element has text content, use it to make selector unique
    //             if (element.nodeValue?.trim()) {
    //                 return `${baseSelector}:has-text("${element.nodeValue.trim()}")`;
    //             }
                
    //             // If element has children with text, use that
    //             return `${baseSelector}:has(text="${attrs['aria-label'] || ''}")`;
    //         },

    //         // 6. Class-based with nth-child (using actual index)
    //         async () => {
    //             if (!attrs.class) return null;
    //             const classNames = attrs.class.split(' ')
    //                 .map((c: string) => cssEscape(c)) // Use cssEscape instead of JSON.stringify
    //                 .join('.');
    //             const baseSelector = `${element.nodeName.toLowerCase()}.${classNames}`;
                
    //             // Find the actual index of this element
    //             const elements = await page.$$(baseSelector);
    //             if (elements.length > 1) {
    //                 for (let i = 0; i < elements.length; i++) {
    //                     const elementHandle = elements[i];
    //                     const backendNodeId = await elementHandle.evaluate(el => 
    //                         (el as any)._backendNodeId || (el as any).getNodeId());
                        
    //                     if (backendNodeId === element.backendNodeId) {
    //                         return `${baseSelector}:nth-match(${i + 1})`;
    //                     }
    //                 }
    //             }
                
    //             return baseSelector;
    //         },
    
    //         // 7. id-based
    //         () => attrs.id ? `#${this.escapeSelector(attrs.id)}` : null,
    
    //         // 8. xpath as last resort
    //         () => `xpath=//html/body//${element.nodeName.toLowerCase()}[${element.nodeId || 1}]`
    //     ];
    
    //     // Try each strategy until we find a valid selector
    //     for (const attempt of selectorAttempts) {
    //         const selector = await attempt();
    //         if (selector) {
    //             const validSelector = await this.validateSelector(selector, page);
    //             if (validSelector) {
    //                 console.log(`✅ Found valid selector: ${validSelector}`);
    //                 return validSelector;
    //             }
    //         }
    //     }
    
    //     console.log('❌ No valid selector found');
    //     return null;
    // }

    private async generateSelector(element: DOMNode, attrs: any, page: Page): Promise<string | null> {
        try {
            // First get all Playwright's selectors with element properties
            const allSelectors = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('*'))
                    .filter(el => !['script', 'style', 'link', 'meta'].includes(el.tagName.toLowerCase()))
                    .map(el => ({
                        selector: `${el.tagName.toLowerCase()}${
                            typeof el.className === 'string' 
                            ? '.' + el.className.replace(/ /g, '.')
                            : (el.className as SVGAnimatedString)?.baseVal 
                                ? '.' + (el.className as SVGAnimatedString).baseVal.replace(/ /g, '.')
                                : ''
                        }`,
                        tag: el.tagName.toLowerCase(),
                        classes: typeof el.className === 'string' ? el.className : (el.className as SVGAnimatedString)?.baseVal || '',
                        role: el.getAttribute('role'),
                        ariaLabel: el.getAttribute('aria-label'),
                        id: el.id
                    }));
            });
            // Find matching element
            const match = allSelectors.find(s => {
                const ourSelector = `${element.nodeName.toLowerCase()}.${attrs.class.replace(/ /g, '.')}`;
                console.log('Our selector:', ourSelector);
                console.log('Playwright selector:', s.selector);
                return s.tag === element.nodeName.toLowerCase() &&
                    s.classes === attrs.class;
            });

            // if (match) {
            //     console.log('Found matching selector:', match.selector);
            //     return await this.validateSelector(match.selector, page);
            // }
            console.log("match", match);
            if (match) {
                console.log('Found matching selector:', match.selector);
                return match.selector;
            }

            return null;

        } 
        catch (error) {
            console.log('Error finding selector:', error);
            return null;
        }
    }


    
    private async validateSelector(selector: string, page: Page): Promise<string | null> {
        try {
            // Use Locator instead of page.$
            const locator = page.locator(selector);
            
            // Check if element exists and is visible
            const count = await locator.count();
            if (count === 0) {
                console.log(`Element not found: ${selector}`);
                return null;
            }
            
            const isVisible = await locator.first().isVisible();
            if (!isVisible) {
                console.log(`Element not visible: ${selector}`);
                return null;
            }
            
            // Check if selector is unique
            if (count > 1) {
                console.log(`Selector not unique: ${selector} (${count} matches)`);
                return null;
            }
            
            return selector;
        } catch (error) {
            console.log(`Error validating selector: ${selector}`, error);
            return null;
        }
    }

    private processAttributes(attributes: string[] | undefined): { [key: string]: string } {
        console.log('\n📝 Processing attributes');
        console.log('Raw attributes:', attributes);
    
        if (!attributes || !Array.isArray(attributes)) {
            console.log('No attributes to process');
            return {};
        }
    
        const result: { [key: string]: string } = {};
        for (let i = 0; i < attributes.length; i += 2) {
            if (i + 1 < attributes.length) {
                const key = attributes[i];
                const value = attributes[i + 1];
                result[key] = value;
                console.log(`Processed attribute: ${key} = ${value}`);
            }
        }
    
        console.log('Final processed attributes:', result);
        return result;
    }

    private createLinkElement(element: DOMNode, attrs: any, elementId: string, selector: string) {
        console.log('\n🔗 Creating link element');
        console.log('Element details:', {
            nodeName: element.nodeName,
            href: attrs.href,
            id: elementId,
            selector: selector
        });

        const linkElement: InteractiveElementGeneric = {
            type: 'link',
            name: element.nodeValue || attrs.href,
            id: elementId,
            selector: selector,
            href: attrs.href,
            role: attrs.role,
            attributes: attrs,
            isExternal: attrs.href.startsWith('http') || attrs.href.startsWith('//'),
            target: attrs.target || '_self'
        };

        console.log('Created link element:', linkElement);
        return linkElement;
    }
    
    private async createInteractiveElement(node: DOMNode, listeners: any[], page: Page): Promise<InteractiveElementGeneric | null> {
        console.log('\n🔨 Creating interactive element...');
        
        const attrs = this.processAttributes(node.attributes);
        const primaryListener = listeners[0];
        const elementId = this.generateElementId(node, attrs);
        const validSelector = await this.generateSelector(node, attrs, page);
    
        if (!validSelector) {
            console.log('❌ No valid selector found for element');
            return null;
        }
    
        console.log('Element details:', {
            type: node.nodeName,
            id: elementId,
            selector: validSelector,
            listeners: listeners.map(l => l.type)
        });
    
        if (node.nodeName.toLowerCase() === 'a' && attrs.href) {
            return this.createLinkElement(node, attrs, elementId, validSelector);
        }
        
        return {
            type: node.nodeName.toLowerCase(),
            name: node.nodeValue || node.localName || 'Unnamed Element',
            id: elementId,
            selector: validSelector,
            role: attrs.role,
            attributes: attrs
        };
    }
        

    async expandTree(url: string, page?: Page, interactiveElement?: InteractiveElementGeneric, currentPath: Set<string> = new Set()) {
        console.log('\n=== EXPAND TREE START ===');
        console.log(`URL: ${url}`);

        if (this.shouldSkipUrl(url)) {
            console.log('⚠️ Skipping authentication-related URL:', url);
            return;
        }

        console.log(`Interactive Element: ${interactiveElement?.id || 'none'}`);
        console.log(`Current Path Size: ${currentPath.size}`);
        console.log(`Current Path Contents: ${Array.from(currentPath).join(', ')}`);
        // Only check currentPath for new URL navigation, not for interactions

        // Check for cycle
        if (!interactiveElement && currentPath.has(url)) {
            console.log('⚠️ Cycle detected! URL already in current path. Returning.');
            return;
        }    

        let shouldClosePage = false;
        if (!page) {
            console.log('Creating new browser page...');
            const browser = await chromium.launch({ headless: true });
            page = await browser.newPage();
            try {
                console.log(`Navigating to ${url}...`);
                await page.goto(url);
                shouldClosePage = true;
                console.log('Navigation successful');
            } 
            catch (error) {
                console.error('❌ Navigation failed:', error);
                await browser.close();
                throw error;
            }
        }
    
        try {
            if (interactiveElement) {
                console.log('\n🔄 Processing Interactive Element:');
                if (this.shouldSkipElement(interactiveElement)) {
                    console.log('⚠️ Skipping authentication-related element:', interactiveElement.id);
                    return;
                }
                console.log(`Type: ${interactiveElement.type}`);
                console.log(`ID: ${interactiveElement.id}`);
                console.log(`Selector: ${interactiveElement.selector}`);
                // Handle interactive element
                try {
                    // Perform the interaction
                    console.log('Attempting interaction...');
                    await this.performFullInteraction(page, interactiveElement);
                    
                    // Get new URL or state after interaction
                    const newUrl = page.url();
                    console.log(`URL after interaction: ${newUrl}`);

                    
                    if (newUrl !== url) {
                        // If interaction led to new URL, expand that tree
                        console.log('🌐 URL changed after interaction, expanding new URL tree');
                        await this.expandTree(newUrl, page, undefined, currentPath);
                    } 
                    else {
                        // Get fresh elements after interaction
                        console.log('Extracting new elements after interaction...');
                        const newElements = await this.extractInteractiveElements(url);
                        console.log(`Found ${newElements.length} new elements`);

                        for (const element of newElements) {
                            const elementId = `${element.id}`;
                            console.log(`\nProcessing new element: ${elementId}`);

                            if (!this.visitedElements.has(elementId)) {
                                console.log('Element not visited before, processing...');
                                const elementComponent: WebComponent = {
                                    name: element.name,
                                    type: element
                                };
    
                                if (!this.webAppGraph.getNode(elementComponent.name)) {
                                    console.log('Adding new node to graph');
                                    this.webAppGraph.insert(elementComponent);
                                    this.addEdgeWithTracking(interactiveElement.name, element.name);
                                }
                                
                                await this.expandTree(url, page, element, currentPath);
                            }
                            else {
                                console.log('Element already visited, skipping');
                            }
                        }
                    }
                } 
                catch (error) {
                    console.error(`Error interacting with element: ${interactiveElement.selector}`, error);
                    this.errorInteractingWithElements.push(interactiveElement);
                }
            } 
            else {
                // Handle new URL navigation
                console.log('\n🌐 Processing New URL:');
                currentPath.add(url);
                
                console.log('Extracting interactive elements...');
                const interactiveElements = await this.extractInteractiveElements(url);
                console.log(`Found ${interactiveElements.length} interactive elements`);

                // Filter out login/signup elements
                const filteredElements = interactiveElements.filter(element => !this.shouldSkipElement(element));
                console.log(`Filtered to ${filteredElements.length} non-auth elements`);

                const currentPage: WebPage = { url, interactiveElements };
                const rootComponent: WebComponent = {
                    name: url,
                    type: currentPage
                };
    
                if (!this.webAppGraph.getNode(rootComponent.name)) {
                    console.log('Adding new page to graph');
                    this.webAppGraph.insert(rootComponent);
                }
    
                // Process all interactive elements
                for (const element of interactiveElements) {
                    const elementId = `${element.id}`;
                    console.log(`\nProcessing element: ${elementId}`);

                    if (this.visitedElements.has(elementId)) {
                        console.log('Element already visited, skipping');
                        continue;
                    }

                    console.log('Marking element as visited');
                    this.visitedElements.add(elementId);
    
                    const elementComponent: WebComponent = {
                        name: element.name,
                        type: element
                    };
    
                    if (!this.webAppGraph.getNode(elementComponent.name)) {
                        console.log('Adding element node to graph');
                        this.webAppGraph.insert(elementComponent);
                        this.addEdgeWithTracking(rootComponent.name, elementComponent.name);
                    }
    
                    if ('href' in element && element.href) {
                        console.log(`Processing href: ${element.href}`);
                        const nextUrl = this.getNavigationUrl(element.href, new URL(url));
                        if (nextUrl) {
                            console.log(`Valid navigation URL found: ${nextUrl}`);
                            await this.expandTree(nextUrl, undefined, undefined, currentPath);
                        }
                    } 
                    else {
                        console.log('Processing non-href element recursively');
                        await this.expandTree(url, page, element, currentPath);
                    }
                }
                
                console.log(`Removing ${url} from current path`);
                currentPath.delete(url);
            }
        } 
        catch (error) {
            console.error(`Error in expandTree: ${error}`);
            throw error;
        }
        finally {
            if (shouldClosePage && page) {
                await page.context().browser()?.close();
            }
            console.log('=== EXPAND TREE END ===\n');
        }
    }

    // // Helper method to perform full interaction chain - COME BACK IF NEEDED 
    // private async performFullInteraction(page: Page, element: InteractiveElementGeneric) {
    //     switch(element.type) {
    //         case 'interaction-chain':
    //             // Click the trigger element
    //             await page.click(element.triggerElement.selector || element.triggerElement.id);
    //             await page.waitForLoadState('networkidle');
    
    //             // Wait for and handle dynamic content based on relationships
    //             if (element.relationships?.controlsId) {
    //                 await page.waitForSelector(`#${element.relationships.controlsId}`);
    //                 // Interact with controlled element if needed
    //             }
    
    //             if (element.relationships?.ownsId) {
    //                 await page.waitForSelector(`#${element.relationships.ownsId}`);
    //                 // Interact with owned element if needed
    //             }
    
    //             if (element.relationships?.expectedRole) {
    //                 await page.waitForSelector(`[role="${element.relationships.expectedRole}"]`);
    //                 // Handle specific roles
    //                 switch (element.relationships.expectedRole) {
    //                     case 'listbox':
    //                         const options = await page.$$('[role="option"]');
    //                         if (options.length > 0) {
    //                             await options[0].click();
    //                         }
    //                         break;
    //                     case 'menu':
    //                         const menuItems = await page.$$('[role="menuitem"]');
    //                         if (menuItems.length > 0) {
    //                             await menuItems[0].click();
    //                         }
    //                         break;
    //                     case 'dialog':
    //                         // Handle dialog content
    //                         break;
    //                 }
    //             }
    //             break;
    
    //         case 'button':
    //         case 'link':
    //             await page.click(element.selector || '');
    //             await page.waitForLoadState('networkidle');
    //             break;
                
    //         case 'form':
    //             // Fill all inputs
    //             for (const input of element.inputElements || []) {
    //                 await page.fill(input.selector, 'test');
    //             }
    //             // Click submit button
    //             if (element.buttonElements && element.buttonElements.length > 0) {
    //                 await page.click(element.buttonElements[0].selector);
    //             }
    //             await page.waitForLoadState('networkidle');
    //             break;
                
    //         case 'select':
    //             await page.click(element.selector || '');
    //             // Wait for options to appear
    //             await page.waitForSelector('option, [role="option"]');
    //             const options = await page.$$('option, [role="option"]');
    //             if (options.length > 0) {
    //                 await options[0].click();
    //             }
    //             break;
    //     }
    
    //     // Add a small delay after all interactions
    //     await page.waitForTimeout(500);
    // }

    private async performFullInteraction(page: Page, element: InteractiveElementGeneric) {
        console.log(`Performing interaction with element: ${element.type}`);

        // Wait for element to be ready
        await this.waitForElement(page, element);

        try {
            switch(element.type) {
                case 'button':
                case 'link':
                    await this.handleClickInteraction(page, element);
                    break;
                    
                case 'input':
                case 'textarea':
                    await this.handleInputInteraction(page, element);
                    break;
                    
                case 'select':
                    await this.handleSelectInteraction(page, element);
                    break;

                case 'form':
                    await this.handleFormInteraction(page, element);
                    break;
            }

            // Wait for any resulting navigation or network activity
            await this.waitForStability(page);
        } catch (error) {
            console.error(`Failed to interact with element: ${element.selector}`, error);
            throw error;
        }
    }

    private async handleClickInteraction(page: Page, element: InteractiveElementGeneric) {
        console.log("clicking on", element.selector);
        await page.locator(element.selector || '').click();
    }
    
    private async handleInputInteraction(page: Page, element: InteractiveElementGeneric) {
        console.log("filling in", element.selector);
        await page.locator(element.selector || '').fill('test');
    }
    
    private async handleSelectInteraction(page: Page, element: InteractiveElementGeneric) {
        // Click the select container to open it
        console.log("clicking on", element.selector);
        await page.locator(element.selector || '').click();
        
        try {
            // Try React Select input
            const reactSelectInput = await page.waitForSelector('[id^="react-select"][id$="-input"]', { timeout: 1000 });
            if (reactSelectInput) {
                await reactSelectInput.click();
                await page.keyboard.press('Enter');
                return;
            }
        } catch {
            // Fall back to regular select handling
            await page.waitForSelector('option, [role="option"]');
            const options = await page.$$('option, [role="option"]');
            if (options.length > 0) {
                await options[0].click();
            }
        }
    }
    
    private async handleFormInteraction(page: Page, element: InteractiveElementGeneric) {
        if (element.inputElements) {
            for (const input of element.inputElements) {
                await page.fill(input.selector, 'test');
            }
        }
        
        if (element.buttonElements?.[0]?.selector) {
            await page.click(element.buttonElements[0].selector);
        }
    }
    private async waitForElement(page: Page, element: InteractiveElementGeneric) {
        const timeout = 5000;
        try {
            // Use locator instead of waitForSelector
            const locator = page.locator(element.selector || '');
            await locator.waitFor({ 
                state: 'visible',
                timeout 
            });
            
            // Brief pause to let any initial animations settle
            await page.waitForTimeout(100);
        } catch (error) {
            console.error(`Element not ready: ${element.selector}`, error);
            throw error;
        }
    }

    private async waitForStability(page: Page) {
        try {
            // Wait for network idle
            await page.waitForLoadState('networkidle', { timeout: 5000 });
            
            // Wait for no animations
            await page.waitForFunction(() => {
                return !document.querySelector(':scope *:not(script):not(style):not(link):not(meta):not(head):not(title):not(html):not(body):not(#root):not(#app):not(#__next):not(#__nuxt):not(#__layout):not(#__app):not(#app-root):not(#root-app):not(#app-container):not(#root-container):not(#app-wrapper):not(#root-wrapper):not(#app-content):not(#root-content):not(#app-main):not(#root-main):not(#app-body):not(#root-body):not(#app-header):not(#root-header):not(#app-footer):not(#root-footer):not(#app-nav):not(#root-nav):not(#app-sidebar):not(#root-sidebar):not(#app-content-wrapper):not(#root-content-wrapper):not(#app-main-wrapper):not(#root-main-wrapper):not(#app-body-wrapper):not(#root-body-wrapper):not(#app-header-wrapper):not(#root-header-wrapper):not(#app-footer-wrapper):not(#root-footer-wrapper):not(#app-nav-wrapper):not(#root-nav-wrapper):not(#app-sidebar-wrapper):not(#root-sidebar-wrapper):not(#app-content-container):not(#root-content-container):not(#app-main-container):not(#root-main-container):not(#app-body-container):not(#root-body-container):not(#app-header-container):not(#root-header-container):not(#app-footer-container):not(#root-footer-container):not(#app-nav-container):not(#root-nav-container):not(#app-sidebar-container):not(#root-sidebar-container)');
            }, { timeout: 1000 }).catch(() => {});
            
            // Small delay for stability
            await page.waitForTimeout(100);
        } catch (error) {
            console.warn('Stability wait timeout, continuing anyway');
        }
    }


    //This method will add edges and track direct children
    async addEdgeWithTracking(from?: string, to?: string): Promise<void> {
        if (!from || !to) {
            console.error("Invalid edge parameters: from = ", from, "to = ", to);
            return;
        }

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
            // Skip login/signup URLs
            if (this.shouldSkipUrl(href)) {
                console.log('⚠️ Skipping authentication-related href:', href);
                return null;
            }
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
        } 
        catch (error) {
            console.error(`Error processing URL: ${href}`, error);
            return null;
        }
    }
}
