import { Graph, DirectedGraph } from 'typescript-graph';
import { CDPSession, chromium, ElementHandle, Locator, Page } from 'playwright';
import { listeners } from 'process';

declare global {
    var testGenerationProgress: {
      status: string;
      message: string;
      timestamp: number;
      completedSteps?: number;
      totalSteps?: number;
      visitedUrls?: string[];
      interactiveElements?: number;
      graph?: any;
    };
  }

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
    selectorsList?: (string | undefined)[];
}


//For now, the graph is expanded by clicking on buttons and links 
//However user interaction can be more complex
//TODO: Handle forms
//TODO: Handle hover and see what else needs to be handled - can use hercules? or quora?
export class Intelligence {

    public webAppGraph: DirectedGraph<WebComponent>;
    public visitedElements: Set<string>;
    public directChildren: Map<string, string[]>; // Map to store direct children
    public errorInteractingWithElements: InteractiveElementGeneric[];
    private readonly SKIP_KEYWORDS = [
        'login', 'signin', 'sign-in', 'signup', 'sign-up', 'register',
        'authentication', 'auth', 'password', 'account'
    ];
    
    private readonly MAX_DEPTH = 10;
    private readonly MAX_BREADTH = 5;
    private readonly MAX_PAGES = 50;
    private pagesProcessed = 0;
    private startTime = Date.now();
    private breadthCounters = new Map<number, number>();
    
    constructor() {
        this.webAppGraph = new DirectedGraph<WebComponent>((n: WebComponent) => n.name);
        this.visitedElements = new Set();
        this.directChildren = new Map();
        this.errorInteractingWithElements = [];
        
        // Set up graceful shutdown
        this.setupGracefulShutdown();
    }
    
