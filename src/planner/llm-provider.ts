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
    // If prompt requests ActionPlan schema:
    if (prompt.includes('ActionPlan') || prompt.includes('targetIndex')) {
      const lowerPrompt = prompt.toLowerCase();

      // Check if goal was accomplished
      if (
        lowerPrompt.includes('order placed') ||
        lowerPrompt.includes('order #') ||
        lowerPrompt.includes('order confirmed') ||
        lowerPrompt.includes('success-banner') ||
        lowerPrompt.includes('🎉')
      ) {
        return schema.parse({
          action: 'finish',
          rationale: 'Goal has been successfully achieved. Order confirmation is displayed.',
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

      // Priority 1: Fill any empty textboxes / inputs currently visible
      const emptyInput = elements.find(
        (el) =>
          (el.role === 'textbox' || el.role === 'input') &&
          !el.raw.includes('value=') &&
          !el.raw.includes('disabled')
      );

      if (emptyInput) {
        const name = (emptyInput.name || emptyInput.raw).toLowerCase();
        let val = 'test@example.com';
        if (name.includes('name')) val = 'Alice Tester';
        else if (name.includes('pass')) val = 'Password123!';
        else if (name.includes('address') || name.includes('street')) val = '123 Market St';
        else if (name.includes('zip') || name.includes('postal')) val = '90210';
        else if (name.includes('promo') || name.includes('code')) val = 'LUNA10';

        return schema.parse({
          action: 'fill',
          targetIndex: emptyInput.index,
          value: val,
          rationale: `Filling in field "${emptyInput.name}" with sample input`,
          expectedOutcome: `Input "${emptyInput.name}" contains value`,
          isGoalComplete: false,
          confidence: 0.92,
        });
      }

      // Priority 2: If we are in the checkout modal and inputs are filled, click "Place Order" or "Submit"
      const placeOrderBtn = elements.find(
        (el) =>
          el.role === 'button' &&
          (el.name.toLowerCase().includes('place order') || el.name.toLowerCase().includes('submit order'))
      );
      if (placeOrderBtn) {
        return schema.parse({
          action: 'click',
          targetIndex: placeOrderBtn.index,
          rationale: `Clicking "${placeOrderBtn.name}" to finalize transaction`,
          expectedOutcome: 'Order confirmation banner is displayed',
          isGoalComplete: false,
          confidence: 0.96,
        });
      }

      // Check if item has already been added to cart in history
      const hasAddedToCartInHistory = prompt.includes('Add to Cart') || prompt.includes('add-headphones');
      const cartWithItems = elements.find(
        (el) =>
          el.role === 'button' &&
          el.name.toLowerCase().includes('cart') &&
          !el.name.includes('(0)')
      );

      // Priority 3: If cart has items or we already added to cart, click "Cart" to open modal!
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

      // Priority 4: Goal mentions headphones or specific item -> Click "Add to Cart" for that item
      const itemKeywords = ['headphone', 'keyboard', 'pro'];
      const matchedItemBtn = elements.find((el) => {
        if (el.role !== 'button') return false;
        const fullDesc = `${el.name} ${el.context}`.toLowerCase();
        return (
          (fullDesc.includes('add to cart') || fullDesc.includes('add item')) &&
          itemKeywords.some((k) => lowerPrompt.includes(k) && fullDesc.includes(k))
        );
      });

      if (matchedItemBtn && !hasAddedToCartInHistory) {
        return schema.parse({
          action: 'click',
          targetIndex: matchedItemBtn.index,
          rationale: `Clicking "${matchedItemBtn.name}" for ${matchedItemBtn.context || 'selected product'}`,
          expectedOutcome: 'Cart count increments',
          isGoalComplete: false,
          confidence: 0.95,
        });
      }

      // Priority 5: Generic "Add to Cart" if cart count is 0
      const addToCartBtn = elements.find(
        (el) =>
          el.role === 'button' &&
          (el.name.toLowerCase().includes('add to cart') || el.name.toLowerCase().includes('add item'))
      );
      if (addToCartBtn && lowerPrompt.includes('cart (0)')) {
        return schema.parse({
          action: 'click',
          targetIndex: addToCartBtn.index,
          rationale: `Adding product to cart (${addToCartBtn.context || 'catalog product'})`,
          expectedOutcome: 'Cart count updates to 1',
          isGoalComplete: false,
          confidence: 0.92,
        });
      }

      // Priority 6: First unexplored interactive element
      if (elements.length > 0) {
        return schema.parse({
          action: 'click',
          targetIndex: elements[0].index,
          rationale: `Interacting with element "${elements[0].name}" to explore next state`,
          isGoalComplete: false,
          confidence: 0.7,
        });
      }

      return schema.parse({
        action: 'finish',
        rationale: 'No further interactive elements found',
        isGoalComplete: true,
        confidence: 0.5,
      });
    }

    // Default fallback for Critic
    return schema.parse({
      functionality: 92,
      usability: 88,
      interaction: 94,
      overall: 91,
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

  // If no external provider key found, gracefully use MockProvider
  return new MockProvider();
}
