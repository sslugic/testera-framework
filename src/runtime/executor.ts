import type { Page, Locator } from 'playwright';
import type { UIAction, InteractiveElement, Observation } from '../types/index.js';

export interface ExecutionResult {
  success: boolean;
  duration: number;
  error?: string;
  targetUsed?: string;
  actualAction: UIAction;
}

export class ActionExecutor {
  static async execute(
    page: Page,
    action: UIAction,
    observation: Observation
  ): Promise<ExecutionResult> {
    const start = Date.now();
    let targetUsed = '';

    try {
      switch (action.action) {
        case 'navigate': {
          const dest = action.value || action.targetSelector;
          if (!dest) throw new Error('Navigate action missing URL');
          targetUsed = dest;
          await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(500);
          break;
        }

        case 'click': {
          const { locator, description } = await this.resolveLocator(page, action, observation);
          targetUsed = description;
          await this.highlightElement(locator);
          await locator.click({ timeout: 7000 });
          await page.waitForTimeout(500);
          break;
        }

        case 'fill': {
          const { locator, description } = await this.resolveLocator(page, action, observation);
          targetUsed = description;
          await this.highlightElement(locator);
          await locator.fill(action.value ?? '', { timeout: 7000 });
          await page.waitForTimeout(300);
          break;
        }

        case 'select': {
          const { locator, description } = await this.resolveLocator(page, action, observation);
          targetUsed = description;
          await this.highlightElement(locator);
          await locator.selectOption(action.value ?? '', { timeout: 7000 });
          await page.waitForTimeout(300);
          break;
        }

        case 'hover': {
          const { locator, description } = await this.resolveLocator(page, action, observation);
          targetUsed = description;
          await locator.hover({ timeout: 7000 });
          await page.waitForTimeout(300);
          break;
        }

        case 'press': {
          const key = action.key || action.value || 'Enter';
          if (action.targetIndex !== undefined || action.targetSelector) {
            const { locator, description } = await this.resolveLocator(page, action, observation);
            targetUsed = description;
            await locator.press(key);
          } else {
            await page.keyboard.press(key);
          }
          await page.waitForTimeout(400);
          break;
        }

        case 'scroll': {
          const dir = action.direction || 'down';
          const distance = dir === 'down' ? 400 : -400;
          await page.mouse.wheel(0, distance);
          await page.waitForTimeout(400);
          break;
        }

        case 'wait': {
          const waitMs = parseInt(action.value || '1000', 10);
          await page.waitForTimeout(Math.min(waitMs, 5000));
          break;
        }

        case 'assert': {
          const { locator, description } = await this.resolveLocator(page, action, observation);
          targetUsed = description;
          const isVisible = await locator.isVisible({ timeout: 5000 });
          if (!isVisible) {
            throw new Error(`Assertion failed: element ${description} is not visible`);
          }
          if (action.value) {
            const text = await locator.innerText();
            if (!text.includes(action.value)) {
              throw new Error(`Assertion failed: element ${description} does not contain text "${action.value}" (found "${text.trim()}")`);
            }
          }
          break;
        }

        case 'finish': {
          // Goal complete or user instructed finish
          break;
        }

        default:
          throw new Error(`Unsupported action type: ${(action as any).action}`);
      }

      return {
        success: true,
        duration: Date.now() - start,
        targetUsed,
        actualAction: action,
      };
    } catch (err: any) {
      return {
        success: false,
        duration: Date.now() - start,
        error: err?.message || String(err),
        targetUsed,
        actualAction: action,
      };
    }
  }

  private static async resolveLocator(
    page: Page,
    action: UIAction,
    observation: Observation
  ): Promise<{ locator: Locator; description: string }> {
    // 1. Try resolving by index in observation
    if (action.targetIndex !== undefined && action.targetIndex > 0) {
      const el = observation.interactiveElements[action.targetIndex - 1];
      if (el) {
        // Strategy A: Role + Name
        if (el.role && el.name && this.isValidRole(el.role)) {
          const loc = page.getByRole(el.role as any, { name: el.name, exact: false }).first();
          if (await loc.isVisible().catch(() => false)) {
            return { locator: loc, description: `role="${el.role}", name="${el.name}"` };
          }
        }

        // Strategy B: Test ID
        if (el.testId) {
          const loc = page.getByTestId(el.testId).first();
          if (await loc.isVisible().catch(() => false)) {
            return { locator: loc, description: `data-testid="${el.testId}"` };
          }
        }

        // Strategy C: Specific CSS selector
        if (el.selector) {
          const loc = page.locator(el.selector).first();
          if (await loc.isVisible().catch(() => false)) {
            return { locator: loc, description: `css="${el.selector}"` };
          }
        }

        // Strategy D: Text match
        if (el.name) {
          const loc = page.getByText(el.name, { exact: false }).first();
          if (await loc.isVisible().catch(() => false)) {
            return { locator: loc, description: `text="${el.name}"` };
          }
        }
      }
    }

    // 2. Direct selector passed in action
    if (action.targetSelector) {
      const loc = page.locator(action.targetSelector).first();
      return { locator: loc, description: action.targetSelector };
    }

    throw new Error(
      `Could not resolve locator for action ${action.action} (targetIndex: ${action.targetIndex}, targetSelector: ${action.targetSelector})`
    );
  }

  private static isValidRole(role: string): boolean {
    const validRoles = new Set([
      'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote',
      'button', 'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox',
      'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory',
      'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell',
      'group', 'heading', 'img', 'insertion', 'link', 'list', 'listbox', 'listitem',
      'log', 'main', 'marquee', 'math', 'meter', 'menu', 'menubar', 'menuitem',
      'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option',
      'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region',
      'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator',
      'slider', 'spinbutton', 'status', 'strong', 'subscript', 'superscript', 'switch',
      'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer',
      'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem'
    ]);
    return validRoles.has(role);
  }

  private static async highlightElement(locator: Locator): Promise<void> {
    try {
      await locator.evaluate((el: HTMLElement) => {
        const origOutline = el.style.outline;
        const origTransition = el.style.transition;
        el.style.transition = 'outline 0.15s ease-in-out';
        el.style.outline = '3px solid #6366f1';
        setTimeout(() => {
          el.style.outline = origOutline;
          el.style.transition = origTransition;
        }, 300);
      });
    } catch {
      // Ignore highlight errors on unattached elements
    }
  }
}
