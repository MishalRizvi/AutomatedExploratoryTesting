export interface WebElement {
    id: string;
    htmlId: string;
    type: 'textbox' | 'checkbox' | 'radio' | 'button' | 'text' | 'title' | 'link' | 'form';
    value1?: string;
    value2?: string;
  }
  
  export interface WebState {
    name: string;
    type: 0 | 1 | 5; // 0: initial, 1: final, 5: normal
    elementStates: Record<string, 'o' | ' '>;
  }
  
  export interface WebEvent {
    name: string;
    htmlId: string;
    action: 'click' | 'addtext' | 'deltext' | 'select';
  }
  
  export interface WebTransition {
    sourceState: string;
    targetState: string;
    event: string;
    guard?: string;
  }
  
  export interface WebPageModel {
    name: string;
    elements: WebElement[];
    states: WebState[];
    events: WebEvent[];
    transitions: WebTransition[];
  }