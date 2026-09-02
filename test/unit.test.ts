import assert from 'node:assert';
import test from 'node:test';
import { FingerprintEngine } from '../src/memory/fingerprint.js';
import { HeuristicEvaluator } from '../src/critic/heuristics.js';
import { TestSynthesizer } from '../src/generator/test-synthesizer.js';
import { SelfHealer } from '../src/healer/self-healer.js';
import { TesteraEngine } from '../src/engine.js';
import { createDemoServer } from '../demo/demo-server.js';
import type { InteractiveElement, Observation, StepRecord, LocatorFingerprint } from '../src/types/index.js';

test('FingerprintEngine: calculates similarity accurately across UI shifts', () => {
  const original: LocatorFingerprint = {
    role: 'button',
    name: 'Add to Cart',
    tagName: 'button',
    testId: 'add-headphones',
    cssSelector: '#add-cart-btn',
    surroundingText: 'Luna Wireless Pro Headphones',
    position: { xRatio: 0.5, yRatio: 0.3 },
  };

  const exactMatch: InteractiveElement = {
    index: 1,
    role: 'button',
    name: 'Add to Cart',
    tagName: 'button',
    testId: 'add-headphones',
    selector: '#add-cart-btn',
    disabled: false,
    focused: false,
    boundingBox: { x: 500, y: 300, width: 120, height: 40 },
    locatorFingerprint: { ...original },
  };

  const scoreExact = FingerprintEngine.calculateSimilarity(original, exactMatch);
  assert.ok(scoreExact >= 0.85, `Expected high similarity score for exact match, got ${scoreExact}`);

  // Simulating a UI redesign: button text changed to "Add Item", testId removed, but role and surroundings match
  const redesigned: InteractiveElement = {
    index: 2,
    role: 'button',
    name: 'Add Item',
    tagName: 'button',
    selector: '.new-cart-btn',
    disabled: false,
    focused: false,
    boundingBox: { x: 500, y: 300, width: 120, height: 40 },
    locatorFingerprint: {
      role: 'button',
      name: 'Add Item',
      tagName: 'button',
      cssSelector: '.new-cart-btn',
      surroundingText: 'Luna Wireless Pro Headphones',
      position: { xRatio: 0.5, yRatio: 0.3 },
    },
  };

  const scoreRedesigned = FingerprintEngine.calculateSimilarity(original, redesigned);
  assert.ok(scoreRedesigned >= 0.6, `Expected recognizable similarity after redesign, got ${scoreRedesigned}`);

  // Irrelevant element: a link called "Terms of Service"
  const irrelevant: InteractiveElement = {
    index: 3,
    role: 'link',
    name: 'Terms of Service',
    tagName: 'a',
    selector: 'footer a',
    disabled: false,
    focused: false,
    boundingBox: { x: 100, y: 900, width: 100, height: 20 },
    locatorFingerprint: {
      role: 'link',
      name: 'Terms of Service',
      tagName: 'a',
      cssSelector: 'footer a',
      position: { xRatio: 0.1, yRatio: 0.9 },
    },
  };

  const scoreIrrelevant = FingerprintEngine.calculateSimilarity(original, irrelevant);
  assert.ok(scoreIrrelevant < 0.3, `Expected low similarity for irrelevant element, got ${scoreIrrelevant}`);
});

test('HeuristicEvaluator: penalizes a11y violations and execution failures', () => {
  const dummyObs: Observation = {
    stepIndex: 1,
    url: 'http://localhost:3333',
    title: 'Demo',
    a11yTreeText: '[#1] button "OK"\n[#2] button "Tiny"',
    interactiveElements: [
      {
        index: 1,
        role: 'button',
        name: 'OK',
        selector: '#btn',
        tagName: 'button',
        disabled: false,
        focused: false,
        boundingBox: { x: 10, y: 10, width: 80, height: 40 },
        locatorFingerprint: { role: 'button', name: 'OK', tagName: 'button', cssSelector: '#btn' },
      },
      {
        index: 2,
        role: 'button',
        name: 'Tiny',
        selector: '#tiny',
        tagName: 'button',
        disabled: false,
        focused: false,
        boundingBox: { x: 10, y: 60, width: 14, height: 14 }, // Under 24x24px
        locatorFingerprint: { role: 'button', name: 'Tiny', tagName: 'button', cssSelector: '#tiny' },
      },
    ],
    telemetry: [],
    domMetrics: { elementCount: 10, formCount: 0, headingCount: 1 },
  };

  // Test tiny tap target check
  const tinyEval = HeuristicEvaluator.evaluate(
    { action: 'click', targetIndex: 2, rationale: 'Click tiny button' },
    { success: true, duration: 100, actualAction: { action: 'click', targetIndex: 2, rationale: '' } },
    dummyObs
  );

  assert.ok(tinyEval.usabilityScore < 100, 'Expected usability penalty for sub-24px tap target');
  assert.ok(
    tinyEval.findings.some((f) => f.category === 'usability' && f.message.includes('Touch target size')),
    'Expected finding about touch target size'
  );

  // Test execution failure check
  const failEval = HeuristicEvaluator.evaluate(
    { action: 'click', targetIndex: 1, rationale: 'Click failed' },
    { success: false, duration: 200, error: 'Timeout waiting for selector', actualAction: { action: 'click', targetIndex: 1, rationale: '' } },
    dummyObs
  );

  assert.ok(failEval.functionalityScore <= 55, 'Expected functionality penalty for failed execution');
});

