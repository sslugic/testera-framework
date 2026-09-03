import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepRecord, JourneyGoal } from '../types/index.js';
import { deriveFinalAssertions, deriveStepAssertions } from './assertion-synthesizer.js';
import { elementLocatorCode, escapeJsString } from './locator-code.js';

export interface TestSynthesizeOptions {
  storageStatePath?: string;
  targetTestFilePath?: string;
}

export class TestSynthesizer {
  static synthesize(
    steps: StepRecord[],
    goal?: JourneyGoal,
    testName = 'Autonomous User Journey',
    options?: TestSynthesizeOptions
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

    const statePath = options?.storageStatePath || goal?.storageStatePath;
    if (statePath) {
      let relPath = statePath;
      if (options?.targetTestFilePath) {
        relPath = path.relative(path.dirname(options.targetTestFilePath), statePath);
        if (!relPath.startsWith('.')) relPath = `./${relPath}`;
      }
      code += `// Reuse authenticated session to bypass redundant login/signup\n`;
      code += `test.use({ storageState: '${escapeJsString(relPath)}' });\n\n`;
    }

    code += `test('${escapeJsString(testName)}', async ({ page }) => {\n`;

    if (goal?.startUrl) {
      code += `  // Step 0: Navigate to target application\n`;
      code += `  await page.goto('${escapeJsString(goal.startUrl)}', { waitUntil: 'domcontentloaded' });\n\n`;
    }

    validSteps.forEach((step, index) => {
      const { action } = step;
      code += `  // Step ${index + 1}: ${action.rationale || action.action}\n`;

      let targetLocator = '';
      if (action.targetIndex && step.observationBefore.interactiveElements[action.targetIndex - 1]) {
        const el = step.observationBefore.interactiveElements[action.targetIndex - 1];
        targetLocator = elementLocatorCode(el, step.observationBefore.interactiveElements);
      } else if (action.targetSelector) {
        targetLocator = `page.locator('${escapeJsString(action.targetSelector)}')`;
      }

      switch (action.action) {
        case 'navigate':
          code += `  await page.goto('${escapeJsString(action.value || action.targetSelector || '')}');\n`;
          break;
        case 'click':
          code += `  await ${targetLocator}.click();\n`;
          break;
        case 'fill':
          code += `  await ${targetLocator}.fill('${escapeJsString(action.value || '')}');\n`;
          break;
        case 'select':
          code += `  await ${targetLocator}.selectOption('${escapeJsString(action.value || '')}');\n`;
          break;
        case 'hover':
          code += `  await ${targetLocator}.hover();\n`;
          break;
        case 'press':
          code += `  await ${targetLocator ? `${targetLocator}.press` : 'page.keyboard.press'}('${escapeJsString(action.key || action.value || 'Enter')}');\n`;
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
            code += `  await expect(${targetLocator}).toContainText('${escapeJsString(action.value)}');\n`;
          }
          break;
      }

      const derived = deriveStepAssertions(step);
      if (derived.length > 0) {
        if (action.expectedOutcome) {
          code += `  // Verify: ${action.expectedOutcome}\n`;
        }
        for (const assertion of derived) {
          code += `  ${assertion.code}\n`;
        }
      } else if (action.expectedOutcome) {
        code += `  // Expectation: ${action.expectedOutcome}\n`;
      }

      code += `\n`;
    });

    const finalAssertions = deriveFinalAssertions(validSteps, goal);
    if (finalAssertions.length > 0) {
      code += `  // Final journey state\n`;
      for (const assertion of finalAssertions) {
        code += `  ${assertion.code}\n`;
      }
      code += `\n`;
    }

    code += `});\n`;
    return code;
  }

  static async saveToFile(
    filePath: string,
    steps: StepRecord[],
    goal?: JourneyGoal,
    testName?: string,
    options?: TestSynthesizeOptions
  ): Promise<void> {
    const code = this.synthesize(steps, goal, testName, {
      ...options,
      targetTestFilePath: filePath,
      storageStatePath: options?.storageStatePath || goal?.storageStatePath,
    });
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, code, 'utf-8');
  }
}
