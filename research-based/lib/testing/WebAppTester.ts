import { Browser, Page, chromium } from 'playwright';
import { WebPageModel, WebTransition, WebState } from './types';

export class WebAppTester {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private models: Map<string, WebPageModel> = new Map();

  async initialize() {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
  }

  async cleanup() {
    await this.browser?.close();
  }

  addPageModel(model: WebPageModel) {
    this.models.set(model.name, model);
  }

  async executeTestPath(path: string[], baseUrl: string) {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      await this.page.goto(baseUrl);
      
      for (let i = 0; i < path.length - 1; i++) {
        const currentState = path[i];
        const nextState = path[i + 1];
        
        // Find and execute transition
        const transition = this.findTransition(currentState, nextState);
        if (transition) {
          await this.executeTransition(transition);
        }

        // Verify new state
        if (!await this.verifyState(nextState)) {
          console.error(`Failed to reach state: ${nextState}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Test execution error:', error);
      return false;
    }
  }

  private findTransition(sourceState: string, targetState: string): WebTransition | null {
    for (const model of this.models.values()) {
      const transition = model.transitions.find(
        t => t.sourceState === sourceState && t.targetState === targetState
      );
      if (transition) return transition;
    }
    return null;
  }

  private async executeTransition(transition: WebTransition) {
    if (!this.page) return;

    const [elementId, action] = transition.event.split(':');
    
    // Wait for element to be available
    await this.page.waitForSelector(`#${elementId}`);

    switch (action) {
      case 'click':
        await this.page.click(`#${elementId}`);
        break;
      case 'addtext':
        await this.page.fill(`#${elementId}`, transition.guard || '');
        break;
      case 'deltext':
        await this.page.fill(`#${elementId}`, '');
        break;
      // Add more actions as needed
    }
  }

  private async verifyState(stateName: string): Promise<boolean> {
    if (!this.page) return false;

    for (const model of this.models.values()) {
      const state = model.states.find(s => s.name === stateName);
      if (!state) continue;

      // Verify each element in the state
      for (const [elementId, expectedState] of Object.entries(state.elementStates)) {
        const element = await this.page.$(`#${elementId}`);
        if (!element) return false;

        if (expectedState === 'o') {
          const value = await element.inputValue();
          if (!value) return false;
        }
      }
    }

    return true;
  }
}