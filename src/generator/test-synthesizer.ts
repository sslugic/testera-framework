import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepRecord, JourneyGoal } from '../types/index.js';

export class TestSynthesizer {
  static synthesize(
    steps: StepRecord[],
    goal?: JourneyGoal,
    testName = 'Autonomous User Journey'
  ): string {
    const validSteps = steps.filter((s) => s.success && s.action.action !== 'finish');

    let code = `import { test, expect } from '@playwright/test';\n\n`;
    code += `/**\n`;
    code += ` * Test generated automatically by Testera Luna\n`;
    if (goal) {
      code += ` * Goal: ${goal.goal}\n`;
      code += ` * Target: ${goal.startUrl}\n`;
    }
    code += ` * Generated At: ${new Date().toISOString()}\n`;
    code += ` */\n`;
    code += `test('${testName.replace(/'/g, "\\'")}', async ({ page }) => {\n`;

    if (goal?.startUrl) {
      code += `  // Step 0: Navigate to target application\n`;
      code += `  await page.goto('${goal.startUrl}', { waitUntil: 'domcontentloaded' });\n\n`;
    }

    validSteps.forEach((step, index) => {
      const { action } = step;
      code += `  // Step ${index + 1}: ${action.rationale || action.action}\n`;

      let targetLocator = '';
      if (action.targetIndex && step.observationBefore.interactiveElements[action.targetIndex - 1]) {
        const el = step.observationBefore.interactiveElements[action.targetIndex - 1];
        if (el.testId) {
          targetLocator = `page.getByTestId('${el.testId}')`;
        } else if (el.role && el.name) {
          targetLocator = `page.getByRole('${el.role}', { name: '${el.name.replace(/'/g, "\\'")}' })`;
        } else if (el.name) {
          targetLocator = `page.getByText('${el.name.replace(/'/g, "\\'")}')`;
        } else {
          targetLocator = `page.locator('${el.selector.replace(/'/g, "\\'")}')`;
        }
      } else if (action.targetSelector) {
        targetLocator = `page.locator('${action.targetSelector.replace(/'/g, "\\'")}')`;
      }

      switch (action.action) {
        case 'navigate':
          code += `  await page.goto('${action.value || action.targetSelector}');\n`;
          break;
        case 'click':
          code += `  await ${targetLocator}.click();\n`;
          break;
        case 'fill':
          code += `  await ${targetLocator}.fill('${(action.value || '').replace(/'/g, "\\'")}');\n`;
          break;
        case 'select':
          code += `  await ${targetLocator}.selectOption('${(action.value || '').replace(/'/g, "\\'")}');\n`;
          break;
        case 'hover':
          code += `  await ${targetLocator}.hover();\n`;
          break;
        case 'press':
          code += `  await ${targetLocator ? `${targetLocator}.press` : 'page.keyboard.press'}('${action.key || action.value || 'Enter'}');\n`;
          break;
        case 'scroll':
          code += `  await page.mouse.wheel(0, ${action.direction === 'down' ? 400 : -400});\n`;
          break;
        case 'wait':
          code += `  await page.waitForTimeout(${action.value || 1000});\n`;
          break;
        case 'assert':
          code += `  await expect(${targetLocator}).toBeVisible();\n`;
          if (action.value) {
            code += `  await expect(${targetLocator}).toContainText('${action.value.replace(/'/g, "\\'")}');\n`;
          }
          break;
      }

      // Add state assertion if expected outcome was documented
      if (action.expectedOutcome) {
        code += `  // Expectation: ${action.expectedOutcome}\n`;
      }
      code += `\n`;
    });

    code += `});\n`;
    return code;
  }

  static async saveToFile(
    filePath: string,
    steps: StepRecord[],
    goal?: JourneyGoal,
    testName?: string
  ): Promise<void> {
    const code = this.synthesize(steps, goal, testName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, code, 'utf-8');
  }
}
