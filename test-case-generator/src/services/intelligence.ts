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
    elementId: string;
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
    private pageElementsCache = new Map<string, Map<string, InteractiveElementGeneric>>();
    private readonly MAX_DEPTH = 10;
    
    constructor() {
        this.webAppGraph = new DirectedGraph<WebComponent>((n: WebComponent) => n.name);
        this.visitedElements = new Set();
        this.directChildren = new Map();
        this.errorInteractingWithElements = [];
        this.pageElementsCache = new Map();
        // Set up graceful shutdown
        this.setupGracefulShutdown();
    }
    
    /**
     * Determines whether a URL should be skipped during crawling.
     * Uses efficient regex patterns and Set lookups to identify URLs to skip.
     */
    private shouldSkipUrl(url: string): boolean {
        // Skip empty or invalid URLs
        if (!url || url === '#' || url === 'javascript:void(0)') {
            return true;
        }
        
        try {
            // Normalize the URL for consistent checking
            const urlLower = url.toLowerCase();
            
            // 1. Check for non-HTTP protocols with a single regex
            if (/^(mailto:|tel:|sms:|ftp:)/.test(urlLower)) {
                console.log(`⚠️ Skipping non-HTTP protocol: ${url}`);
                return true;
            }
            
            // 2. Check for file extensions with a single regex
            const fileExtensionMatch = urlLower.match(/\.([a-z0-9]{2,4})(\?|#|$)/);
            if (fileExtensionMatch) {
                const extension = fileExtensionMatch[1];
                const nonHtmlExtensions = new Set([
                    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt',
                    'zip', 'rar', 'tar', 'gz', '7z', 'mp3', 'mp4', 'avi', 'mov', 'wmv',
                    'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico', 'exe'
                ]);
                
                if (nonHtmlExtensions.has(extension)) {
                    console.log(`⚠️ Skipping non-HTML resource: ${url} (${extension} file)`);
                    return true;
                }
            }
            
            // 3. Check for auth-related URLs with a single regex
            // This regex checks for auth keywords as whole words in the path
            const authUrlRegex = /\/(login|signin|sign-in|signup|sign-up|register|authentication|auth|password|logout|signout|sign-out)(\/|$|\?)/;
            if (authUrlRegex.test(urlLower)) {
                console.log(`⚠️ Skipping auth page: ${url}`);
                return true;
            }
            
            // 4. Check for auth-related query parameters with a single test
            if (urlLower.includes('?') && 
                /[?&](login|signin|signup|auth|token|password|reset|logout|signout)=/.test(urlLower)) {
                console.log(`⚠️ Skipping auth-related URL (query param): ${url}`);
                return true;
            }
            
            return false;
        } 
        catch (error) {
            console.warn('Invalid URL:', url);
            return true; // Skip invalid URLs
        }
    }

    private normalizeUrl(url: string): string {
        try {
            // Handle relative URLs
            if (!url.startsWith('http')) {
                return url.replace(/\/$/, ''); // Just remove trailing slash for relative URLs
            }
            
            // Parse the URL
            const parsedUrl = new URL(url);
            
            // Standardize protocol (use https if available)
            parsedUrl.protocol = 'https:';
            
            // Remove trailing slash from pathname
            parsedUrl.pathname = parsedUrl.pathname.replace(/\/$/, '') || '/';
            
            // Sort query parameters for consistency
            if (parsedUrl.search) {
                const params = Array.from(parsedUrl.searchParams.entries())
                    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
                
                // Clear existing params
                parsedUrl.search = '';
                
                // Add sorted params
                for (const [key, value] of params) {
                    parsedUrl.searchParams.append(key, value);
                }
            }
            
            // Remove hash/fragment
            parsedUrl.hash = '';
            
            return parsedUrl.toString();
        } catch (error) {
            console.warn(`Failed to normalize URL: ${url}`, error);
            return url; // Return original URL if normalization fails
        }
    }

    private shouldSkipNode(nodeName: string): boolean {
        //Add as needed
        return ['script', 'style', 'link', 'meta', 'img', 'path', 'svg', 'noscript', 'video', 'audio'].includes(nodeName);
    }

    /**
     * Determines whether an interactive element should be skipped during crawling.
     * Uses efficient regex patterns and direct checks to identify elements to skip.
     */
    private shouldSkipElement(element: InteractiveElementGeneric): boolean {
        if (!element || !element.name || element.name.trim() === '') {
            return true;
        }
    
        const text = element.name.toLowerCase();
        const href = (element.href || '').toLowerCase();
        
        // 1. Check auth-related text with a single regex
        // This checks for common auth-related terms as whole words
        if (/\b(sign in|sign up|log in|login|logout|log out|register|create account|my account|sign out)\b/i.test(text)) {
            return true;
        }
        
        // 2. Check auth-related URLs with a single regex
        if (href && /\/(login|signin|signup|register|auth|account|profile|logout|signout)(\/|$|\?)/i.test(href)) {
            return true;
        }
        
        // 3. Check for social media links with a single regex
        if (/\b(facebook|twitter|instagram|linkedin|youtube|pinterest|share|tweet|follow)\b/i.test(text) ||
            /\b(facebook|twitter|instagram|linkedin|youtube|pinterest)\b/i.test(href)) {
            return true;
        }
        
        // 4. Check for cookie-related elements with a single regex
        if (/\b(cookie|cookies|accept|privacy policy|gdpr|ccpa)\b/i.test(text)) {
            return true;
        }
        
        // 5. Check for utility functions with a single regex
        if (/\b(print|download|export|save|email this)\b/i.test(text)) {
            return true;
        }
        return false;
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

    async extractInteractiveElements(url: string, existingPage?: Page, forceRefresh = false): Promise<InteractiveElementGeneric[]> {
        console.log('\n=== Starting Interactive Elements Extraction ===');
        console.log(`URL: ${url}`);

        // Normalize URL for consistent caching
        const normalizedUrl = this.normalizeUrl(url);

        // Check cache first (unless force refresh is requested)
        if (!forceRefresh && this.pageElementsCache.has(normalizedUrl)) {
            console.log(`Using cached elements for ${normalizedUrl}`);
            return Array.from(this.pageElementsCache.get(normalizedUrl)!.values());
        }
        
        let browser;
        let shouldCloseBrowser = false;
        
        try {
            if (existingPage) {
                console.log('Using existing page');
                await existingPage.goto(url);
                const client = await existingPage.context().newCDPSession(existingPage);
                const { root } = await client.send('DOM.getDocument');
                browser = { page: existingPage, client, root, browser: null };
            } 
            else {
                console.log('Creating new browser');
                browser = await this.setupBrowser(url);
                shouldCloseBrowser = true;
            }
            
            const interactiveElements = await this.processDocument(browser.page, browser.client, browser.root);

            // Store in cache by element ID for efficient lookup and comparison
            const elementsMap = new Map<string, InteractiveElementGeneric>();
            for (const element of interactiveElements) {
                elementsMap.set(element.elementId, element);
            }
            
            // Update the cache
            this.pageElementsCache.set(normalizedUrl, elementsMap);
            
            console.log(`\n✅ Extraction complete. Found ${interactiveElements.length} interactive elements`);
            return interactiveElements;
        } 
        catch (error) {
            console.error('❌ Fatal error in extractInteractiveElements:', error);
            throw new Error(`Failed to extract elements from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        finally {
            if (shouldCloseBrowser && browser?.browser) {
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

    /**
     * Gets new elements that appeared after an interaction
     */
    async getNewElementsAfterInteraction(url: string, page: Page): Promise<InteractiveElementGeneric[]> {
        // Normalize URL for consistent caching
        const normalizedUrl = this.normalizeUrl(url);
        
        // Get the current cached elements (before interaction)
        const beforeElements = this.pageElementsCache.get(normalizedUrl);
        if (!beforeElements) {
            console.log('No cached elements found for comparison');
            return [];
        }
        
        // Extract elements after interaction with force refresh
        const afterElements = await this.extractInteractiveElements(url, page, true);
        
        // Find elements that weren't present before
        const newElements = afterElements.filter(element => {
            return !beforeElements.has(element.elementId);
        });
        
        console.log(`Found ${newElements.length} new elements after interaction`);
        return newElements;
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
                    const text = await link.innerText();
                    const role = await link.getAttribute('role') || 'link';
                    
                    if (href && text && !href.startsWith('javascript:') && !href.startsWith('#')) {
                        console.log(`Found navigation link: ${text} -> ${href}`);
                        
                        const element: InteractiveElementGeneric = {
                            type: 'a',
                            name: text.trim(),
                            role: role,
                            href: href,
                            elementId: `nav-${text.trim().toLowerCase().replace(/\s+/g, '-')}`,
                            attributes: { href },
                            events: ['click']
                        };
                        
                        interactiveElements.push(element);
                    }
                } catch (error) {
                    console.error('Error processing navigation link:', error);
                }
            }
        } 
        catch (error) {
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

                    if (!result.value?.isVisible) {
                        console.log('Node is not visible');
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
                    const eventListeners = listeners.map(l => l.type);
                    
                    // Special handling for FORM elements
                    if (listeners.length > 0 && this.isInteractiveElement(nodeName)) {
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
                            const formElement = await this.createInteractiveFormElement(page, nodeDetails, a11yInfo);
                            if (this.shouldSkipElement(formElement)) {
                                console.log('Skipping form element as invalid:', formElement);
                                return false;
                            }
                            interactiveElements.push(formElement);
                        } 
                        else {
                            const interactiveElement = await this.createInteractiveElement(nodeDetails, a11yInfo, eventListeners);
                            if (interactiveElement) {
                                if (interactiveElement.type === 'link' || (interactiveElement.href && this.shouldSkipUrl(interactiveElement.href))) {
                                    console.log('⚠️ Skipping element as invalid href:', interactiveElement.href);
                                    return false; 
                                }
                                else if (this.shouldSkipElement(interactiveElement)) {
                                    console.log('Skipping element as invalid:', interactiveElement);
                                    return false; 
                                }
                                else {
                                    interactiveElements.push(interactiveElement);
                                }
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

    private generateElementId(element: DOMNode, attrs: any): string {
        if (attrs.id) {
            return attrs.id;
        }
        else if (attrs.name && attrs.class) {
            return `${attrs.name}-${attrs.class}`;
        }
        else {
            return `${element.nodeName.toLowerCase()}-${element.backendNodeId}`;
        }
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

    private async createInteractiveElement(node: DOMNode, element: any, eventListeners: string[]) {
        console.log('\n🔨 Creating interactive element...');
        
        const attrs = this.processAttributes(node.attributes);
        const elementId = this.generateElementId(node, attrs);
    
        const interactiveElement: InteractiveElementGeneric = {
            type: node.nodeName.toLowerCase(),
            name: element.name || node.nodeValue || node.localName || '',
            elementId: elementId,
            role: element.role,
            attributes: attrs,
            href: attrs.href,
            target: attrs.target || '_self',
            events: eventListeners
        };

        console.log('Element details:', interactiveElement);
        return interactiveElement;
    }

    /**
     * Creates a single interactive element representing a form with all its inputs and controls.
     */
    private async createInteractiveFormElement(
        page: Page, 
        nodeDetails: DOMNode, 
        a11yInfo: any
    ): Promise<InteractiveElementGeneric> {
        console.log('Processing form element');
        
        // Get form attributes
        const attrs = this.processAttributes(nodeDetails.attributes);
        
        // Default form element with minimal information
        const formElement: InteractiveElementGeneric = {
            type: 'form',
            name: a11yInfo.name || attrs.id || attrs.name || 'Form',
            elementId: this.generateElementId(nodeDetails, attrs),
            role: a11yInfo.role || 'form',
            attributes: attrs,
            events: ['submit'],
            formInfo: {
                inputs: [],
                submitButtons: [],
                action: attrs.action,
                method: attrs.method || 'get'
            }
        };
        
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
                    const [inputType, inputName, inputId, inputPlaceholder, inputValue, inputRequired] = await Promise.all([
                        input.getAttribute('type').catch(() => 'text'),
                        input.getAttribute('name').catch(() => null),
                        input.getAttribute('id').catch(() => null),
                        input.getAttribute('placeholder').catch(() => null),
                        input.getAttribute('value').catch(() => null),
                        input.getAttribute('required').then(val => val !== null).catch(() => false)
                    ]);
                    
                    formInputs.push({
                        type: inputType,
                        name: inputName,
                        id: inputId,
                        placeholder: inputPlaceholder,
                        value: inputValue,
                        required: inputRequired,
                        selector: `#${inputId}` || `[name="${inputName}"]` || `input[type="${inputType}"]`
                    });
                }
                
                // Get submit buttons
                const submitButtons = await formLocator.locator('button[type="submit"], input[type="submit"]').all();
                const formButtons = [];
                
                for (const button of submitButtons) {
                    const [buttonText, buttonValue, buttonId, buttonName] = await Promise.all([
                        button.innerText().catch(() => null),
                        button.getAttribute('value').catch(() => null),
                        button.getAttribute('id').catch(() => null),
                        button.getAttribute('name').catch(() => null)
                    ]);
                    
                    formButtons.push({
                        text: buttonText || buttonValue || 'Submit',
                        value: buttonValue,
                        id: buttonId,
                        name: buttonName,
                        selector: buttonId ? `#${buttonId}` : (buttonName ? `[name="${buttonName}"]` : 'button[type="submit"]')
                    });
                }
                
                // Update form element with detailed info
                formElement.formInfo = {
                    inputs: formInputs,
                    submitButtons: formButtons,
                    action: attrs.action,
                    method: attrs.method || 'get',
                    hasRequiredFields: formInputs.some(input => input.required),
                    inputCount: formInputs.length,
                    submitCount: formButtons.length
                };
                
                // Add a chain property to represent the interaction sequence
                formElement.chain = [
                    // First fill out all inputs
                    ...formInputs.map(input => ({
                        type: 'input',
                        selector: input.selector,
                        attributes: {
                            type: input.type,
                            name: input.name,
                            id: input.id,
                            placeholder: input.placeholder
                        }
                    })),
                    // Then click the submit button
                    ...(formButtons.length > 0 ? [{
                        type: 'button',
                        selector: formButtons[0].selector,
                        attributes: {
                            text: formButtons[0].text,
                            value: formButtons[0].value
                        }
                    }] : [])
                ];
            }
        } 
        catch (error) {
            console.error('Error processing form with Playwright:', error);
        }
        
        return formElement;
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
        const elementId = interactiveElement ? interactiveElement.elementId : url;
        
        // Check for cycle in element interaction
        if (elementId && currentPath.has(elementId)) {
            console.log('⚠️ Cycle detected! Element or URL already in current path. Returning.');
            console.log('Current path:', Array.from(currentPath));
            return;
        }
        
        // Add to current path
        if (elementId) {
            currentPath.add(elementId);
            console.log(`Added to path: ${elementId}`);
            console.log(`Current path size: ${currentPath.size}`);
        }
        else {
            console.log('No element ID found, skipping');
            return;
        }
    
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
                console.log(interactiveElement);
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
                        if (interactiveElement) {
                            this.addEdgeWithTracking(interactiveElement.name, newUrl);
                        }

                        // Continue exploration from the new URL
                        // The recursive call will handle element extraction
                        await this.expandTree(newUrl, page, undefined, currentPath, depth + 1);
                    } 
                    else {
                        // URL stayed the same, but page state might have changed
                        console.log('Extracting new elements after interaction...');

                        const newElements = await this.getNewElementsAfterInteraction(url, page);

                        // Process each new element
                        for (const element of newElements) {
                            // Skip if we've already visited this element
                            if (this.visitedElements.has(element.elementId)) {
                                console.log(`Element ${element.elementId} already visited, skipping`);
                                continue;
                            }
                            
                            // Mark as visited
                            this.visitedElements.add(element.elementId);
                            
                            // Add to graph
                            const elementComponent: WebComponent = {
                                name: element.name,
                                type: element
                            };
                            
                            if (!this.webAppGraph.getNode(elementComponent.name)) {
                                console.log(`Adding new element node to graph: ${element.name}`);
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
                    const elementId = `${element.elementId}`;
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
                        console.log(`Going to interactive element's href: ${element.href}`);
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
