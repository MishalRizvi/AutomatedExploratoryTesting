// src/tests/llm-crawler-2.test.ts

import { LLMCrawler } from '../services/llm-crawler-2';
import { chromium, Browser, Page } from 'playwright';

describe('LLMCrawler', () => {
    let crawler: LLMCrawler;
    let browser: Browser;
    let page: Page;
    const BASE_URL = 'http://localhost:3000';

    beforeAll(async () => {
        browser = await chromium.launch({ headless: false });
    });

    beforeEach(async () => {
        page = await browser.newPage();
    });

    afterEach(async () => {
        await page.close();
    });

    afterAll(async () => {
        await browser.close();
    });

    it('should discover login workflow on a login page', async () => {
        // Setup route handling
        await page.route('**/*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'text/html',
                body: `
                    <form>
                        <input type="email" id="email" placeholder="Email">
                        <input type="password" id="password" placeholder="Password">
                        <button type="submit">Login</button>
                    </form>
                `
            });
        });

        const websiteContext = `
            This is a login page for a project management application.
            Users can:
            - Log in with email and password
            - Reset their password if forgotten
            - Create a new account
        `;

        crawler = new LLMCrawler(process.env.OPENAI_API_KEY || '', websiteContext);
        
        await page.goto(`${BASE_URL}/login`);
        const workflows = await crawler.exploreWebsite(`${BASE_URL}/login`, websiteContext);
        
        expect(workflows).toHaveLength(1);
        expect(workflows[0].name).toBe('login');
        expect(workflows[0].actions).toHaveLength(3); // email, password, submit
    }, 30000); // Increased timeout for OpenAI API

    it('should explore dashboard after login', async () => {
        const app: Record<string, string> = {
            '/login': `
                <form id="login-form">
                    <input type="email" id="email">
                    <input type="password" id="password">
                    <button type="submit">Login</button>
                </form>
            `,
            '/dashboard': `
                <nav>
                    <button id="create-project">Create Project</button>
                    <button id="edit-profile">Edit Profile</button>
                </nav>
            `
        };

        // Setup route handling
        await page.route('**/*', async route => {
            const url = route.request().url();
            const path = new URL(url).pathname;
            
            if (app[path]) {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: app[path]
                });
            } else {
                await route.continue();
            }
        });

        // Handle form submission
        await page.exposeFunction('handleLogin', async () => {
            await page.goto(`${BASE_URL}/dashboard`);
        });

        const websiteContext = `
            This is a project management application where users can:
            - Log in to access their dashboard
            - Create new projects from the dashboard
            - Edit their profile settings
            - Manage team members
            - Configure project settings
            
            The application flow typically starts with login, 
            which then takes users to their dashboard where they
            can access various project management features.
        `;

        crawler = new LLMCrawler(process.env.OPENAI_API_KEY || '', websiteContext);
        
        await page.goto(`${BASE_URL}/login`);
        const workflows = await crawler.exploreWebsite(`${BASE_URL}/login`, websiteContext);
        
        expect(workflows.map(w => w.name)).toContain('login');
        expect(workflows.map(w => w.name)).toContain('create-project');
        expect(workflows.map(w => w.name)).toContain('edit-profile');
    }, 30000);

    it('should handle dynamic content', async () => {
        // Setup route handling
        await page.route('**/*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'text/html',
                body: `
                    <div id="app">
                        <button id="load-data">Load Data</button>
                        <div id="content"></div>
                    </div>
                `
            });
        });

        // Add dynamic behavior
        await page.addScriptTag({
            content: `
                document.getElementById('load-data').onclick = () => {
                    document.getElementById('content').innerHTML = '
                        <button id="create-item">Create New Item</button>
                    ';
                }
            `
        });

        const websiteContext = `
            This is a dynamic data management interface where:
            - Users can load data on demand
            - After loading data, users can create new items
            - The interface updates dynamically without page refresh
            
            The application uses dynamic loading to improve performance,
            showing additional actions only after data is loaded.
        `;

        crawler = new LLMCrawler(process.env.OPENAI_API_KEY || '', websiteContext);
        
        await page.goto(`${BASE_URL}/data`);
        const workflows = await crawler.exploreWebsite(`${BASE_URL}/data`, websiteContext);
        
        expect(workflows.map(w => w.name)).toContain('load-data');
        expect(workflows.map(w => w.name)).toContain('create-item');
    }, 30000);

    it('should handle navigation cycles', async () => {
        const app: Record<string, string> = {
            '/page1': `
                <a href="/page2">Go to Page 2</a>
                <button>Action 1</button>
            `,
            '/page2': `
                <a href="/page1">Go to Page 1</a>
                <button>Action 2</button>
            `
        };

        // Setup route handling
        await page.route('**/*', async route => {
            const url = route.request().url();
            const path = new URL(url).pathname;
            
            if (app[path]) {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: app[path]
                });
            } else {
                await route.continue();
            }
        });

        const websiteContext = `
            This is a two-page application where:
            - Users can navigate between Page 1 and Page 2
            - Each page has its own specific actions
            - Navigation between pages is bidirectional
            
            The application should handle navigation cycles properly
            and discover workflows on both pages without getting stuck.
        `;

        crawler = new LLMCrawler(process.env.OPENAI_API_KEY || '', websiteContext);
        
        await page.goto(`${BASE_URL}/page1`);
        const workflows = await crawler.exploreWebsite(`${BASE_URL}/page1`, websiteContext);
        
        const urls = new Set(workflows.map(w => w.startUrl));
        expect(urls.size).toBe(2); // Should have workflows from both pages
    }, 30000);
});