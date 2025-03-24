"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var test_1 = require("@playwright/test");
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var browser, page, timeout, currentUrl, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.chromium.launch()];
            case 1:
                browser = _a.sent();
                return [4 /*yield*/, browser.newPage()];
            case 2:
                page = _a.sent();
                timeout = 30000;
                page.setDefaultTimeout(timeout);
                // Set viewport
                return [4 /*yield*/, page.setViewportSize({
                        width: 1002,
                        height: 845
                    })];
            case 3:
                // Set viewport
                _a.sent();
                _a.label = 4;
            case 4:
                _a.trys.push([4, 35, , 37]);
                // Navigate to login page first
                return [4 /*yield*/, page.goto('https://recruit.tern-group.com/en/login')];
            case 5:
                // Navigate to login page first
                _a.sent();
                console.log("Starting login process...");
                return [4 /*yield*/, page.waitForLoadState('networkidle')];
            case 6:
                _a.sent();
                return [4 /*yield*/, page.getByPlaceholder(/email/i).first().fill("alisarraf20@gmail.com")];
            case 7:
                _a.sent();
                return [4 /*yield*/, page.getByPlaceholder(/password/i).first().fill("V2UUBninEZ2MbX9!")];
            case 8:
                _a.sent();
                return [4 /*yield*/, page.waitForTimeout(2000)];
            case 9:
                _a.sent();
                return [4 /*yield*/, page.getByRole('button', { name: 'Login' }).first().click()];
            case 10:
                _a.sent();
                console.log("Login button clicked, waiting for navigation...");
                return [4 /*yield*/, page.waitForLoadState('networkidle', { timeout: 60000 })];
            case 11:
                _a.sent();
                console.log("Navigated to job page");
                currentUrl = page.url();
                console.log('Current URL after login:', currentUrl);
                if (!currentUrl.includes('login')) return [3 /*break*/, 13];
                return [4 /*yield*/, page.waitForSelector('text=Your Jobs', { timeout: 10000 })];
            case 12:
                _a.sent();
                currentUrl = page.url();
                _a.label = 13;
            case 13:
                console.log("Post-login URL:", currentUrl);
                // Create new job
                return [4 /*yield*/, Promise.race([
                        page.getByRole('button', { name: 'Create new job' }).first().click({ position: { x: 66.9375, y: 9 }, timeout: timeout }),
                        page.locator('button:has-text("Create new job") > span').first().click({ position: { x: 66.9375, y: 9 }, timeout: timeout }),
                        page.locator('xpath=/html/body/div[3]/div/div[2]/div[2]/button/span').click({ position: { x: 66.9375, y: 9 }, timeout: timeout }),
                        page.locator('button:has-text("Create new job")').first().click({ position: { x: 66.9375, y: 9 }, timeout: timeout })
                    ])];
            case 14:
                // Create new job
                _a.sent();
                console.log('Clicked Create new job');
                // Wait for the job form to load
                return [4 /*yield*/, page.waitForLoadState('domcontentloaded')];
            case 15:
                // Wait for the job form to load
                _a.sent();
                //await page.waitForSelector('[aria-label="Job Name*"]', { timeout });
                console.log('Job form loaded');
                // Fill job name
                return [4 /*yield*/, Promise.race([
                        page.getByRole('textbox', { name: 'Job Name*' }).click({ position: { x: 296, y: 26 }, timeout: timeout }),
                        page.getByLabel('Job Name*').click({ position: { x: 296, y: 26 }, timeout: timeout }),
                        page.locator('#a87cd872-d9a1-42cd-9e97-2099ca791507').click({ position: { x: 296, y: 26 }, timeout: timeout }),
                        page.locator('xpath=//*[@id="a87cd872-d9a1-42cd-9e97-2099ca791507"]').click({ position: { x: 296, y: 26 }, timeout: timeout })
                    ])];
            case 16:
                // Fill job name
                _a.sent();
                console.log('Filled job name');
                // Fill years of experience
                // Fill years of experience
                return [4 /*yield*/, Promise.race([
                        page.getByRole('spinbutton', { name: 'Years of Experience*' })
                            .click({ position: { x: 153, y: 18 }, timeout: timeout })
                            .then(function () { return console.log('Used: getByRole spinbutton'); }),
                        page.getByLabel('Years of Experience*')
                            .click({ position: { x: 153, y: 18 }, timeout: timeout })
                            .then(function () { return console.log('Used: getByLabel'); }),
                        //page.locator('#02c0f630-6842-4a4c-a04e-6b51e9a21017')
                        //    .click({ position: { x: 153, y: 18 }, timeout })
                        //    .then(() => console.log('Used: ID selector')),
                        page.locator('xpath=//*[@id="02c0f630-6842-4a4c-a04e-6b51e9a21017"]')
                            .click({ position: { x: 153, y: 18 }, timeout: timeout })
                            .then(function () { return console.log('Used: xpath selector'); })
                    ])];
            case 17:
                // Fill years of experience
                // Fill years of experience
                _a.sent();
                return [4 /*yield*/, Promise.race([
                        page.getByRole('spinbutton', { name: 'Years of Experience*' })
                            .fill('2')
                            .then(function () { return console.log('Used: getByRole spinbutton for fill'); }),
                        page.getByLabel('Years of Experience*')
                            .fill('2')
                            .then(function () { return console.log('Used: getByLabel for fill'); }),
                        //page.locator('#02c0f630-6842-4a4c-a04e-6b51e9a21017')
                        //    .fill('2')
                        //    .then(() => console.log('Used: ID selector for fill')),
                        page.locator('xpath=//*[@id="02c0f630-6842-4a4c-a04e-6b51e9a21017"]')
                            .fill('2')
                            .then(function () { return console.log('Used: xpath selector for fill'); })
                    ])];
            case 18:
                _a.sent();
                console.log('Filled years of experience');
                // Select profession
                return [4 /*yield*/, page.waitForSelector('div.rs__input-container', { timeout: timeout })];
            case 19:
                // Select profession
                _a.sent();
                return [4 /*yield*/, Promise.race([
                        page.locator('div.flex-col > div > div > div.flex div.rs__input-container').first().click({ position: { x: 79, y: 21 }, timeout: timeout }),
                        page.locator('xpath=//*[@data-testid="modal"]/div[3]/div/div/div[2]/div[2]/div/div[1]/div[2]').click({ position: { x: 79, y: 21 }, timeout: timeout })
                    ])];
            case 20:
                _a.sent();
                return [4 /*yield*/, page.waitForSelector('[role="option"]', { timeout: timeout })];
            case 21:
                _a.sent();
                return [4 /*yield*/, Promise.race([
                        page.getByRole('option', { name: 'Physiotherapist' }).first().click({ position: { x: 64, y: 2 }, timeout: timeout }),
                        page.locator('#react-select-3-option-5').first().click({ position: { x: 64, y: 2 }, timeout: timeout }),
                        page.locator('xpath=//*[@id="react-select-3-option-5"]').click({ position: { x: 64, y: 2 }, timeout: timeout })
                    ])];
            case 22:
                _a.sent();
                console.log('Selected profession');
                // Select English test
                return [4 /*yield*/, page.waitForSelector('div.rs__input-container', { timeout: timeout })];
            case 23:
                // Select English test
                _a.sent();
                return [4 /*yield*/, Promise.race([
                        page.locator('div:nth-of-type(4) > div > div:nth-of-type(1) div.rs__input-container').first().click({ position: { x: 166, y: 2 }, timeout: timeout }),
                        page.locator('xpath=//*[@data-testid="modal"]/div[3]/div/div/div[4]/div/div[1]/div/div/div[1]/div[2]').click({ position: { x: 166, y: 2 }, timeout: timeout })
                    ])];
            case 24:
                _a.sent();
                return [4 /*yield*/, page.waitForSelector('[role="option"]', { timeout: timeout })];
            case 25:
                _a.sent();
                return [4 /*yield*/, Promise.race([
                        page.getByRole('option', { name: 'OET' }).first().click({ position: { x: 137, y: 21 }, timeout: timeout }),
                        page.locator('#react-select-4-option-1').first().click({ position: { x: 137, y: 21 }, timeout: timeout }),
                        page.locator('xpath=//*[@id="react-select-4-option-1"]').click({ position: { x: 137, y: 21 }, timeout: timeout })
                    ])];
            case 26:
                _a.sent();
                console.log('Selected English test');
                // Select grade
                return [4 /*yield*/, page.waitForSelector('div.rs__input-container', { timeout: timeout })];
            case 27:
                // Select grade
                _a.sent();
                return [4 /*yield*/, Promise.race([
                        page.locator('div:nth-of-type(4) > div > div:nth-of-type(2) div.rs__input-container').first().click({ position: { x: 76.1640625, y: 21 }, timeout: timeout }),
                        page.locator('xpath=//*[@data-testid="modal"]/div[3]/div/div/div[4]/div/div[2]/div/div/div[1]/div[2]').click({ position: { x: 76.1640625, y: 21 }, timeout: timeout })
                    ])];
            case 28:
                _a.sent();
                return [4 /*yield*/, page.waitForSelector('[role="option"]', { timeout: timeout })];
            case 29:
                _a.sent();
                return [4 /*yield*/, Promise.race([
                        page.getByRole('option', { name: 'D' }).first().click({ position: { x: 45.1640625, y: 1 }, timeout: timeout }),
                        page.locator('#react-select-5-option-3').first().click({ position: { x: 45.1640625, y: 1 }, timeout: timeout }),
                        page.locator('xpath=//*[@id="react-select-5-option-3"]').click({ position: { x: 45.1640625, y: 1 }, timeout: timeout })
                    ])];
            case 30:
                _a.sent();
                console.log('Selected grade');
                // Fill salary
                return [4 /*yield*/, page.waitForSelector('[aria-label="Enter Salary"]', { timeout: timeout })];
            case 31:
                // Fill salary
                _a.sent();
                return [4 /*yield*/, Promise.race([
                        page.getByLabel('Enter Salary').first().click({ position: { x: 188, y: 35 }, timeout: timeout }),
                        page.locator('#be13a291-5296-4f4b-bf8e-d2489ac7f414').first().click({ position: { x: 188, y: 35 }, timeout: timeout }),
                        page.locator('xpath=//*[@id="be13a291-5296-4f4b-bf8e-d2489ac7f414"]').click({ position: { x: 188, y: 35 }, timeout: timeout })
                    ])];
            case 32:
                _a.sent();
                return [4 /*yield*/, Promise.race([
                        page.getByLabel('Enter Salary').first().fill('12122'),
                        page.locator('#be13a291-5296-4f4b-bf8e-d2489ac7f414').first().fill('12122'),
                        page.locator('xpath=//*[@id="be13a291-5296-4f4b-bf8e-d2489ac7f414"]').fill('12122')
                    ])];
            case 33:
                _a.sent();
                console.log('Filled salary');
                return [4 /*yield*/, browser.close()];
            case 34:
                _a.sent();
                console.log('Test completed successfully');
                return [3 /*break*/, 37];
            case 35:
                err_1 = _a.sent();
                console.error('Test failed:', err_1);
                return [4 /*yield*/, browser.close()];
            case 36:
                _a.sent();
                process.exit(1);
                return [3 /*break*/, 37];
            case 37: return [2 /*return*/];
        }
    });
}); })().catch(function (err) {
    console.error('Fatal error:', err);
    process.exit(1);
});
