import type { Page } from 'playwright';
import type { InteractiveElement } from '../types/index.js';

export interface A11yExtractionResult {
  treeText: string;
  elements: InteractiveElement[];
  domMetrics: {
    elementCount: number;
    formCount: number;
    headingCount: number;
  };
}

export class A11yTreeExtractor {
  static async extract(page: Page): Promise<A11yExtractionResult> {
    const rawData = await page.evaluate(`(() => {
      const isVisible = (elem) => {
        if (!elem) return false;
        const style = window.getComputedStyle(elem);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = elem.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0;
      };

      const getAccessibleName = (elem) => {
        const ariaLabel = elem.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

        const labelledBy = elem.getAttribute('aria-labelledby');
        if (labelledBy) {
          const labelElem = document.getElementById(labelledBy);
          if (labelElem && labelElem.textContent) return labelElem.textContent.trim();
        }

        if (elem instanceof HTMLInputElement || elem instanceof HTMLTextAreaElement) {
          if (elem.placeholder) return elem.placeholder.trim();
          if (elem.labels && elem.labels.length > 0 && elem.labels[0].textContent) {
            return elem.labels[0].textContent.trim();
          }
        }

        const alt = elem.getAttribute('alt');
        if (alt) return alt.trim();

        const title = elem.getAttribute('title');
        if (title) return title.trim();

        const text = (elem.innerText || elem.textContent || '').trim();
        if (text) {
          return text.replace(/\\s+/g, ' ').slice(0, 100);
        }

        return '';
      };

      const getRole = (elem) => {
        const explicitRole = elem.getAttribute('role');
        if (explicitRole) return explicitRole.toLowerCase();

        const tag = elem.tagName.toLowerCase();
        if (tag === 'button') return 'button';
        if (tag === 'a' && elem.hasAttribute('href')) return 'link';
        if (tag === 'select') return 'combobox';
        if (tag === 'textarea') return 'textbox';
        if (tag === 'input') {
          const type = (elem.getAttribute('type') || 'text').toLowerCase();
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
          if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
          if (type === 'range') return 'slider';
          return 'textbox';
        }
        if (elem.onclick || elem.getAttribute('tabindex') === '0') {
          return 'button';
        }
        return tag;
      };

      const getCssSelector = (elem) => {
        if (elem.id) return '#' + CSS.escape(elem.id);
        const testId = elem.getAttribute('data-testid') || elem.getAttribute('data-test');
        if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';

        let path = '';
        let current = elem;
        while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
          let selector = current.tagName.toLowerCase();
          if (current.id) {
            selector += '#' + CSS.escape(current.id);
            path = selector + (path ? ' > ' + path : '');
            break;
          }
          let siblingIndex = 1;
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (sibling.tagName.toLowerCase() === current.tagName.toLowerCase()) {
              siblingIndex++;
            }
            sibling = sibling.previousElementSibling;
          }
          selector += ':nth-of-type(' + siblingIndex + ')';
          path = selector + (path ? ' > ' + path : '');
          current = current.parentElement;
        }
        return path || elem.tagName.toLowerCase();
      };

      const getSurroundingContext = (elem) => {
        let parent = elem.parentElement;
        let depth = 0;
        while (parent && depth < 3) {
          const heading = parent.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
          if (heading && heading.textContent && heading !== elem) {
            return heading.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80);
          }
          parent = parent.parentElement;
          depth++;
        }
        return '';
      };

      const interactiveSelectors = [
        'button',
        'a[href]',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[tabindex="0"]',
        '[contenteditable="true"]',
      ].join(', ');

      const rawElements = Array.from(document.querySelectorAll(interactiveSelectors));
      const visibleElements = rawElements.filter(isVisible);

      const viewportWidth = window.innerWidth || 1;
      const viewportHeight = window.innerHeight || 1;

      const items = visibleElements.map((elem, idx) => {
        const rect = elem.getBoundingClientRect();
        const role = getRole(elem);
        const name = getAccessibleName(elem);
        const testId = elem.getAttribute('data-testid') || elem.getAttribute('data-test') || undefined;
        const disabled = elem.hasAttribute('disabled') || elem.getAttribute('aria-disabled') === 'true';
        const focused = document.activeElement === elem;
        const checked = elem.checked !== undefined ? elem.checked : (elem.getAttribute('aria-checked') === 'true');
        const expanded = elem.getAttribute('aria-expanded') === 'true' ? true : (elem.getAttribute('aria-expanded') === 'false' ? false : undefined);
        const placeholder = elem.placeholder || undefined;
        const value = elem.value || undefined;
        const href = elem.getAttribute('href') || undefined;
        const selector = getCssSelector(elem);
        const surroundingText = getSurroundingContext(elem);

        return {
          index: idx + 1,
          role,
          name,
          text: (elem.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 80) || undefined,
          value,
          placeholder,
          selector,
          testId,
          tagName: elem.tagName.toLowerCase(),
          type: elem.getAttribute('type') || undefined,
          href,
          disabled,
          focused,
          checked,
          expanded,
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          locatorFingerprint: {
            role,
            name,
            tagName: elem.tagName.toLowerCase(),
            testId,
            text: (elem.innerText || '').trim().slice(0, 80) || undefined,
            placeholder,
            cssSelector: selector,
            surroundingText: surroundingText || undefined,
            parentRole: elem.parentElement ? (elem.parentElement.getAttribute('role') || elem.parentElement.tagName.toLowerCase()) : undefined,
            position: {
              xRatio: Math.round((rect.x / viewportWidth) * 100) / 100,
              yRatio: Math.round((rect.y / viewportHeight) * 100) / 100,
            },
          },
        };
      });

      return {
        elements: items,
        metrics: {
          elementCount: document.querySelectorAll('*').length,
          formCount: document.querySelectorAll('form').length,
          headingCount: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
        },
      };
    })()`) as {
      elements: InteractiveElement[];
      metrics: {
        elementCount: number;
        formCount: number;
        headingCount: number;
      };
    };

    const pageTitle = await page.title();
    const currentUrl = page.url();

    let treeText = `Page Title: "${pageTitle}"\nURL: ${currentUrl}\n\n`;
    treeText += `Interactive Elements (${rawData.elements.length}):\n`;

    for (const el of rawData.elements) {
      const stateFlags: string[] = [];
      if (el.disabled) stateFlags.push('disabled');
      if (el.focused) stateFlags.push('focused');
      if (el.checked !== undefined && el.checked) stateFlags.push('checked');
      if (el.expanded !== undefined) stateFlags.push(el.expanded ? 'expanded' : 'collapsed');
      if (el.value) stateFlags.push(`value="${el.value.slice(0, 30)}"`);
      if (el.placeholder) stateFlags.push(`placeholder="${el.placeholder}"`);
      if (el.href) stateFlags.push(`href="${el.href}"`);

      const flagsStr = stateFlags.length > 0 ? ` (${stateFlags.join(', ')})` : '';
      const contextStr = el.locatorFingerprint.surroundingText ? ` [Context: ${el.locatorFingerprint.surroundingText}]` : '';

      treeText += `[#${el.index}] ${el.role} "${el.name}"${flagsStr}${contextStr}\n`;
    }

    return {
      treeText,
      elements: rawData.elements,
      domMetrics: rawData.metrics,
    };
  }
}
