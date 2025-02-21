import { Agent, AgentTemplate } from './agent';

const INSPECTOR_AGENT_PROMPT = String.raw`
You are a vision based agent inside of a QA automation flow. You have access to the following function:

\`\`\`typescript
/**
* Finds an element containing the specified text.
* @param text - The text to search for.
* @returns The bounding rectangle of the found element or null if not found.
*/
find_element_with_text(text: string): Promise<{ x: number; y: number; width: number; height: number } | null>;
\`\`\`

You will be given a visual descriptor of an element to find. 
Return the input you would give to find_element_with_text which is the x coordinates, y coordinates, height and width of the bounding box of the element or return
an empty string if the element is not within the image.

Example input:

"second article on the right"

Example output:

{ x: 100, y: 200, width: 100, height: 200 }

where "xyz" is the title of the "second article on the right"

If the visual descriptor does not appear in the image return: {x: null, y: null, width: null, height: null}


IMPORTANT: Only return the input to the function call, nothing else.
Do not include find_element_with_text in the output, only the text.
`.trim();

export class ElementFinderAgent extends Agent {
  constructor() {
    const blueprint = new AgentTemplate({
        name: "Element Finder Agent",
        description: "An agent that helps find elements in images based on visual descriptions and returns the bounding box of that element on the page. Otherwise, it returns an empty string",
        prompt: INSPECTOR_AGENT_PROMPT
    });
    super(blueprint);
  }
} 