    private shouldSkipUrl(url: string): boolean {
        // Original auth-related checks
        const skipKeywords = new Set([
            'login', 'signin', 'sign-in', 'signup', 'sign-up', 'register',
            'authentication', 'auth', 'password', 'account'
        ]);
    
        try {
            // Handle relative URLs by checking the path directly
            const path = url.startsWith('http') ? new URL(url).pathname : url;
            
            // Get the last segment of the path
            const lastSegment = path.split('/').filter(Boolean).pop()?.toLowerCase() || '';
        
            // Check for auth-related URLs
            const isAuthUrl = skipKeywords.has(lastSegment);
            
            // Check for non-HTML resources
            const fileExtension = lastSegment.includes('.') ? lastSegment.split('.').pop()?.toLowerCase() : '';
            const nonHtmlExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 
                                      'rar', 'exe', 'mp3', 'mp4', 'avi', 'mov', 'jpg', 'jpeg', 
                                      'png', 'gif', 'svg', 'webp', 'csv', 'txt'];
            
            const isNonHtmlResource = fileExtension ? nonHtmlExtensions.includes(fileExtension) : false;
            
            if (isAuthUrl) {
                console.log('⚠️ Skipping auth page:', lastSegment);
            }
            
            if (isNonHtmlResource) {
                console.log(`⚠️ Skipping non-HTML resource: ${url} (${fileExtension} file)`);
            }
            
            return isAuthUrl || isNonHtmlResource;
        } 
        catch (error) {
            console.warn('Invalid URL:', url);
            return false;
        }
    }

    private shouldSkipElement(element: InteractiveElementGeneric): boolean {
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
    
        // First, extract navigation links directly using Playwright
        console.log('Extracting navigation elements...');
        try {
            // Find all links in common navigation areas
            const navSelectors = [
                'nav a', 
                'header a', 
                '.navigation a', 
                '.navbar a', 
                '.menu a', 
                '.nav-menu a',
                '[role="navigation"] a',
                '.header a',
                '.top-bar a',
                '#menu a',
                '#navigation a'
            ];
            
            const navLinks = await page.locator(navSelectors.join(', ')).all();
            console.log(`Found ${navLinks.length} navigation links`);
            
            // Process and add navigation links to interactiveElements
            for (const link of navLinks) {
                try {
                    const href = await link.getAttribute('href');
                    const text = await link.textContent() || '';
                    
                    // Skip if no href
                    if (!href) continue;
                    
                    // Create navigation element
                    const navElement: InteractiveElementGeneric = {
                        type: 'a',
                        name: text.trim(),
                        id: `navlink-${this.slugify(text.trim())}`,
                        role: 'link',
                        attributes: {
                            href: href
                        },
                        href: href,
                        target: '_self',
                        events: ['click']
                    };
                    
                    // Add to interactiveElements array
                    interactiveElements.push(navElement);
                } catch (error) {
                    console.error('Error processing navigation link:', error);
                }
            }
        } catch (error) {
            console.error('Error finding navigation elements:', error);
        }
    
        const processNode = async (node: DOMNode): Promise<boolean> => {
            try {
                if (!node.nodeId && !node.backendNodeId) {
                    console.log('⚠️ Node missing both nodeId and backendNodeId, skipping');
                    return false;
                }
    
                // First resolve the node
                const resolveParams = node.nodeId > 0 ? { nodeId: node.nodeId } : { backendNodeId: node.backendNodeId };
                const { object } = await client.send('DOM.resolveNode', resolveParams);
                 
                if (object?.objectId) {
                    // Check if node is visible
                    const { result } = await client.send('Runtime.callFunctionOn', {
                        functionDeclaration: `function() {
                            if (this instanceof Element) {
                                const style = window.getComputedStyle(this);
                                return {
                                    isVisible: style.display !== 'none' && 
                                             style.visibility !== 'hidden' && 
                                             style.opacity !== '0'
                                };
                            }
                            return { isVisible: true }; // Document and other non-Element nodes are always visible
                        }`,
                        objectId: object.objectId, 
                        returnByValue: true
                    });
    
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
        
                    if (!result.value?.isVisible) {
                        console.log('Node is not visible');
                        return false;
                    } 
    
                    // Process children first
                    let childHasListeners = false;
                    
                    if (nodeDetails.children) {
                        for (const child of nodeDetails.children) {
                            const hasListeners = await processNode(child);
                            if (hasListeners) {
                                childHasListeners = true;
                            }
                        }
                    }
    
                    // Special handling for NAV and FORM elements - don't skip them even if children have listeners
                    const isSpecialContainer = ['nav', 'form'].includes(nodeName.toLowerCase());
                    
                    if (childHasListeners && !isSpecialContainer) {
                        console.log(`⚠️ Skipping parent node as child has listeners:`, { parent: nodeDetails.nodeName });
                        return true;
                    }
    
                    const listeners = await this.getNodeEventListeners(client, nodeDetails);
                    
                    // Special handling for FORM elements
                    if (nodeName === 'form' || (listeners.length > 0 && this.isInteractiveElement(nodeName))) {
                        console.log(`✨ Found interactive ${nodeName} with ${listeners.length} listeners`);
                        
                        // Get a11y info
                        await client.send('Accessibility.enable');
                        const { nodes } = await client.send('Accessibility.getAXNodeAndAncestors', {
                            backendNodeId: nodeDetails.backendNodeId
                        });
    
                        const a11yInfo = {
                            role: nodes[0]?.role?.value,
                            name: nodes[0]?.name?.value,
                            ignored: nodes[0]?.ignored,
                            ignoredReasons: nodes[0]?.ignoredReasons
                        };
                        console.log('Accessibility info:', a11yInfo);
    
                        // For forms, extract form inputs and submit buttons
                        if (nodeName === 'form') {
                            console.log('Processing form element');
                            
                            // Get form attributes
                            const attrs = this.processAttributes(nodeDetails.attributes);
                            
                            // Use Playwright to get form inputs
                            try {
                                // Create a selector for this form
                                let formSelector = 'form';
                                if (attrs.id) formSelector = `form#${attrs.id}`;
                                else if (attrs.name) formSelector = `form[name="${attrs.name}"]`;
                                else if (attrs.class) formSelector = `form.${attrs.class.replace(/ /g, '.')}`;
                                
                                const formLocator = page.locator(formSelector);
                                if (await formLocator.count() > 0) {
                                    // Get form inputs
                                    const inputs = await formLocator.locator('input:not([type="hidden"]), select, textarea').all();
                                    const formInputs = [];
                                    
                                    for (const input of inputs) {
                                        const [inputType, inputName, inputId, inputPlaceholder] = await Promise.all([
                                            input.getAttribute('type').catch(() => 'text'),
                                            input.getAttribute('name').catch(() => null),
                                            input.getAttribute('id').catch(() => null),
                                            input.getAttribute('placeholder').catch(() => null)
                                        ]);
                                        
                                        formInputs.push({
                                            type: inputType,
                                            name: inputName,
                                            id: inputId,
                                            placeholder: inputPlaceholder
                                        });
                                    }
                                    
                                    // Get submit buttons
                                    const submitButtons = await formLocator.locator('button[type="submit"], input[type="submit"]').all();
                                    const formButtons = [];
                                    
                                    for (const button of submitButtons) {
                                        const [buttonText, buttonValue] = await Promise.all([
                                            button.innerText().catch(() => null),
                                            button.getAttribute('value').catch(() => null)
                                        ]);
                                        
                                        formButtons.push({
                                            text: buttonText,
                                            value: buttonValue
                                        });
                                    }
                                    
                                    // Create form element with detailed info
                                    const formElement: InteractiveElementGeneric = {
                                        type: 'form',
                                        name: a11yInfo.name || attrs.id || attrs.name || 'Form',
                                        id: `form-${attrs.id || attrs.name || 'unnamed'}`,
                                        role: a11yInfo.role || 'form',
                                        attributes: attrs,
                                        events: ['submit'],
                                        formInfo: {
                                            inputs: formInputs,
                                            submitButtons: formButtons,
                                            action: attrs.action,
                                            method: attrs.method || 'get'
                                        }
                                    };
                                    
                                    interactiveElements.push(formElement);
                                    
                                    // Also add the submit button as a separate interactive element
                                    if (submitButtons.length > 0) {
                                        const submitButton = submitButtons[0];
                                        const buttonText = await submitButton.innerText().catch(() => 
                                            submitButton.getAttribute('value').catch(() => 'Submit'));
                                        
                                        const submitElement: InteractiveElementGeneric = {
                                            type: 'button',
                                            name: buttonText || 'Submit',
                                            id: `submit-${attrs.id || attrs.name || 'form'}`,
                                            role: 'button',
                                            events: ['click'],
                                            formInfo: {
                                                formId: attrs.id,
                                                formName: attrs.name,
                                                isSubmit: true
                                            }
                                        };
                                        
                                        interactiveElements.push(submitElement);
                                    }
                                }
                            } catch (error) {
                                console.error('Error processing form with Playwright:', error);
                            }
                        } 
                        else {
                            // Regular interactive element
                            const element = {
                                type: nodeName,
                                name: a11yInfo.name || nodeDetails.nodeValue || nodeDetails.localName || '',
                                role: a11yInfo.role,
                                events: listeners.map(l => l.type)
                            };
                            
                            const interactiveElement = await this.createInteractiveElement(nodeDetails, element);
                            if (interactiveElement) {
                                interactiveElements.push(interactiveElement);
                            }
                        }
                        
                        return true;
                    }
                }
                return false;
            } 
            catch (error) {
                console.error(`Error processing node ${node.nodeName}:`, error);
                return false;
            }
        };
    
        await processNode(root);
        console.log(`\n🎯 Found ${interactiveElements.length} total interactive elements`);
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
        return stableId;
    }
    


    private processAttributes(attributes: string[] | undefined): { [key: string]: string } {
        console.log('\n📝 Processing attributes');
    
        if (!attributes || !Array.isArray(attributes)) {
            return {};
        }
    
        const result: { [key: string]: string } = {};
        for (let i = 0; i < attributes.length; i += 2) {
            if (i + 1 < attributes.length) {
                const key = attributes[i];
                const value = attributes[i + 1];
                result[key] = value;
            }
        }
    
        return result;
    }

    private async createInteractiveElement(node: DOMNode, element: any) {
        console.log('\n🔨 Creating interactive element...');
        
        const attrs = this.processAttributes(node.attributes);
        const elementId = this.generateElementId(node, attrs);

        if (element.name.toLowerCase().includes('cookies')) {
            return null;
        }
    
        const interactiveElement: InteractiveElementGeneric = {
            type: node.nodeName.toLowerCase(),
            name: element.name || node.nodeValue || node.localName || '',
            id: elementId,
            role: element.role,
            attributes: attrs,
            href: attrs.href,
            target: attrs.target || '_self',
            events: element.events
        };

        console.log('Element details:', interactiveElement);
        return interactiveElement;
    }
        

    async expandTree(url: string, page?: Page, interactiveElement?: InteractiveElementGeneric, currentPath: Set<string> = new Set(), depth: number = 0) {
        console.log('\n=== EXPAND TREE START ===');
        console.log(`URL: ${url}`);
        console.log(`Current depth: ${depth}`);
    
        // Add maximum recursion depth to prevent infinite loops
        if (depth > this.MAX_DEPTH) {
            console.log(`⚠️ Maximum recursion depth (${this.MAX_DEPTH}) reached. Stopping exploration.`);
            return;
        }
    
        // Check if we should skip this URL
        if (this.shouldSkipUrl(url)) {
            console.log('⚠️ Skipping URL:', url);
            return;
        }
    
        // Create a unique ID for this element to detect cycles
        const elementId = interactiveElement ? 
            `${url}::${interactiveElement.type}::${interactiveElement.name}` : url;
        
        // Check for cycle in element interaction
        if (currentPath.has(elementId)) {
            console.log('⚠️ Cycle detected! Element or URL already in current path. Returning.');
            console.log('Current path:', Array.from(currentPath));
            return;
        }
        
        // Add to current path
        currentPath.add(elementId);
        console.log(`Added to path: ${elementId}`);
        console.log(`Current path size: ${currentPath.size}`);
    
        let shouldClosePage = false;
        if (!page) {
            const browser = await chromium.launch({ headless: true });
            page = await browser.newPage();
            try {
                console.log(`Navigating to ${url}...`);
                
                // Set a timeout for navigation to prevent hanging on problematic resources
                await page.goto(url, { 
                    timeout: 30000,  // 30 second timeout
                    waitUntil: 'domcontentloaded'  // Don't wait for full page load, just DOM
                });
                
                shouldClosePage = true;
                console.log('Navigation successful');
            } 
            catch (error) {
                console.error('❌ Navigation failed:', error);
                await browser.close();
                currentPath.delete(elementId);
                return;
            }
        }
    
        try {
            // If we have an interactive element, interact with it
            if (interactiveElement) {
                console.log('🔄 Processing Interactive Element:');
                console.log(`Type: ${interactiveElement.type}`);
                console.log(`ID: ${interactiveElement.id}`);
                console.log(`Selector: ${interactiveElement.selector}`);
                
                // Skip if we should skip this element
                if (this.shouldSkipElement(interactiveElement)) {
                    console.log('⚠️ Skipping authentication-related element');
                    currentPath.delete(elementId);
                    return;
                }
                
                try {
                    // Perform the interaction
                    console.log('Attempting interaction...');
                    const interactionSuccess = await this.performFullInteraction(page, interactiveElement);
                    
                    if (!interactionSuccess) {
                        console.log('⚠️ Interaction failed, skipping further exploration');
                        currentPath.delete(elementId);
                        return;
                    }
                    
                    // Get new URL after interaction
                    const newUrl = page.url();
                    console.log(`URL after interaction: ${newUrl}`);
                    
                    // If URL changed, explore the new URL
                    if (newUrl !== url) {
                        console.log('🌐 URL changed after interaction, exploring new URL');
                        await this.expandTree(newUrl, page, undefined, currentPath, depth + 1);
                    } 
                    else {
                        // Extract new elements after interaction
                        console.log('Extracting new elements after interaction...');
                        const newElements = await this.extractInteractiveElements(url);
                        console.log(`Found ${newElements.length} new elements`);
                        console.log('tree', this.webAppGraph);
                        
                        // Process each new element
                        for (const element of newElements) {
                            // Create a unique ID for this element
                            const newElementId = `${element.id}`;
                            console.log(`\nProcessing new element: ${newElementId}`);
                            
                            // Skip if we've already visited this element on this page
                            if (this.visitedElements.has(newElementId)) {
                                console.log('Element already visited, skipping');
                                continue;
                            }
                            
                            // Mark as visited
                            this.visitedElements.add(newElementId);
                            console.log('Element not visited before, processing...');
                            
                            // Add to graph
                            const elementComponent: WebComponent = {
                                name: element.name,
                                type: element
                            };
                            
                            if (!this.webAppGraph.getNode(elementComponent.name)) {
                                console.log('Adding new node to graph');
                                this.webAppGraph.insert(elementComponent);
                                
                                // Add edge from current element to new element
                                if (interactiveElement) {
                                    this.addEdgeWithTracking(interactiveElement.name, element.name);
                                }
                            }
                            
                            // Recursively explore this element
                            await this.expandTree(url, page, element, currentPath, depth + 1);
                        }
                    }
                } 
                catch (error) {
                    console.error(`Error interacting with element: ${interactiveElement.name}`, error);
                    this.errorInteractingWithElements.push(interactiveElement);
                }
            } 
            else {
                // No interactive element provided, so this is a new URL
                // Add the URL as a node in the graph
                const urlComponent: WebComponent = {
                    name: url,
                    type: { url, interactiveElements: [] }
                };
                
                if (!this.webAppGraph.getNode(urlComponent.name)) {
                    console.log('Adding URL node to graph');
                    this.webAppGraph.insert(urlComponent);
                }
                
                // Extract interactive elements from this URL
                console.log('Extracting interactive elements from URL...');
                const elements = await this.extractInteractiveElements(url);
                console.log(`Found ${elements.length} interactive elements`);
                
                // Update the URL node with the elements
                const urlNode = this.webAppGraph.getNode(url);
                if (urlNode) {
                    (urlNode.type as WebPage).interactiveElements = elements;
                }
                
                // Process each element
                for (const element of elements) {
                    const elementId = `${element.id}`;
                    console.log(`\nProcessing element: ${elementId}`);
                    
                    // Skip if we've already visited this element
                    if (this.visitedElements.has(elementId)) {
                        console.log('Element already visited, skipping');
                        continue;
                    }
                    
                    // Mark as visited
                    this.visitedElements.add(elementId);
                    console.log('Element not visited before, processing...');
                    
                    // Add to graph
                    const elementComponent: WebComponent = {
                        name: element.name,
                        type: element
                    };
                    
                    if (!this.webAppGraph.getNode(elementComponent.name)) {
                        console.log('Adding element node to graph');
                        this.webAppGraph.insert(elementComponent);
                        this.addEdgeWithTracking(url, elementComponent.name);
                    }
                    
                    // If it's a link, follow it
                    if ('href' in element && element.href) {
                        console.log(`Processing href: ${element.href}`);
                        const nextUrl = this.getNavigationUrl(element.href, new URL(url));
                        if (nextUrl) {
                            console.log(`Valid navigation URL found: ${nextUrl}`);
                            await this.expandTree(nextUrl, undefined, undefined, currentPath, depth + 1);
                        }
                    } 
                    else {
                        // Otherwise, interact with it on the current page
                        console.log('Processing non-href element recursively');
                        await this.expandTree(url, page, element, currentPath, depth + 1);
                    }
                }
            }
        } 
        catch (error) {
            console.error(`Error in expandTree: ${error}`);
        }
        finally {
            // Remove from current path when done
            currentPath.delete(elementId);
            console.log(`Removed from path: ${elementId}`);
            
            // Close page if we opened it
            if (shouldClosePage && page) {
                await page.context().browser()?.close();
            }
            console.log('=== EXPAND TREE END ===\n');
        }
    }

    // private async createRobustLocator(page: Page, element: InteractiveElementGeneric): Promise<Locator> {
    //     if (!element.selectorsList?.length) {
    //         throw new Error("No selectors available for element");
    //     }
    
    //     // Create array of locators from our selectors list
    //     const combinedSelectors = element.selectorsList
    //         .filter(Boolean)
    //         .join(',');
    
    //     // Use race to find the first locator that works
    //     console.log("combinedSelectors", combinedSelectors);
    //     return page.locator(combinedSelectors);
    // }


    async performFullInteraction(page: Page, element: InteractiveElementGeneric): Promise<boolean> {
        console.log(`Performing interaction with element: ${element.type} - ${element.name}`);
        try {
            let matchedLocator: Locator | null = null;
            
            // Try role + name
            if (element.role && element.name) {
                console.log(`Trying getByRole('${element.role}', { name: '${element.name}', exact: true })`);
                const roleLocator = page.getByRole(element.role as any, { name: element.name, exact: true });
                console.log("number of role locators", await roleLocator.count());
                if (await roleLocator.count() > 0) {
                    console.log('✅ Found by role and name');
                    matchedLocator = roleLocator;
                }
            }
            
            // Try text content
            if (!matchedLocator && element.name) {
                console.log(`Trying getByText('${element.name}')`);
                const textLocator = page.getByText(element.name, { exact: true });
                if (await textLocator.count() > 0) {
                    console.log('✅ Found by text content');
                    matchedLocator = textLocator;
                }
            }
            
            // Try ID
            if (!matchedLocator && element.attributes?.id) {
                console.log(`Trying locator('#${element.attributes.id}')`);
                const idLocator = page.locator(`#${element.attributes.id}`);
                if (await idLocator.count() === 1) {
                    console.log('✅ Found by ID');
                    matchedLocator = idLocator;
                }
            }
            
            // Try using partial text match
            if (!matchedLocator && element.name) {
                console.log(`Trying getByText with partial match: '${element.name}'`);
                const partialTextLocator = page.getByText(element.name, { exact: false });
                if (await partialTextLocator.count() === 1) {
                    console.log('✅ Found by partial text match');
                    matchedLocator = partialTextLocator;
                }
            }
            
            // Try using role only
            if (!matchedLocator && element.role) {
                console.log(`Trying getByRole('${element.role}')`);
                const roleOnlyLocator = page.getByRole(element.role as any);
                if (await roleOnlyLocator.count() === 1) {
                    console.log('✅ Found by role only');
                    matchedLocator = roleOnlyLocator;
                }
            }
            
            // Special case for search buttons
            if (!matchedLocator && element.type === 'button' && element.name.toLowerCase().includes('search')) {
                console.log('Trying to find search button by common selectors');
                const searchButtonSelectors = [
                    'button[type="submit"]',
                    'input[type="submit"]',
                    '.search-submit',
                    '.search-button',
                    '[aria-label="Search"]',
                    '[title="Search"]'
                ];
                
                for (const selector of searchButtonSelectors) {
                    const buttonLocator = page.locator(selector);
                    if (await buttonLocator.count() === 1) {
                        console.log(`✅ Found search button with selector: ${selector}`);
                        matchedLocator = buttonLocator;
                        break;
                    }
                }
            }
            
            // If we still can't find it, log and return false instead of throwing
            if (!matchedLocator) {
                console.log(`⚠️ Could not find a unique matching element for: ${element.type} ${element.name}`);
                return false;
            }
            
            // Wait for element to be ready
            await this.waitForElement(page, matchedLocator);
            
            // Perform the interaction based on element type
            switch(element.type) {
                case 'button':
                case 'a':
                    await this.handleClickInteraction(page, matchedLocator);
                    break;
                    
                case 'input':
                case 'textarea':
                    if (element.role === 'searchbox') {
                        await this.handleSearchInteraction(page, matchedLocator);
                    } else {
                        await this.handleInputInteraction(page, matchedLocator);
                    }
                    break;
                    
                case 'select':
                    await this.handleSelectInteraction(page, matchedLocator);
                    break;
    
                case 'form':
                    await this.handleFormInteraction(page, matchedLocator, element);
                    break;
                    
                default:
                    // For any other element type, try clicking
                    await this.handleClickInteraction(page, matchedLocator);
            }
            
            // Wait for any resulting navigation or network activity
            await this.waitForStability(page);
            
            return true;
        } catch (error) {
            console.error(`Error interacting with element: ${element.name}`, error);
            return false;
        }
    }

    private async handleClickInteraction(page: Page, locator: Locator) {
        console.log("Attempting to click on", locator);
        
        try {
            // First try: standard click
            await locator.click({ timeout: 5000 }).catch(async (error) => {
                console.log("Standard click failed, trying alternative methods:", error.message);
                
                // Second try: force click (bypasses pointer event checks)
                await locator.click({ force: true, timeout: 5000 }).catch(async (error) => {
                    console.log("Force click failed, trying JavaScript click:", error.message);
                    
                    // Third try: JavaScript click
                    await page.evaluate(selector => {
                        const element = document.querySelector(selector);
                        if (element) {
                            (element as HTMLElement).click();
                            return true;
                        }
                        return false;
                    }, locator.toString()).catch(async (error) => {
                        console.log("JavaScript click failed, trying parent element:", error.message);
                        
                        // Fourth try: Click parent element
                        await locator.evaluate(node => {
                            if (node.parentElement) {
                                node.parentElement.click();
                                return true;
                            }
                            return false;
                        }).catch(error => {
                            console.log("All click methods failed:", error.message);
                            throw new Error("Unable to click element after multiple attempts");
                        });
                    });
                });
            });
            
            console.log("Click successful");
        } catch (error) {
            console.error("Click failed after all attempts:", error);
            throw error;
        }
    }
    
    private async handleInputInteraction(page: Page, locator: Locator) {
        console.log("filling in", locator);
        await locator.fill('test');
    }
    
    private async handleSelectInteraction(page: Page, locator: Locator) {
        // Click the select container to open it
        console.log("clicking on", locator);
        await locator.click();
        
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
    
    private async handleFormInteraction(page: Page, locator: Locator, element: InteractiveElementGeneric) {
        if (element.inputElements) {
            for (const input of element.inputElements) {
                await locator.locator(input.selector).fill('test');
            }
        }
        
        if (element.buttonElements?.[0]?.selector) {
            await page.click(element.buttonElements[0].selector);
        }
    }

    private async handleSearchInteraction(page: Page, locator: Locator) {
        console.log("Handling search interaction");
        
        try {
            // Fill the search box
            await locator.fill("test query");
            
            // Press Enter to submit
            await locator.press("Enter");
            
            // Wait for navigation or results
            await this.waitForStability(page);
            
            console.log("Search submitted successfully");
        } catch (error) {
            console.error("Error during search interaction:", error);
            
            // Fallback: try to find and click the search button
            try {
                console.log("Trying to find and click search button");
                
                // Common search button selectors
                const searchButtonSelectors = [
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'button.search-submit',
                    '.search-button',
                    '[aria-label="Search"]',
                    '[title="Search"]',
                    'form button',
                    'form input[type="image"]'
                ];
                
                // Try each selector
                for (const selector of searchButtonSelectors) {
                    const buttonLocator = page.locator(selector);
                    if (await buttonLocator.count() > 0) {
                        console.log(`Found search button with selector: ${selector}`);
                        await buttonLocator.click({ force: true });
                        await this.waitForStability(page);
                        console.log("Search button clicked successfully");
                        return;
                    }
                }
                
                throw new Error("Could not find search button");
            } catch (buttonError) {
                console.error("Failed to click search button:", buttonError);
                throw error; // Throw the original error
            }
        }
    }

    private async waitForElement(page: Page, locator: Locator) {
        const timeout = 5000;
        try {
            // Use locator instead of waitForSelector
            await locator.waitFor({ 
                state: 'visible',
                timeout 
            });
            
            // Brief pause to let any initial animations settle
            await page.waitForTimeout(100);
        } catch (error) {
            console.error(`Element not ready: ${locator}`, error);
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
            // Skip empty or javascript: URLs
            if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
                console.log('⚠️ Skipping non-navigational href:', href);
                return null;
            }
            
            // Remove query parameters if they cause issues
            const cleanHref = href.split('?')[0];
            
            // Construct absolute URL
            let absoluteUrl: string;
            
            // Handle relative URLs
            if (cleanHref.startsWith('/')) {
                absoluteUrl = baseUrl.origin + cleanHref;
            }
            // Handle absolute URLs
            else if (cleanHref.startsWith('http')) {
                absoluteUrl = cleanHref;
            }
            // Handle relative URLs without leading slash
            else if (!cleanHref.includes('://')) {
                // Get the directory part of the current URL
                const pathParts = baseUrl.pathname.split('/');
                pathParts.pop(); // Remove the last part (file or empty string)
                const directory = pathParts.join('/');
                
                absoluteUrl = `${baseUrl.origin}${directory}/${cleanHref}`;
            }
            else {
                console.log('⚠️ Unrecognized URL format:', href);
                return null;
            }
            
            // Skip authentication-related URLs
            if (this.shouldSkipUrl(absoluteUrl)) {
                console.log('⚠️ Skipping authentication-related or non-HTML resource URL:', absoluteUrl);
                return null;
            }
            
            // Check if it's an external URL
            const isSameOrigin = new URL(absoluteUrl).origin === baseUrl.origin;
            if (!isSameOrigin) {
                console.log(`⚠️ Skipping external URL: ${absoluteUrl}`);
                return null;
            }
            
            console.log(`✅ Valid navigation URL: ${absoluteUrl}`);
            return absoluteUrl;
        } 
        catch (error) {
            console.error(`Error processing URL: ${href}`, error);
            return null;
        }
    }

    // New helper method to extract navigation elements
    private async extractNavigationElements(page: Page): Promise<InteractiveElementGeneric[]> {
        const navElements: InteractiveElementGeneric[] = [];
        
        try {
            // Find all navigation elements using common selectors
            const navSelectors = [
                'nav', 
                'header', 
                '[role="navigation"]', 
                '.navigation', 
                '.navbar', 
                '.nav', 
                '#navigation',
                '#navbar',
                '#nav'
            ];
            
            // Combine selectors
            const combinedSelector = navSelectors.join(', ');
            const navLocators = page.locator(combinedSelector);
            const count = await navLocators.count();
            
            console.log(`Found ${count} navigation containers`);
            
            // Process each navigation container
            for (let i = 0; i < count; i++) {
                const navElement = navLocators.nth(i);
                const navId = await navElement.getAttribute('id') || `nav-${i}`;
                
                // Get all links in this navigation
                const links = await navElement.locator('a').all();
                console.log(`Navigation #${i} (${navId}) has ${links.length} links`);
                
                // Process each link
                for (const link of links) {
                    const [linkText, linkHref] = await Promise.all([
                        link.innerText().catch(() => ''),
                        link.getAttribute('href').catch(() => null)
                    ]);
                    
                    if (linkHref && linkText.trim()) {
                        // Skip login/auth links
                        if (this.SKIP_KEYWORDS.some(keyword => 
                            linkText.toLowerCase().includes(keyword) || 
                            (linkHref && linkHref.toLowerCase().includes(keyword)))) {
                            console.log(`Skipping auth-related nav link: ${linkText}`);
                            continue;
                        }
                        
                        // Create a unique ID for this nav link
                        const linkElementId = `navlink-${linkText.trim().toLowerCase().replace(/\s+/g, '-')}`;
                        
                        const navLinkElement: InteractiveElementGeneric = {
                            type: 'navlink',
                            name: linkText.trim(),
                            id: linkElementId,
                            role: 'link',
                            href: linkHref,
                            events: ['click'],
                            relationships: {
                                navGroup: navId,
                                isNavigation: true
                            }
                        };

                        if (!this.visitedElements.has(linkElementId)) {
                            navElements.push(navLinkElement);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error extracting navigation elements:', error);
        }
        
        return navElements;
    }

    private setupGracefulShutdown(): void {
        // Handle Ctrl+C (SIGINT)
        process.on('SIGINT', async () => {
            console.log('\n\n');
            console.log('='.repeat(70));
            console.log('🛑 Crawler stopped by user (Ctrl+C)');
            console.log('='.repeat(70));
            
            // Print the graph
            console.log('\n📊 Web Application Graph:');
            //console.log(JSON.stringify(this.webAppGraph, null, 2));
            
            // Print the flows
            console.log('\n🔄 Flows:');
            const flows = await this.findAllPathsInGraph();
            flows.forEach(flow => {
                console.log("Flow:", flow);
            });
            
            // Exit with a slight delay to ensure logs are printed
            setTimeout(() => {
                process.exit(0);
            }, 500);
        });
    }

    // Helper method to create URL-friendly slugs
    private slugify(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-')     // Replace spaces with hyphens
            .replace(/-+/g, '-')      // Remove consecutive hyphens
            .trim();                  // Trim leading/trailing spaces
    }

}
