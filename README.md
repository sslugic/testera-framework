# Testera Luna 🌙

**AI-Driven Autonomous UI Testing, Self-Healing, and Quality Scoring Framework.**

Testera Luna bridges high-level user intent and Playwright browser execution through an autonomous agent loop powered by LLM planning, compact accessibility tree observations, multi-dimensional scoring, session-aware authentication reuse, and automatic self-healing.

```
Goal / Multi-Target Plan
      ↓
Planner (Cursor / Gemini / Claude / OpenAI) → Structured Action Plan (click, fill, select, assert)
      ↓
Browser Runtime (Playwright) → Resilient Execution + Session Persistence (storageState)
      ↓
Observer → Indexed A11y Tree ([#1], [#2]...) + Screenshot + Telemetry (Console/Network)
      ↓
Critic / Scorer (LLM + Heuristics) → Functionality / Usability / Interaction Quality Index
      ↓
Outputs: Executable Playwright Specs (*.spec.ts) + Gherkin Portfolio & Interactive HTML Reports
```

---

## 🌟 Key Capabilities

### 1. Goal-Directed & Autonomous Exploration
- **Goal Mode**: Provide a high-level user journey (e.g. *"Add wireless headphones to cart and complete checkout"* or *"Create a test plan with three scenarios"*), and the agent handles navigation, form population, state verification, and completion criteria.
- **Exploration Mode**: Automatically crawls uncharted application surfaces, cataloging routes, interactive states, and edge-case dead ends.

### 2. Smart Session Reuse & Authentication Bypass
Testing multiple internal application features often suffers from repetitive, slow login/signup sequences. Testera Luna solves this natively:
- **Persistent Session Capture**: When an account is created or signed into (e.g. during a setup/onboarding step), the framework captures and persists the authentication cookies and `localStorage` to a `storageState` file (`.auth/session.json`).
- **Auth-Aware Planning Rules**: The Planner observes the accessibility tree for authentication landmarks (user initials/avatar, dashboard navigation, logout controls). If an active session is detected, it **bypasses login and signup gates entirely**, moving straight to the target feature.
- **Spec Synthesis with `test.use`**: The Test Synthesizer automatically injects `test.use({ storageState: '...' })` into generated Playwright test specs. Tests run in clean Playwright workers directly against authenticated views without repeating login forms.

### 3. Token-Optimized Accessibility Tree Observer
Instead of feeding raw, noisy HTML DOM into LLMs, Testera extracts an indexed **Accessibility Tree**:
```text
Page Title: "Testera Dashboard"
URL: https://app.testera.io/#dashboard

Interactive Elements:
[#1] button "Dashboard"
[#2] button "Projects (3)"
[#3] button "Test Plans"
[#4] button "Create Test Case" [Context: Quick Actions]
[#5] button "Settings"
[#6] button "Logout"
```
Also captures uncaught browser exceptions, console warnings, and failing API responses (4xx/5xx).

### 4. Multi-Provider LLM Integration
First-class support for:
- **Cursor Agent API** (`composer-2.5` via `@cursor/sdk`)
- **Google Gemini** (`gemini-2.5-flash` / `gemini-2.5-pro` via `@google/genai`)
- **Anthropic Claude** (`claude-3-7-sonnet` via `@anthropic-ai/sdk`)
- **OpenAI** (`gpt-4o` via `openai`)
- **Deterministic Mock Provider** for offline execution and fast unit testing.

### 5. Tri-Pillar Quality Scoring
- **Functionality (0–100)**: Execution reliability, DOM state progression, zero unhandled exceptions or 500 network errors.
- **Usability (0–100)**: Touch target sizes (WCAG 2.5.5 / 2.5.8), ARIA labeling completeness, form label association.
- **Interaction (0–100)**: Latency profiling, responsive feedback, and dead-click detection.

### 6. Test Case Synthesizer & Playwright Specs
Converts successful journeys into idiomatic `@playwright/test` TypeScript test files (`*.spec.ts`):
- Uses strict-mode compliant locators (`getByRole('button', { name: '...', exact: true })`, `getByTestId`, `getByText`).
- Emits derived step assertions (`toHaveURL`, `toHaveTitle`, `toHaveValue`, `toBeVisible`).
- Ready for immediate CI/CD pipeline integration.

### 7. Automated Self-Healing
- Multi-attribute locator fingerprints (role, name, testId, tagName, surrounding context text, and relative bounding boxes).
- If buttons, labels, classes, or DOM hierarchies shift, the Self-Healer identifies the matching replacement element via Levenshtein and cosine similarity, then dynamically patches the test code.

