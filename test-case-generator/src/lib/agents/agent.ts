import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from the .env file
dotenv.config();

interface AgentTemplateParams {
  name: string;
  description?: string;
  prompt: string;
}

class AgentTemplate {
  private _name: string;
  private _description: string;
  private _prompt: string;

  constructor(params: AgentTemplateParams) {
    this._name = params.name;
    this._description = params.description ?? 'No description provided';
    this._prompt = params.prompt;
  }

  get name(): string {
    return this._name;
  }

  get description(): string {
    return this._description;
  }

  get prompt(): string {
    return this._prompt;
  }
}

export interface AgentRequest {
  query: string;
  base64Image?: string;
  stripMarkdown?: boolean;
  fileOutput?: string;
}

class Agent {
  private openai: OpenAI;
  private template: AgentTemplate;

  constructor(template: AgentTemplate) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set.");
    }
    this.openai = new OpenAI({ apiKey });
    this.template = template;
  }

  get name(): string {
    return this.template.name;
  }

  private stripMarkdown(output: string): string {
    return output
      // Remove triple backticks and language tags plus any leading text
      .replace(/.*```[a-z]*\n?/g, '')
      // Remove closing triple backticks plus any trailing text
      .replace(/```.*/g, '')
      .trim();
  }

  async run(request: AgentRequest): Promise<string> {
    try {
      const messages: any[] = [
        { role: 'system', content: this.template.prompt }
      ];

      if (request.base64Image) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: request.query },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${request.base64Image}`
              }
            }
          ]
        });
      } else {
        messages.push({ role: 'user', content: request.query });
      }
      console.log('request in role user', request);
      console.log('messages', messages);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.01,
        store: false,
        response_format: {
          type: "text"
        }
      });

      console.log('response', response);

      let result = response.choices[0]?.message?.content ?? "null";
      console.log('result', result);

      // result = request.stripMarkdown ? this.stripMarkdown(result) : result;

      // if (request.fileOutput) {
      //   const absolutePath = path.resolve(request.fileOutput);
      //   const directory = path.dirname(absolutePath);

      //   try {
      //     await fs.promises.access(directory);
      //   } catch (error) {
      //     throw new Error(`Directory does not exist: ${directory}`);
      //   }

      //   await fs.promises.writeFile(absolutePath, result, 'utf-8');
      // }

      return result;
    } catch (error) {
        console.error("Error during OpenAI API call:", error);
        return "An error occurred while processing your request.";
    }
  }
}

export { Agent, AgentTemplate };
