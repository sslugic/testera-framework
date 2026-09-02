import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { z } from 'zod';
import type { FrameworkConfig } from '../types/index.js';

export interface LLMProvider {
  name: string;
  generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    systemPrompt?: string
  ): Promise<T>;
}

export class GeminiProvider implements LLMProvider {
  public readonly name = 'gemini';
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey?: string, model = 'gemini-2.5-flash') {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is required for GeminiProvider');
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    systemPrompt?: string
  ): Promise<T> {
    const fullPrompt = `${systemPrompt ? `[SYSTEM INSTRUCTION]\n${systemPrompt}\n\n` : ''}${prompt}\n\nIMPORTANT: Respond with valid raw JSON only matching the schema. Do not enclose in markdown code blocks.`;

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return schema.parse(parsed);
  }
}

export class AnthropicProvider implements LLMProvider {
  public readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model = 'claude-3-7-sonnet-20250219') {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is required for AnthropicProvider');
    this.client = new Anthropic({ apiKey: key });
    this.model = model;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    systemPrompt?: string
  ): Promise<T> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: `${systemPrompt || ''}\nYou MUST output strictly valid JSON conforming to the requested schema. No conversational preamble or trailing explanation.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = msg.content[0];
    const text = block.type === 'text' ? block.text : '';
    const cleanJson = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleanJson);
    return schema.parse(parsed);
  }
}

export class OpenAIProvider implements LLMProvider {
  public readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model = 'gpt-4o') {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is required for OpenAIProvider');
    this.client = new OpenAI({ apiKey: key });
    this.model = model;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    systemPrompt?: string
  ): Promise<T> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return schema.parse(parsed);
  }
}

/**
 * Deterministic Mock Provider for offline execution, unit tests, or heuristic fallback
 */
export class MockProvider implements LLMProvider {
  public readonly name = 'mock';

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    _systemPrompt?: string
  ): Promise<T> {
    if (prompt.includes('ActionPlan') || prompt.includes('targetIndex')) {
      const lowerPrompt = prompt.toLowerCase();

      // Check if goal was accomplished
      if (
        lowerPrompt.includes('order placed') ||
        lowerPrompt.includes('order #') ||
        lowerPrompt.includes('order confirmed') ||
        lowerPrompt.includes('success-banner') ||
        lowerPrompt.includes('welcome') ||
        lowerPrompt.includes('dashboard') ||
        (lowerPrompt.includes('sign in') && prompt.includes('Step 5') && prompt.includes('Sign In')) ||
        (lowerPrompt.includes('sign up') && prompt.includes('Step 6') && prompt.includes('Sign Up'))
      ) {
        return schema.parse({
          action: 'finish',
          rationale: 'Goal has been successfully achieved or finalized.',
          isGoalComplete: true,
          confidence: 0.98,
        });
      }

      // Parse interactive elements from prompt
      const lines = prompt.split('\n');
      interface ParsedElem {
        index: number;
        role: string;
        name: string;
        raw: string;
        context: string;
      }
      const elements: ParsedElem[] = [];

      for (const line of lines) {
        const m = line.match(/\[#(\d+)\]\s+(\w+)\s+"([^"]*)"/);
        if (m) {
          const ctxMatch = line.match(/\[Context:\s*([^\]]+)\]/);
          elements.push({
            index: parseInt(m[1], 10),
            role: m[2].toLowerCase(),
            name: m[3],
            raw: line,
            context: ctxMatch ? ctxMatch[1] : '',
          });
        }
      }

      // Priority 0: Dismiss install banners or popups if present
      const dismissBtn = elements.find(
        (el) =>
          el.role === 'button' &&
          (el.name.toLowerCase() === 'not now' ||
            el.name.toLowerCase() === 'dismiss install prompt' ||
            el.name.toLowerCase() === 'close')
      );
      if (dismissBtn && !prompt.includes(`click on [#${dismissBtn.index}]`)) {
        return schema.parse({
          action: 'click',
          targetIndex: dismissBtn.index,
          rationale: `Dismissing popup "${dismissBtn.name}" to access main interface`,
          expectedOutcome: 'Popup closes',
          isGoalComplete: false,
          confidence: 0.95,
        });
      }

      // Priority 1: Fill any empty textboxes / inputs currently visible
      const emptyInput = elements.find(
        (el) =>
          (el.role === 'textbox' || el.role === 'input') &&
          !el.raw.includes('value=') &&
          !el.raw.includes('disabled')
      );

      if (emptyInput) {
        const name = (emptyInput.name || emptyInput.raw).toLowerCase();
        let val = 'alex.tester@example.com';
        if (name.includes('company') || name.includes('team')) val = 'Acme Testing Labs';
        else if (name.includes('name') || emptyInput.raw.includes('Jane Doe')) val = 'Alex Tester';
        else if (name.includes('pass') || emptyInput.raw.includes('••••••••')) val = 'TesteraSafe123!';
        else if (name.includes('address') || name.includes('street')) val = '123 Tech Blvd';
        else if (name.includes('zip') || name.includes('postal')) val = '94107';
        else if (name.includes('promo') || name.includes('code')) val = 'LUNA2026';

        return schema.parse({
          action: 'fill',
          targetIndex: emptyInput.index,
          value: val,
          rationale: `Filling input "${emptyInput.name || 'form field'}" with test value`,
          expectedOutcome: `Input "${emptyInput.name || 'form field'}" is populated`,
          isGoalComplete: false,
          confidence: 0.94,
        });
      }

      // Priority 2: Submit Auth Form (Sign In or Sign Up) once inputs are populated
      const authSubmitBtn = elements.find(
        (el) =>
          el.role === 'button' &&
          (el.name.toLowerCase() === 'sign in' ||
            el.name.toLowerCase() === 'sign up' ||
            el.name.toLowerCase() === 'place order' ||
            el.name.toLowerCase() === 'submit order')
      );
      if (authSubmitBtn && !emptyInput) {
        return schema.parse({
          action: 'click',
          targetIndex: authSubmitBtn.index,
          rationale: `Submitting form via "${authSubmitBtn.name}"`,
          expectedOutcome: 'Form submitted, navigating to next screen',
          isGoalComplete: false,
          confidence: 0.96,
        });
      }

      // Priority 3: Goal mentions specific navigation (Pricing, Features, API Docs, Sign up, Login)
      const navKeywords = [
        { key: 'sign up', role: 'button', label: 'sign up' },
        { key: 'sign in', role: 'button', label: 'sign in' },
        { key: 'login', role: 'button', label: 'sign in' },
        { key: 'pricing', role: 'a', label: 'pricing' },
        { key: 'feature', role: 'a', label: 'features' },
        { key: 'compare', role: 'a', label: 'compare' },
        { key: 'faq', role: 'a', label: 'faq' },
        { key: 'mcp', role: 'a', label: 'mcp' },
        { key: 'api doc', role: 'a', label: 'api docs' },
        { key: 'doc', role: 'a', label: 'api docs' },
      ];

      for (const nav of navKeywords) {
        if (lowerPrompt.includes(nav.key)) {
          const matchedNav = elements.find(
            (el) =>
              (el.role === nav.role || el.role === 'link' || el.role === 'button') &&
              el.name.toLowerCase().includes(nav.label) &&
              !prompt.includes(`click on [#${el.index}]`)
          );
          if (matchedNav) {
            return schema.parse({
              action: 'click',
              targetIndex: matchedNav.index,
              rationale: `Navigating to ${matchedNav.name} section based on journey goal`,
              expectedOutcome: `Page views ${matchedNav.name}`,
              isGoalComplete: false,
              confidence: 0.95,
            });
          }
        }
      }

      // Priority 4: E-Commerce cart & checkout
      const hasAddedToCartInHistory = prompt.includes('Add to Cart') || prompt.includes('add-headphones');
      const cartWithItems = elements.find(
        (el) =>
          el.role === 'button' &&
          el.name.toLowerCase().includes('cart') &&
          !el.name.includes('(0)')
      );

      if (cartWithItems || (hasAddedToCartInHistory && elements.some((e) => e.name.toLowerCase().includes('cart')))) {
        const cartBtn = elements.find((e) => e.role === 'button' && e.name.toLowerCase().includes('cart'));
        if (cartBtn) {
          return schema.parse({
            action: 'click',
            targetIndex: cartBtn.index,
            rationale: `Opening cart/checkout drawer via "${cartBtn.name}"`,
            expectedOutcome: 'Checkout drawer/modal opens with shipping form',
            isGoalComplete: false,
            confidence: 0.95,
          });
        }
      }

      // Priority 5: Unexplored interactive element (links, tabs, buttons)
      const unexplored = elements.find(
        (e) =>
          (e.role === 'button' || e.role === 'link' || e.role === 'a') &&
          !prompt.includes(`click on [#${e.index}]`) &&
          e.name.length > 1
      );
      if (unexplored) {
        return schema.parse({
          action: 'click',
          targetIndex: unexplored.index,
          rationale: `Exploring section "${unexplored.name}"`,
          isGoalComplete: false,
          confidence: 0.85,
        });
      }

      return schema.parse({
        action: 'finish',
        rationale: 'Exploration of interactive elements on this view is complete.',
        isGoalComplete: true,
        confidence: 0.8,
      });
    }

    // Default fallback for Critic
    return schema.parse({
      functionality: 92,
      usability: 90,
      interaction: 95,
      overall: 92,
      findings: [],
      transitionFeedback: 'Action executed smoothly with good responsiveness.',
    });
  }
}

export function createLLMProvider(config: FrameworkConfig): LLMProvider {
  const providerType = config.provider || process.env.AI_PROVIDER || 'gemini';

  if (providerType === 'gemini' && (config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
    return new GeminiProvider(config.apiKey, config.model || 'gemini-2.5-flash');
  }

  if (providerType === 'anthropic' && (config.apiKey || process.env.ANTHROPIC_API_KEY)) {
    return new AnthropicProvider(config.apiKey, config.model || 'claude-3-7-sonnet-20250219');
  }

  if (providerType === 'openai' && (config.apiKey || process.env.OPENAI_API_KEY)) {
    return new OpenAIProvider(config.apiKey, config.model || 'gpt-4o');
  }

  return new MockProvider();
}
