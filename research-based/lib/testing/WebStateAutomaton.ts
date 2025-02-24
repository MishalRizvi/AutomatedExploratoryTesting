import { WebDriver, By, until } from 'selenium-webdriver';

interface State {
  name: string;
  type: 'initial' | 'normal' | 'final';
  url: string;
}

interface Transition {
  from: State;
  to: State;
  action: {
    type: 'click' | 'input' | 'select';
    elementId: string;
    value?: string;
  };
}

export class WebStateAutomaton {
  private states: State[] = [];
  private transitions: Transition[] = [];
  private currentState: State | null = null;
  private driver: WebDriver;

  constructor(driver: WebDriver) {
    this.driver = driver;
  }

  // Record a new state when we find it
  private async addState(url: string): Promise<State> {
    const existingState = this.states.find(s => s.url === url);
    if (existingState) return existingState;

    const newState: State = {
      name: `State_${this.states.length}`,
      type: this.states.length === 0 ? 'initial' : 'normal',
      url: url
    };

    this.states.push(newState);
    return newState;
  }

  // Record how we got from one state to another
  private addTransition(from: State, to: State, action: Transition['action']) {
    this.transitions.push({ from, to, action });
  }

  // Main exploration function
  async explore(startUrl: string) {
    // Start state
    const initialState = await this.addState(startUrl);
    this.currentState = initialState;
    await this.driver.get(startUrl);

    // Queue of states to explore
    const stateQueue = [initialState];
    const exploredUrls = new Set<string>();

    while (stateQueue.length > 0) {
      const currentState = stateQueue.shift()!;
      if (exploredUrls.has(currentState.url)) continue;

      console.log(`Exploring state: ${currentState.name} (${currentState.url})`);
      await this.driver.get(currentState.url);

      // Find all interactive elements
      const elements = await this.driver.findElements(By.css('a, button, input'));

      // Try each element
      for (const element of elements) {
        try {
          const beforeUrl = await this.driver.getCurrentUrl();
          const tagName = await element.getTagName();
          const elementId = await element.getAttribute('id') || 'unknown';

          // Interact based on element type
          switch (tagName) {
            case 'a': {
              // Click link and see where it goes
              await element.click();
              await this.driver.wait(until.urlIs(beforeUrl), 5000);
              const afterUrl = await this.driver.getCurrentUrl();

              if (beforeUrl !== afterUrl) {
                // We found a new state!
                const newState = await this.addState(afterUrl);
                this.addTransition(currentState, newState, {
                  type: 'click',
                  elementId
                });
                stateQueue.push(newState);
              }
              break;
            }

            case 'input': {
              const type = await element.getAttribute('type');
              if (type === 'text') {
                // Input might change state
                await element.sendKeys('test');
                const newState = await this.addState(beforeUrl + '#input');
                this.addTransition(currentState, newState, {
                  type: 'input',
                  elementId,
                  value: 'test'
                });
              }
              break;
            }
          }

          // Go back if we navigated
          const currentUrl = await this.driver.getCurrentUrl();
          if (currentUrl !== beforeUrl) {
            await this.driver.navigate().back();
          }

        } catch (error) {
          console.error('Error exploring element:', error);
        }
      }

      exploredUrls.add(currentState.url);
    }

    // Mark dead-end states as final
    this.markFinalStates();
  }

  // States with no outgoing transitions are final
  private markFinalStates() {
    const hasOutgoing = new Set(this.transitions.map(t => t.from.name));
    this.states.forEach(state => {
      if (!hasOutgoing.has(state.name)) {
        state.type = 'final';
      }
    });
  }

  // Get the generated model
  getModel() {
    return {
      states: this.states,
      transitions: this.transitions
    };
  }
}