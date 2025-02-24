import { WebPageModel, WebState, WebTransition } from './types';

export class WebPageAutomaton {
  private model: WebPageModel;
  private currentState: WebState | null = null;
  private visitedStates: Set<string> = new Set();
  private testPaths: string[][] = [];

  constructor(model: WebPageModel) {
    this.model = model;
    this.currentState = this.findInitialState();
  }

  private findInitialState(): WebState | null {
    return this.model.states.find(state => state.type === 0) || null;
  }

  private findFinalStates(): WebState[] {
    return this.model.states.filter(state => state.type === 1);
  }

  private getTransitionsFromState(stateName: string): WebTransition[] {
    return this.model.transitions.filter(t => t.sourceState === stateName);
  }

  public generateTestPaths(): string[][] {
    this.testPaths = [];
    this.visitedStates.clear();
    
    if (this.currentState) {
      this.dfs(this.currentState.name, []);
    }

    return this.testPaths;
  }

  private dfs(currentStateName: string, currentPath: string[]) {
    currentPath.push(currentStateName);
    this.visitedStates.add(currentStateName);

    const currentState = this.model.states.find(s => s.name === currentStateName);
    if (currentState?.type === 1) {
      this.testPaths.push([...currentPath]);
    }

    const transitions = this.getTransitionsFromState(currentStateName);
    for (const transition of transitions) {
      if (!this.visitedStates.has(transition.targetState)) {
        this.dfs(transition.targetState, currentPath);
      }
    }

    currentPath.pop();
    this.visitedStates.delete(currentStateName);
  }
}