### 8. Gherkin Portfolio & Visual HTML Reports
- **Gherkin Portfolio Report**: Discovered journeys are translated into clean Given/When/Then scenarios paired with quality scorecards and step verification tables.
- **Playwright HTML Report**: Full interactive execution trace viewer with step timings, network requests, screenshots, and error context.

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/sslugic/testera-framework.git
cd testera-framework
npm install
npx playwright install chromium
npm run build
```

### Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure your preferred AI provider:

```bash
# AI Provider (cursor | gemini | anthropic | openai | mock)
AI_PROVIDER=cursor
CURSOR_API_KEY=your_cursor_api_key_here

# Or Google Gemini:
# AI_PROVIDER=gemini
# GEMINI_API_KEY=your_gemini_key_here

# Browser settings
HEADLESS=true
SLOW_MO=0
BROWSER=chromium
```

---

## 💻 Available Scripts & Commands

### Running Tests

| Command | Description |
|---|---|
| `npm test` | Runs the framework unit test suite (Fingerprint, Evaluator, Synthesizer, Healer, Engine E2E, Session Reuse). |
| `npm run test:app` | Executes the generated 11-feature full application Playwright test suite (`reports/testera-app-full/*.spec.ts`). |
| `npm run test:generated` | Executes generated audit suite specs (`reports/testera-suite/*.spec.ts`). |

### Audit & Exploration Pipelines

```bash
# 1. Full Multi-Target App Exploration & Verification Pipeline
# Explores 11 feature areas, persists session, generates specs, runs verification, and produces Gherkin report
npm run full:app

# 2. Comprehensive Ecosystem Audit Suite
# Audits landing pages, sign-in, onboarding, and documentation
npm run audit:suite

# 3. Interactive Demo Server
npm run demo:server
# Starts a local e-commerce test app on http://localhost:3333
```

### CLI Usage

```bash
# Goal-directed journey
npx testera journey https://app.testera.io -g "Explore Projects, create a test case, and verify dashboard updates"

# Autonomous app exploration
npx testera explore https://app.testera.io --max-steps 15

# Self-heal a broken Playwright spec
npx testera heal tests/checkout.spec.ts http://localhost:3333
```

---

## 📊 Reports & Artifacts

After running an audit pipeline or Playwright tests, view the reports:

```bash
# Open the Gherkin Portfolio Report (features, quality scores, Given/When/Then)
open reports/testera-app-full/portfolio-gherkin-report.html

# Open the Interactive Playwright HTML Report (traces, timings, logs)
npx playwright show-report
```

---

## 📦 Programmatic Usage

```typescript
import { TesteraEngine } from '@testera/framework';

const engine = new TesteraEngine({
  provider: 'gemini',
  headless: true,
  maxSteps: 12,
  artifactsDir: './reports',
  storageStatePath: './reports/.auth/session.json', // Reusable auth state
});

const result = await engine.runJourney({
  goal: 'Navigate to Projects, create a new project called "Mobile QA", and verify it appears in the list',
  startUrl: 'https://app.testera.io',
  authenticated: true, // Tells planner to bypass login/signup
});

console.log('Quality Score:', result.averageScore.overall);
console.log('Generated Spec:', result.generatedTestPath);
console.log('Interactive Report:', result.reportPath);
```

---

## 🏗️ Project Architecture

```
testera-framework/
├── src/
│   ├── audit/          # Multi-target audit runners and target normalization
│   ├── config/         # Environment loader and workspace configuration
│   ├── critic/         # Quality scoring heuristics (Functionality, Usability, Interaction)
│   ├── generator/      # Playwright test spec synthesis & assertion synthesis
│   ├── healer/         # Self-healing engine with similarity fingerprint matching
│   ├── memory/         # Exploration state graph and UI fingerprinting
│   ├── observer/       # Accessibility tree extractor & telemetry interceptor
│   ├── planner/        # LLM planner (Cursor, Gemini, Claude, OpenAI) & auth rules
│   ├── reporter/       # Gherkin portfolio HTML reports & execution formatters
│   ├── runtime/        # Playwright browser runtime, session persistence, and action executor
│   ├── types/          # Core TypeScript interfaces & schemas
│   └── engine.ts       # Main TesteraEngine orchestration loop
├── scripts/
│   ├── full-testera-app-audit.ts  # End-to-end multi-target exploration pipeline
│   └── audit-testera-suite.ts     # Multi-surface ecosystem audit script
├── test/
│   └── unit.test.ts    # Comprehensive framework test suite
└── reports/            # Generated specs, traces, reports, and sessions (git-ignored)
```

---

## 📄 License
Apache-2.0 — Testera Labs
