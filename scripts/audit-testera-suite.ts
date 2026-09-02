import { TesteraEngine } from '../src/engine.js';
import path from 'node:path';
import fs from 'node:fs/promises';

interface AuditTarget {
  name: string;
  url: string;
  goal: string;
  maxSteps: number;
}

const targets: AuditTarget[] = [
  {
    name: 'Landing Page & Feature Tour',
    url: 'https://testera.io',
    goal: 'Explore features, pricing tiers, and install guides',
    maxSteps: 5,
  },
  {
    name: 'User Sign In Flow',
    url: 'https://app.testera.io/#login',
    goal: 'Inspect login interface, fill test credentials, and test Sign In',
    maxSteps: 5,
  },
  {
    name: 'User Onboarding & Sign Up',
    url: 'https://app.testera.io/#signup',
    goal: 'Complete onboarding registration form with name, company, email, and password',
    maxSteps: 6,
  },
  {
    name: 'API Reference Documentation',
    url: 'https://testera.mintlify.site/api-reference',
    goal: 'Explore API documentation, endpoints, and search interface',
    maxSteps: 4,
  },
];

async function runSuite() {
  console.log('====================================================');
  console.log('  Testera Luna: Comprehensive Ecosystem Audit');
  console.log('====================================================\n');

  const outDir = path.resolve(process.cwd(), 'reports/testera-suite');
  await fs.mkdir(outDir, { recursive: true });

  const summary = [];

  for (const target of targets) {
    console.log(`\n🔍 Auditing: ${target.name}`);
    console.log(`   URL:  ${target.url}`);
    console.log(`   Goal: "${target.goal}"`);

    const engine = new TesteraEngine({
      provider: 'mock',
      headless: true,
      maxSteps: target.maxSteps,
      artifactsDir: outDir,
    });

    const result = await engine.runJourney({
      goal: target.goal,
      startUrl: target.url,
      maxSteps: target.maxSteps,
    });

    console.log(`   ✔ Completed: ${result.steps.length} steps executed`);
    console.log(`   Functionality : ${result.averageScore.functionality}/100`);
    console.log(`   Usability     : ${result.averageScore.usability}/100`);
    console.log(`   Interaction   : ${result.averageScore.interaction}/100`);
    console.log(`   Quality Index : ${result.averageScore.overall}/100`);
    console.log(`   Generated Spec: ${result.generatedTestPath}`);

    summary.push({
      target: target.name,
      url: target.url,
      steps: result.steps.length,
      scores: result.averageScore,
      specPath: result.generatedTestPath,
      reportPath: result.reportPath,
    });
  }

  console.log('\n====================================================');
  console.log('  Audit Portfolio Summary');
  console.log('====================================================');
  console.table(
    summary.map((s) => ({
      Target: s.target,
      Steps: s.steps,
      Functionality: `${s.scores.functionality}%`,
      Usability: `${s.scores.usability}%`,
      Interaction: `${s.scores.interaction}%`,
      Overall: `${s.scores.overall}%`,
    }))
  );
}

runSuite().catch((err) => {
  console.error('Audit suite failed:', err);
  process.exit(1);
});
