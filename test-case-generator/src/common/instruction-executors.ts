// This file contains the functions that execute the instructions for the tests that we show users

import { Page } from 'playwright';
import { instructionFunctions } from './instruction-functions';
import { AgentRequest, Agent, AgentTemplate } from '../lib/agents/agent';
import { ElementFinderAgent } from '../lib/agents/elementFinderAgent';

export async function executeClick(page: Page, selector: string): Promise<void> {
  const element = await page.locator(selector);
  await element.waitFor({ state: 'visible' });
  await element.click();
}

export async function executeDoubleClick(page: Page, selector: string): Promise<void> {
  const element = await page.locator(selector);
  await element.waitFor({ state: 'visible' });
  await element.dblclick();
}

export async function executeNavigate(page: Page, url: string): Promise<void> {
  await page.goto(url);
}

export async function executeScrollDown(page: Page, pixels: string): Promise<void> {
  await page.evaluate((pixels) => window.scrollBy(0, parseInt(pixels)), pixels);
}

export async function executeScrollLeft(page: Page, pixels: string): Promise<void> {
  await page.evaluate((pixels) => window.scrollBy(-parseInt(pixels), 0), pixels);
}

export async function executeScrollRight(page: Page, pixels: string): Promise<void> {
  await page.evaluate((pixels) => window.scrollBy(parseInt(pixels), 0), pixels);
}

export async function executeScrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

export async function executeScrollToMiddle(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
}

export async function executeScrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
}

export async function executeScrollUp(page: Page, pixels: string): Promise<void> {
  await page.evaluate((pixels) => window.scrollBy(0, -parseInt(pixels)), pixels);
}

export async function executeTypeInField(page: Page, fieldName: string, value: string): Promise<void> {
  const element = await page.locator(fieldName);
  await element.waitFor({ state: 'visible' });
  await element.fill(value);
}

export async function executeVerifyElementById(page: Page, elementId: string): Promise<void> {
  const element = await page.locator(`#${elementId}`);
  await element.waitFor({ state: 'visible' });
  const isVisible = await element.isVisible();
  if (!isVisible) throw new Error(`Element with id ${elementId} not found or not visible`);
}

export async function executeVerifyElementByText(page: Page, text: string): Promise<void> {
  const element = await page.locator(`text=${text}`);
  await element.waitFor({ state: 'visible' });
  const isVisible = await element.isVisible();
  if (!isVisible) throw new Error(`Element with text ${text} not found or not visible`);
}

export async function executeVerifyElementUsingAI(page: Page, description: string): Promise<void> {
  const prompt: string = `Description: ${description}.`;
  
  // Take a screenshot of the page
  const screenshot = await page.screenshot({ type: 'jpeg' }).then(buffer => buffer.toString('base64'));

  // Use ElementFinderAgent
  const agent = new ElementFinderAgent();
  
  // Include the prompt and image in the agent request
  const agentRequest: AgentRequest = {
    query: prompt,
    base64Image: screenshot,
    stripMarkdown: true,
  }
  const selector = await agent.run(agentRequest);

  console.log('selector', selector);
  // Verify the element using returned selector
  const element = await page.locator(selector);
  await element.waitFor({ state: 'visible', timeout: 10000 });
  const isVisible = await element.isVisible();
  if (!isVisible) throw new Error(`Element with description "${description}" not found or not visible`);
}

export async function executeWaitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('load');
}

export async function executeWaitForMilliseconds(page: Page, milliseconds: string): Promise<void> {
  await page.waitForTimeout(parseInt(milliseconds));
}

export async function executeWaitForSeconds(page: Page, seconds: string): Promise<void> {
  await page.waitForTimeout(parseInt(seconds) * 1000);
}

export async function executeWhile(page: Page, condition: string, action: string): Promise<void> {
  while (await page.evaluate(condition)) {
    const instruction = instructionFunctions[action];
    if (!instruction)
        throw new Error(`Instruction not found`);
    if (!instruction.execute)
      throw new Error(`Instruction '${action}' execute function not found`);
    await instruction.execute(page);
  }
}