test('TestSynthesizer: generates clean, executable Playwright spec code', () => {
  const dummySteps: StepRecord[] = [
    {
      stepIndex: 1,
      timestamp: Date.now(),
      action: { action: 'click', targetIndex: 1, rationale: 'Add headphones to cart' },
      observationBefore: {
        stepIndex: 1,
        url: 'http://localhost:3333',
        title: 'Store',
        a11yTreeText: '[#1] button "Add to Cart"',
        interactiveElements: [
          {
            index: 1,
            role: 'button',
            name: 'Add to Cart',
            testId: 'add-headphones',
            selector: '#add-btn',
            tagName: 'button',
            disabled: false,
            focused: false,
            boundingBox: { x: 0, y: 0, width: 100, height: 30 },
            locatorFingerprint: { role: 'button', name: 'Add to Cart', tagName: 'button', cssSelector: '#add-btn' },
          },
        ],
        telemetry: [],
        domMetrics: { elementCount: 5, formCount: 0, headingCount: 1 },
      },
      success: true,
    },
    {
      stepIndex: 2,
      timestamp: Date.now(),
      action: { action: 'assert', targetIndex: 1, value: 'Order Placed', rationale: 'Verify confirmation banner' },
      observationBefore: {
        stepIndex: 2,
        url: 'http://localhost:3333',
        title: 'Store',
        a11yTreeText: '[#1] heading "Order Placed"',
        interactiveElements: [
          {
            index: 1,
            role: 'heading',
            name: 'Order Placed',
            selector: '#banner',
            tagName: 'h2',
            disabled: false,
            focused: false,
            boundingBox: { x: 0, y: 0, width: 200, height: 40 },
            locatorFingerprint: { role: 'heading', name: 'Order Placed', tagName: 'h2', cssSelector: '#banner' },
          },
        ],
        telemetry: [],
        domMetrics: { elementCount: 5, formCount: 0, headingCount: 1 },
      },
      success: true,
    },
  ];

  const code = TestSynthesizer.synthesize(
    dummySteps,
    { goal: 'Checkout Headphones', startUrl: 'http://localhost:3333' },
    'E2E Checkout Test'
  );

  assert.ok(code.includes("import { test, expect } from '@playwright/test';"));
  assert.ok(code.includes("test('E2E Checkout Test'"));
  assert.ok(code.includes("page.goto('http://localhost:3333'"));
  assert.ok(code.includes("page.getByTestId('add-headphones').click()"));
  assert.ok(code.includes("expect(page.getByRole('heading'"));
});

test('SelfHealer: repairs broken selector to matching replacement element', () => {
  const brokenFingerprint: LocatorFingerprint = {
    role: 'button',
    name: 'Submit Order',
    tagName: 'button',
    testId: 'submit-btn',
    cssSelector: '#old-submit-button',
    surroundingText: 'Checkout Summary',
  };

  const currentObservation: Observation = {
    stepIndex: 3,
    url: 'http://localhost:3333/checkout',
    title: 'Checkout',
    a11yTreeText: '[#1] button "Place Order" (data-testid="place-order-btn")',
    interactiveElements: [
      {
        index: 1,
        role: 'button',
        name: 'Place Order',
        testId: 'place-order-btn',
        selector: '.btn-place-order',
        tagName: 'button',
        disabled: false,
        focused: false,
        boundingBox: { x: 200, y: 400, width: 140, height: 45 },
        locatorFingerprint: {
          role: 'button',
          name: 'Place Order',
          tagName: 'button',
          testId: 'place-order-btn',
          cssSelector: '.btn-place-order',
          surroundingText: 'Checkout Summary',
        },
      },
    ],
    telemetry: [],
    domMetrics: { elementCount: 15, formCount: 1, headingCount: 2 },
  };

  const healed = SelfHealer.findHealedElement(brokenFingerprint, currentObservation, 0.5);
  assert.ok(healed !== null, 'Expected self healer to identify closest button match');
  assert.strictEqual(healed.match.name, 'Place Order');

  const patch = SelfHealer.createPatch(
    brokenFingerprint.cssSelector,
    brokenFingerprint,
    healed.match,
    healed.similarity,
    3,
    healed.reason
  );

  assert.strictEqual(patch.originalSelector, '#old-submit-button');
  assert.strictEqual(patch.healedSelector, '[data-testid="place-order-btn"]');
});

test('End-to-End: TesteraEngine executes journey on local web application', async () => {
  const port = 3456;
  const server = createDemoServer(port);
  await new Promise<void>((resolve) => server.listen(port, resolve));

  try {
    const engine = new TesteraEngine({
      provider: 'mock',
      headless: true,
      slowMo: 0,
      maxSteps: 8,
      artifactsDir: './reports/test-run',
    });

    const result = await engine.runJourney({
      goal: 'Add headphones to cart and complete checkout',
      startUrl: `http://localhost:${port}`,
      maxSteps: 8,
    });

    assert.ok(result.steps.length > 0, 'Expected at least 1 step executed');
    assert.ok(result.averageScore.functionality >= 80, `Expected functionality >= 80, got ${result.averageScore.functionality}`);
    assert.ok(result.graphSummary.totalStates >= 1, 'Expected at least 1 state registered in exploration graph');
    assert.ok(result.reportPath, 'Expected HTML report to be generated');
    assert.ok(result.generatedTestPath, 'Expected Playwright test spec to be generated');
  } finally {
    server.close();
  }
});
