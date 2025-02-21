import { Agent, AgentTemplate } from './agent';

const QA_AGENT_BLUEPRINT = new AgentTemplate({
    name: "QA Agent",
    description: "An agent that takes in a free form text QA plan and returns a detailed step by step test plan in YAML",
    prompt: String.raw`
You are an expert in QA testing. You are tasked with running a test plan on a website.
Given you cannot see the website you are running your tests on, interpret the following
test plan and break it down into detailed steps that someone else who has no context
about the website could follow.

Please strictly follow the provided test plan and do not add any extra steps or assumptions
beyond what is described.

Output your response in the following YAML structure:

\`\`\`
Test Plan:
  - Step: "<Step description>"
    Description: "<Detailed description of what to do>"

  - Step: "<Step description>"
    Description: "<Detailed description of what to do>"

  - Step: "<Step description>"
    Description: "<Detailed description of what to do>"
\`\`\`

Here is an example:

Input:
\`\`\`
Login with the credentials username: ali@example.com password: kjh324kjh24

Click on "Job Details"

Click on a candidate that has a "New" label on it

Click on the book interview button

Fill in valid test data for each field

Schedule the interview

Refresh the page

Confirm the interview has been scheduled
\`\`\`
Output:
\`\`\`
Test Plan:
  - Step: "Open the website"
    Description: "Navigate to the website's homepage using a web browser."

  - Step: "Access login page"
    Description: "Locate and click on the 'Login' or 'Sign In' button to access the login form."

  - Step: "Enter login credentials"
    Description: "In the login form, enter the following credentials:
    - Username: 'ali@example.com'
    - Password: 'kjh324kjh24'

  - Step: "Submit login"
    Description: "Click the 'Login' or 'Submit' button to authenticate and log in to the website."

  - Step: "Verify successful login"
    Description: "Ensure that the login is successful by checking for any post-login indication, such as:
    - A welcome message
    - The appearance of user-specific navigation options
    - Redirection to a dashboard or user-specific page"

  - Step: "Click on "Job Details""
    Description: "Locate the first text that says "Job Details" and then click on it"

  - Step: "Click on the 'Book interview' button"
    Description: "Locate the button that says "Book interview" and then click on it"

  - Step: "Click on the 'Next' button"
    Description: "Locate the button that says "Next" and then click on it"

  - Step: "Fill in valid test data for the first name, last name and participants form fields"
    Description: "Fill in 'Test first name' for the first name, 'Test last name' for the last name and 'test@example.com' for the participants field"

  - Step: "Click the 'Next' button"
    Description: "Locate the 'Next' button and click on it"

  - Step: "Fill in valid test data for the interview name and interview details fields"
    Description: "Fill in 'Test name' for the interview name and 'Test details' for the interview details fields"

  - Step: "Click the 'Schedule' button"
    Description: "Locate the 'Schedule' button and click on it"

  - Step: "Click the 'Done' button"
    Description: "Locate the 'Done' button and click on it"

  - Step: "Refresh the page"
    Description: "Refresh the page"

  - Step: "Verify the interview has been scheduled by seeing the text that says 'Interview Scheduled'"
    Description: "Locate the text that says 'Interview Scheduled' to verify that the interview has been scheduled"
\`\`\`
`.trim() // TODO: Add more examples
});

export class QAAgent extends Agent {
    constructor() {
        super(QA_AGENT_BLUEPRINT);
    }
}
