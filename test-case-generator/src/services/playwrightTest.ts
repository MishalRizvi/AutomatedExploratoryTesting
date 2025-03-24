import { chromium, type Page } from '@playwright/test';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const timeout = 30000; // Increased default timeout
    page.setDefaultTimeout(timeout);

    // Set viewport
    await page.setViewportSize({
        width: 1002,
        height: 845
    });

    try {
        // Navigate to login page first
        await page.goto('https://recruit.tern-group.com/en/login');
        console.log("Starting login process...");
        
        await page.waitForLoadState('networkidle');
        await page.getByPlaceholder(/email/i).first().fill("alisarraf20@gmail.com");
        await page.getByPlaceholder(/password/i).first().fill("V2UUBninEZ2MbX9!");
        await page.waitForTimeout(2000);
        
        await page.getByRole('button', { name: 'Login' }).first().click();
        console.log("Login button clicked, waiting for navigation...");
        
        await page.waitForLoadState('networkidle', { timeout: 60000 });
        
        console.log("Navigated to job page");

        // Debug: Let's see where we are
        let currentUrl = page.url();
        console.log('Current URL after login:', currentUrl);

        // If we're still on the login page, wait for the "Your Jobs" text and try again
        if (currentUrl.includes('login')) {
            await page.waitForSelector('text=Your Jobs', { timeout: 10000 });
            currentUrl = page.url();
        }

        console.log("Post-login URL:", currentUrl);



        // Create new job
        await Promise.race([
            page.getByRole('button', { name: 'Create new job' }).first().click({ position: { x: 66.9375, y: 9 }, timeout }),
            page.locator('button:has-text("Create new job") > span').first().click({ position: { x: 66.9375, y: 9 }, timeout }),
            page.locator('xpath=/html/body/div[3]/div/div[2]/div[2]/button/span').click({ position: { x: 66.9375, y: 9 }, timeout }),
            page.locator('button:has-text("Create new job")').first().click({ position: { x: 66.9375, y: 9 }, timeout })
        ]);
        console.log('Clicked Create new job');

        // Wait for the job form to load
        await page.waitForLoadState('domcontentloaded');
        //await page.waitForSelector('[aria-label="Job Name*"]', { timeout });
        console.log('Job form loaded');

        // Fill job name
        await Promise.race([
            page.getByRole('textbox', { name: 'Job Name*' }).click({ position: { x: 296, y: 26 }, timeout }),
            page.getByLabel('Job Name*').click({ position: { x: 296, y: 26 }, timeout }),
            page.locator('#a87cd872-d9a1-42cd-9e97-2099ca791507').click({ position: { x: 296, y: 26 }, timeout }),
            page.locator('xpath=//*[@id="a87cd872-d9a1-42cd-9e97-2099ca791507"]').click({ position: { x: 296, y: 26 }, timeout })
        ]);

        console.log('Filled job name');

        // Fill years of experience
        // Fill years of experience
        await Promise.race([
            page.getByRole('spinbutton', { name: 'Years of Experience*' })
                .click({ position: { x: 153, y: 18 }, timeout })
                .then(() => console.log('Used: getByRole spinbutton')),
            page.getByLabel('Years of Experience*')
                .click({ position: { x: 153, y: 18 }, timeout })
                .then(() => console.log('Used: getByLabel')),
            //page.locator('#02c0f630-6842-4a4c-a04e-6b51e9a21017')
            //    .click({ position: { x: 153, y: 18 }, timeout })
            //    .then(() => console.log('Used: ID selector')),
            page.locator('xpath=//*[@id="02c0f630-6842-4a4c-a04e-6b51e9a21017"]')
                .click({ position: { x: 153, y: 18 }, timeout })
                .then(() => console.log('Used: xpath selector'))
        ]);

        await Promise.race([
            page.getByRole('spinbutton', { name: 'Years of Experience*' })
                .fill('2')
                .then(() => console.log('Used: getByRole spinbutton for fill')),
            page.getByLabel('Years of Experience*')
                .fill('2')
                .then(() => console.log('Used: getByLabel for fill')),
            //page.locator('#02c0f630-6842-4a4c-a04e-6b51e9a21017')
            //    .fill('2')
            //    .then(() => console.log('Used: ID selector for fill')),
            page.locator('xpath=//*[@id="02c0f630-6842-4a4c-a04e-6b51e9a21017"]')
                .fill('2')
                .then(() => console.log('Used: xpath selector for fill'))
        ]);
        console.log('Filled years of experience');

        // Select profession
        await page.waitForSelector('div.rs__input-container', { timeout });
        await Promise.race([
            page.locator('div.flex-col > div > div > div.flex div.rs__input-container').first().click({ position: { x: 79, y: 21 }, timeout }),
            page.locator('xpath=//*[@data-testid="modal"]/div[3]/div/div/div[2]/div[2]/div/div[1]/div[2]').click({ position: { x: 79, y: 21 }, timeout })
        ]);

        await page.waitForSelector('[role="option"]', { timeout });
        await Promise.race([
            page.getByRole('option', { name: 'Physiotherapist' }).first().click({ position: { x: 64, y: 2 }, timeout }),
            page.locator('#react-select-3-option-5').first().click({ position: { x: 64, y: 2 }, timeout }),
            page.locator('xpath=//*[@id="react-select-3-option-5"]').click({ position: { x: 64, y: 2 }, timeout })
        ]);
        console.log('Selected profession');

        // Select English test
        await page.waitForSelector('div.rs__input-container', { timeout });
        await Promise.race([
            page.locator('div:nth-of-type(4) > div > div:nth-of-type(1) div.rs__input-container').first().click({ position: { x: 166, y: 2 }, timeout }),
            page.locator('xpath=//*[@data-testid="modal"]/div[3]/div/div/div[4]/div/div[1]/div/div/div[1]/div[2]').click({ position: { x: 166, y: 2 }, timeout })
        ]);

        await page.waitForSelector('[role="option"]', { timeout });
        await Promise.race([
            page.getByRole('option', { name: 'OET' }).first().click({ position: { x: 137, y: 21 }, timeout }),
            page.locator('#react-select-4-option-1').first().click({ position: { x: 137, y: 21 }, timeout }),
            page.locator('xpath=//*[@id="react-select-4-option-1"]').click({ position: { x: 137, y: 21 }, timeout })
        ]);
        console.log('Selected English test');

        // Select grade
        await page.waitForSelector('div.rs__input-container', { timeout });
        await Promise.race([
            page.locator('div:nth-of-type(4) > div > div:nth-of-type(2) div.rs__input-container').first().click({ position: { x: 76.1640625, y: 21 }, timeout }),
            page.locator('xpath=//*[@data-testid="modal"]/div[3]/div/div/div[4]/div/div[2]/div/div/div[1]/div[2]').click({ position: { x: 76.1640625, y: 21 }, timeout })
        ]);

        await page.waitForSelector('[role="option"]', { timeout });
        await Promise.race([
            page.getByRole('option', { name: 'D' }).first().click({ position: { x: 45.1640625, y: 1 }, timeout }),
            page.locator('#react-select-5-option-3').first().click({ position: { x: 45.1640625, y: 1 }, timeout }),
            page.locator('xpath=//*[@id="react-select-5-option-3"]').click({ position: { x: 45.1640625, y: 1 }, timeout })
        ]);
        console.log('Selected grade');

        // Fill salary
        await page.waitForSelector('[aria-label="Enter Salary"]', { timeout });
        await Promise.race([
            page.getByLabel('Enter Salary').first().click({ position: { x: 188, y: 35 }, timeout }),
            page.locator('#be13a291-5296-4f4b-bf8e-d2489ac7f414').first().click({ position: { x: 188, y: 35 }, timeout }),
            page.locator('xpath=//*[@id="be13a291-5296-4f4b-bf8e-d2489ac7f414"]').click({ position: { x: 188, y: 35 }, timeout })
        ]);

        await Promise.race([
            page.getByLabel('Enter Salary').first().fill('12122'),
            page.locator('#be13a291-5296-4f4b-bf8e-d2489ac7f414').first().fill('12122'),
            page.locator('xpath=//*[@id="be13a291-5296-4f4b-bf8e-d2489ac7f414"]').fill('12122')
        ]);
        console.log('Filled salary');

        await browser.close();
        console.log('Test completed successfully');

    } catch (err) {
        console.error('Test failed:', err);
        await browser.close();
        process.exit(1);
    }

})().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});