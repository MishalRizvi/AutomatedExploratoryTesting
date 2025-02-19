import { Action, FormFillAction } from "./llm-crawler";

export interface TestStep {
    action: string; 
    selector ?: string; 
    value?: string | string[]; 
    assertion?: string; 
}

export interface TestCase {
    id: string; 
    name: string; 
    description: string; 
    steps: TestStep[]; 
    tags: string[]; 
    priority: 'high' | 'medium' | 'low'; 
}

export class TestCaseGenerator {
    generateTestCases(crawlerPath: Action[]): TestCase[] {
        const testCases: TestCase[] = []; 
        let currentTestCase: TestStep[] = []; 

        //Group related actions into test cases 
        for (let i=0; i<crawlerPath.length; i++) {
            const currentAction = crawlerPath[i]; 

            switch (currentAction.type) {
                case 'form_fill':
                    //Form submissions usually complete a test case 
                    currentTestCase.push(...this.convertFormFillToSteps(currentAction)); 
                    testCases.push(this.createTestCase(currentTestCase, "Form Submission Test", currentAction.reasoning)); 
                    currentTestCase = []; 
                    break; 
                case 'click':
                    currentTestCase.push({
                        action: 'click', 
                        selector: currentAction.target_selector, 
                        assertion: 'Element should be clickable' //reasoning could replace this 
                    }); 
                    break; 

                case 'navigate':
                    if (currentTestCase.length > 0) {
                        //Navigation usually starts a new test case 
                        testCases.push(this.createTestCase(currentTestCase, "Navigation Test", currentAction.reasoning)); 
                        currentTestCase = []; 
                    }
                    currentTestCase.push({
                        action: 'navigate', 
                        value: currentAction.url, 
                        assertion: 'Page should load successfully'
                    })
                    break; 
                case 'backtrack': //remove?
                    //Backtracking usually means we need to undo a previous action 
                    currentTestCase.pop(); 
                    break; 
            }
        }

        //Add any remaining steps as a test case 
        if (currentTestCase.length > 0) {
            testCases.push(this.createTestCase(currentTestCase, "Interaction Test", "Completing remaining interactions")); 
        }

        return testCases; 
    }

    private convertFormFillToSteps(action: FormFillAction): TestStep[] {
        const steps: TestStep[] = []; 

        //Add steps for each form field 
        for (const input of action.formData) {
            steps.push({
                action: 'fill', 
                selector: input.selector, 
                value: input.value, 
                assertion: 'Input should accept a value' //anything else?
            })
        }
        //Add submit step 
        steps.push({
            action: 'submit', 
            selector: action.submit_selector, 
            assertion: 'Form should submit successfully'
        })

        return steps; 
    }

    private createTestCase(steps: TestStep[], name: string, description: string): TestCase {
        return { id: crypto.randomUUID(), name, description, steps, tags: this.generateTags(steps), priority: this.getPriority(steps)}; 
    }

    private generateTags(steps: TestStep[]): string[] {
        const tags = new Set<string>(); 

        for (const step of steps) {
            if (step.action === 'fill' && step.selector?.includes('password')) {
                tags.add("authentication"); 
            }
            if (step.action === 'navigate') {
                tags.add("navigation"); 
            }
            if (step.action === 'click') {
                tags.add("click"); 
            }
            if (step.action === 'submit') {
                tags.add("submit"); 
            }
        }
        return Array.from(tags); 
    }

    private getPriority(steps: TestStep[]): 'high' | 'medium' | 'low' { //We can add or change logic here 
        if (steps.some(step => step.selector?.includes('password') || step.selector?.includes('login'))) {
            return 'high'; 
        }
        if (steps.some(step => step.selector?.includes('search') || step.selector?.includes('filter'))) {
            return 'medium'; 
        }
        if (steps.length > 5) {
            return 'medium'; 
        }
        return 'low'; 
    }

}