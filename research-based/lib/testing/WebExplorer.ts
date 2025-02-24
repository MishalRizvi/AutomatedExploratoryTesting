import { WebDriver, Builder, By, until } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome';
import { ServiceBuilder } from 'selenium-webdriver/chrome';

// Define our TestResult interface
interface TestResult {
    path: string[];        // Array of actions taken
    success: boolean;      // Whether the interaction succeeded
    timestamp: string;     // When the test occurred
    url?: string;         // Optional URL where action occurred
  }

export class WebExplorer {
  private driver: WebDriver | null = null;
  private visitedUrls: Set<string> = new Set();
  private results: TestResult[] = [];

  async initialize() {
    try {
      // Use specific ChromeDriver path
      const chromedriverPath = '/Applications/chromedriver';
      console.log('ChromeDriver path:', chromedriverPath);

      const service = new ServiceBuilder(chromedriverPath);
      
      const options = new Options()
        .addArguments('--start-maximized')
        .addArguments('--disable-notifications')
        .addArguments('--window-size=1920,8000');  // Set a very tall viewport

      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeService(service)
        .setChromeOptions(options as any)
        .build();

      console.log('WebDriver initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebDriver:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      await this.driver?.quit();
      console.log('WebDriver cleaned up successfully');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  async exploreWebsite(startUrl: string) {
    if (!this.driver) throw new Error('WebDriver not initialized');

    try {
      console.log('Starting exploration at:', startUrl);
      await this.explorePage(startUrl, []);
      return this.results;
    } catch (error) {
      console.error('Exploration failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async explorePage(url: string, currentPath: string[]) {
    //1. Check if we have already visited this page to avoid loops 
    const driver = this.driver!;
    if (this.visitedUrls.has(url)) return;
    console.log('Exploring page:', url);

    try {
        // 2. Navigate to the page and wait for it to load
        await driver.get(url);
        await driver.wait(until.elementLocated(By.css('body')), 10000);

        // 3. Find all interactive elements
        const interactiveElements = await driver.findElements(By.css(`
            a, button, input[type='text'], 
            input[type='button'], select, 
            [role='button']
        `));
        console.log(`Found ${interactiveElements.length} interactive elements`);

        // 4. Explore each element
        for (const element of interactiveElements) {
            try {
                const tagName = await element.getTagName(); 
                const elementPath = [...currentPath];

                switch (tagName) {
                    case 'a': {
                        const href = await element.getAttribute('href');
                        const text = await element.getText();
                        console.log(`Found link: ${text} -> ${href}`);

                        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                            elementPath.push(`click_link:${text}`);

                            //Re-find the element before clicking
                            const freshElement = await driver.findElement(By.xpath(`//a[text()='${text}']`));

                            const beforeUrl = await driver.getCurrentUrl();
                            await freshElement.click();
                            await driver.sleep(1000); // Wait for navigation

                            const afterUrl = await driver.getCurrentUrl();

                            if (beforeUrl !== afterUrl) {
                                await this.explorePage(afterUrl, elementPath);
                                await driver.navigate().back();
                            }
                        }
                        break;
                    }
                 
                    case 'button': {
                        const text = await element.getText();
                        console.log(`Found button: ${text}`);
                        
                        const beforeUrl = await driver.getCurrentUrl();
                        elementPath.push(`click_button:${text}`);

                        try {
                            await element.click();
                            await driver.sleep(1000); // Wait for any reactions
                            
                            const afterUrl = await driver.getCurrentUrl();
                            if (beforeUrl !== afterUrl) {
                                await this.explorePage(afterUrl, elementPath);
                                await driver.navigate().back();
                            }
                        } catch (clickError) {
                            console.log(`Could not click button: ${text}`, clickError);
                        }
                        break;
                    }

                    case 'input': {
                        const type = await element.getAttribute('type');
                        const id = await element.getAttribute('id') || 'unknown';
                        console.log(`Found input: ${type} (${id})`);

                        if (type === 'text') {
                            try {
                                await element.sendKeys('test input');
                                elementPath.push(`input:${id}:text`);
                            } catch (inputError) {
                                console.log(`Could not input text to: ${id}`, inputError);
                            }
                        }
                        break;
                    }
                    
                    case 'select': {
                        const id = await element.getAttribute('id') || 'unknown';
                        console.log(`Found select: ${id}`);
                        
                        try {
                            const options = await element.findElements(By.css('option'));
                            if (options.length > 0) {
                                await options[0].click();
                                elementPath.push(`select:${id}`);
                            }
                        } catch (selectError) {
                            console.log(`Could not interact with select: ${id}`, selectError);
                        }
                        break;
                    }
                }

                // 5. Record this interaction path if it was successful 
                if (elementPath.length > currentPath.length) {
                    this.results.push({
                        path: elementPath,
                        success: true,
                        timestamp: new Date().toISOString(),
                        url
                    });
                }
            } 
            catch (error) {
                console.error('Error interacting with element:', error);
            }
        }
    } 
    catch (error) {
        console.error('Error exploring page:', error);
    }
  }
}