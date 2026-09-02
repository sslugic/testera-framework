# Testera Luna 🌙

**AI-Driven Autonomous UI Testing, Self-Healing, and Quality Scoring Framework.**

Testera Luna bridges high-level user intent and Playwright browser execution through an autonomous agent loop powered by LLM planning, compact accessibility tree observations, multi-dimensional scoring, and automatic self-healing.

```
Goal / Journey
      ↓
Planner (LLM) → Structured Action Plan (click, fill, select, assert)
      ↓
Browser Runtime (Playwright) → Resilient Execution & Highlight Overlays
      ↓
Observer → Indexed A11y Tree ([#1], [#2]...) + Screenshot + Telemetry (Console/Network)
      ↓
Critic / Scorer (LLM + Heuristics) → Functionality / Usability / Interaction Scores
      ↓
Outputs: Executable Playwright Spec (*.spec.ts) + Interactive Visual HTML Report
```

---

## 🌟 Key Capabilities

1. **Goal-Directed & Autonomous Exploration**:
   - Give it a goal (e.g. *"Add wireless headphones to cart and complete checkout"*), and it navigates, fills forms, submits, and asserts milestones.
   - Or run in **Exploration Mode** to automatically crawl unvisited routes, map interactive states, and discover dead ends.

2. **Token-Optimized Observer Engine**:
   - Instead of token-heavy raw HTML DOM, Testera extracts an indexed **Accessibility Tree**:
     ```text
     Page Title: "Luna Store"
     URL: http://localhost:3333/shop

     Interactive Elements:
     [#1] link "Catalog" (href="#catalog")
     [#2] button "Cart (0)"
     [#3] button "Add to Cart" [Context: Luna Wireless Pro Headphones]
     [#4] textbox "Email" (required, placeholder="you@company.com")
     ```
   - Intercepts uncaught JavaScript errors, console warnings, and failing API responses (4xx/5xx).

3. **Multi-Provider LLM Integration**:
   - First-class support for **Google Gemini** (`gemini-2.5-flash` / `gemini-2.5-pro` via `@google/genai`), **Anthropic Claude** (`claude-3-7-sonnet`), **OpenAI** (`gpt-4o`), and a deterministic offline **Mock Provider**.

4. **Tri-Pillar Quality Scoring**:
   - **Functionality Score (0-100)**: Execution reliability, DOM state progression, zero unhandled exceptions or 500 errors.
   - **Usability Score (0-100)**: Touch target sizes (WCAG 2.5.5 / 2.5.8), ARIA labeling completeness, form association.
   - **Interaction Score (0-100)**: Latency profiling, responsive feedback, dead-click detection.

5. **Test Case Synthesizer**:
   - Converts successful journeys into clean, idiomatic `@playwright/test` TypeScript test files (`*.spec.ts`) ready for CI/CD pipelines.

6. **Automated Self-Healing**:
   - Multi-attribute locator fingerprints (role, name, testId, tag, surrounding text, viewport position).
   - If a button text, class, or DOM hierarchy changes, the Self-Healer identifies the matching element with cosine/Levenshtein similarity and dynamically patches the test file.

---

## 🚀 Quick Start

### Installation

```bash
cd testera-framework
npm install
npx playwright install chromium
npm run build
```

### Environment Configuration

Create a `.env` file (see `.env.example`):

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Headless mode (default true)
HEADLESS=true
```

---

## 💻 CLI Commands

### 1. Execute a Goal Journey
```bash
npx testera journey http://localhost:3333 -g "Add headphones to cart and complete checkout"
```

### 2. Autonomously Explore an App
```bash
npx testera explore http://localhost:3333 --max-steps 10
```

### 3. Self-Heal a Broken Playwright Spec
```bash
npx testera heal tests/checkout.spec.ts http://localhost:3333
```

---

## 🧪 Local Demo Server

You can run the included interactive e-commerce demo web app:

```bash
npm run demo:server
# Running on http://localhost:3333
```

Run test suite:
```bash
npm test
```

---

## 📦 Programmatic SDK Usage

```typescript
import { TesteraEngine } from '@testera/framework';

const engine = new TesteraEngine({
  provider: 'gemini',
  headless: true,
  maxSteps: 10,
  artifactsDir: './reports'
});

const result = await engine.runJourney({
  goal: 'Create a new team workspace and invite a member',
  startUrl: 'https://app.example.com',
});

console.log('Overall Score:', result.averageScore.overall);
console.log('Playwright Spec:', result.generatedTestPath);
console.log('Audit Report:', result.reportPath);
```

---

## 📄 License
Apache-2.0 - Testera Labs
