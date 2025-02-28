import OpenAI from 'openai';
import { State } from './Crawler';

export class LLMAgent {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    async call(currentUrl: string, currentState: State | undefined): Promise<{isSameWorkflow: boolean; reason: string;}> {
        if (!currentState) return { isSameWorkflow: false, reason: 'No state' };

        const prompt = `As a web user experience expert, analyze if this page is part of the same user interaction workflow.

        Current page: ${currentUrl}
        Page title: ${currentState.title}

        Available interactions:
        - ${currentState.interactions.forms.length} forms
        - ${currentState.interactions.buttons.length} buttons
        - ${currentState.interactions.links.length} links

        Context: A user workflow is a series of related interactions to accomplish a specific task (like "contact us" or "checkout").
        Common workflows include:
        1. Contact/Support flow (contact form → confirmation)
        2. Authentication (login/signup → dashboard)
        3. E-commerce (product → cart → checkout)
        4. Account management (settings → update → confirmation)

        Question: Based on the page title and available interactions, is this page likely part of an existing user workflow or the start of a new one?

        Respond in JSON format:
        {
            "isSameWorkflow": boolean,
            "reason": "brief explanation"
        }`;

        const response = await this.openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { 
                    role: "system", 
                    content: "You are a web UX expert who analyzes user workflows." 
                },
                { 
                    role: "user", 
                    content: prompt 
                }
            ]
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');
        return {
            isSameWorkflow: result.isSameWorkflow,
            reason: result.reason
        };
    }
}