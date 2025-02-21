import { Page } from 'playwright';
import {
  executeClick,
  executeDoubleClick,
  executeNavigate,
  executeScrollDown,
  executeScrollLeft,
  executeScrollRight,
  executeScrollToBottom,
  executeScrollToMiddle,
  executeScrollToTop,
  executeScrollUp,
  executeTypeInField,
  executeVerifyElementById,
  executeVerifyElementByText,
  executeVerifyElementUsingAI,
  executeWaitForPageLoad,
  executeWaitForMilliseconds,
  executeWaitForSeconds,
  executeWhile
} from './instruction-executors';

export interface InstructionFunctionDetails {
  description: string;
  numExpectedInputs: number;
  placeholderText?: string;
  placeholderText2?: string;
  formatInstructionText?: (value: string, fieldName?: string) => string;
  inputConstraints?: { [key: string]: InstructionInputConstraint };
  execute?: (page: Page, ...args: any[]) => Promise<void>;
}

interface InstructionInputConstraint {
  required: boolean;
  type?: string; // e.g., 'text', 'number', 'select'
  enumValues?: string[];
  minLength?: number;
  maxLength?: number;
  options?: { label: string; value: string }[];
  allowInstructionInput?: boolean;
  allowedInstructions?: string[]; // Which instructions are allowed
}

export const instructionFunctions: Record<string, InstructionFunctionDetails> = {
  "Click 'X'": {
    description: 'Click on an element on the page.',
    numExpectedInputs: 1,
    placeholderText: "Enter element to click (e.g., 'Submit button')",
    formatInstructionText: (value) => `Click '${value}'`,
    execute: executeClick,
  },
  "Double Click 'X'": {
    description: 'Double click on an element on the page.',
    numExpectedInputs: 1,
    placeholderText: "Enter element to double click (e.g., 'Submit button')",
    formatInstructionText: (value) => `Double click '${value}'`,
    execute: executeDoubleClick,
  },
  "Navigate to URL 'X'": {
    description: 'Navigates to the URL.',
    numExpectedInputs: 1,
    placeholderText: "Enter the URL to navigate to, e.g. www.trysentinel.ai",
    formatInstructionText: (value) => `Navigate to '${value}'`,
    execute: executeNavigate,
  },
  "Scroll down 'X' pixels": {
    description: 'Scrolls the page down X pixels.',
    numExpectedInputs: 1,
    placeholderText: "Enter number of pixels to scroll down",
    formatInstructionText: (value) => `Scroll down '${value}' pixels`,
    execute: executeScrollDown,
  },
  "Scroll left 'X' pixels": {
    description: 'Scrolls the page left X pixels.',
    numExpectedInputs: 1,
    placeholderText: "Enter number of pixels to scroll left",
    formatInstructionText: (value) => `Scroll left '${value}' pixels`,
    execute: executeScrollLeft,
  },
  "Scroll right 'X' pixels": {
    description: 'Scrolls the page right X pixels.',
    numExpectedInputs: 1,
    placeholderText: "Enter number of pixels to scroll right",
    formatInstructionText: (value) => `Scroll right '${value}' pixels`,
    execute: executeScrollRight,
  },
  "Scroll to bottom": {
    description: 'Scrolls the page to the bottom of the page.',
    numExpectedInputs: 0,
    execute: executeScrollToBottom,
  },
  "Scroll to middle": {
    description: 'Scrolls the page to the middle of the page.',
    numExpectedInputs: 0,
    execute: executeScrollToMiddle,
  },
  "Scroll to top": {
    description: 'Scrolls the page to the top of the page.',
    numExpectedInputs: 0,
    execute: executeScrollToTop,
  },
  "Scroll up 'X' pixels": {
    description: 'Scrolls the page up X pixels.',
    numExpectedInputs: 1,
    placeholderText: "Enter number of pixels to scroll up",
    formatInstructionText: (value) => `Scroll up '${value}' pixels`,
    execute: executeScrollUp,
  },
  // TODO: Add a Select function in here
  "Type 'X' in the 'Y' field": {
    description: 'Type text in a field you choose.',
    numExpectedInputs: 2,
    placeholderText: "Enter the field (Y) to type in - either by its HtmlId (E.g #submit-button), its text (E.g text: Submit button), or by describing it (E.g description: first input field from the top)",
    placeholderText2: "Enter the text to type (X)",
    formatInstructionText: (value, fieldName) => `Type '${value}' in the '${fieldName}' field`,
    execute: executeTypeInField,
  },
  // TODO: Add a function to verify an element exists by its text, another by HTML Id, and another by description
  "Verify Element 'X' Exists By HTML Id": {
    description: 'Verifies that an element with the specified HTML Id exists.',
    numExpectedInputs: 1,
    placeholderText: "Enter the element's HTML Id to verify its existence",
    formatInstructionText: (value) => `Find element with text: '${value}'`,
    execute: executeVerifyElementById,
  },
  "Verify Element, 'X', Exists By Text": {
    description: 'Verifies that an element containing the specified text exists.',
    numExpectedInputs: 1,
    placeholderText: 'Enter text to verify its presence in an element',
    formatInstructionText: (value) => `Find element with text: '${value}'`,
    execute: executeVerifyElementByText,
  },
  "Verify Element, 'X', Exists Using AI": {
    description: 'Verifies that an element matching your description exists using AI.',
    numExpectedInputs: 1,
    placeholderText: "Enter the element description that Sentinel should verify exists",
    formatInstructionText: (value) => `Find element with description: '${value}'`,
    execute: executeVerifyElementUsingAI,
  },
  "Wait for Page Load": {
    description: 'Waits for the page to refresh or reload before continuing.',
    numExpectedInputs: 0,
    execute: executeWaitForPageLoad,
  },
  "Wait for 'X' milliseconds": {
    description: 'Waits for a specific amount of milliseconds.',
    numExpectedInputs: 1,
    placeholderText: 'Enter the number of milliseconds',
    formatInstructionText: (value) => `Wait for '${value}' milliseconds`,
    execute: executeWaitForMilliseconds,
  },
  "Wait for 'X' seconds": {
    description: 'Waits for a specific amount of seconds.',
    numExpectedInputs: 1,
    placeholderText: 'Enter the number of seconds',
    formatInstructionText: (value) => `Wait for '${value}' seconds`,
    execute: executeWaitForSeconds,
  },
  "While 'X', do 'Y'": {
    description: 'Continues executing while a condition is met.',
    numExpectedInputs: 2,
    placeholderText: "Enter the condition that has to be true (X)",
    placeholderText2: "Enter what you want to happen while the condition is true (Y)",
    formatInstructionText: (value, fieldName) => `While '${fieldName}', execute '${value}'`,
    execute: executeWhile,
  },
};