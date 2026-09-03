import { loadWorkspaceEnv } from '../src/config/load-env.js';
import { runAudit } from '../src/audit/run-audit.js';
import type { AuditTarget } from '../src/audit/targets.js';

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
  const { provider, envSources } = loadWorkspaceEnv();

  console.log('====================================================');
  console.log('  Testera Luna: Comprehensive Ecosystem Audit');
  console.log('====================================================');
  console.log(`  Provider: ${provider}`);
  if (envSources.length) console.log(`  Env:      ${envSources.join(', ')}`);
  console.log('');

  const summary = await runAudit({
    targets,
    provider: provider as 'cursor' | 'gemini' | 'anthropic' | 'openai' | 'mock',
    headless: true,
    artifactsDir: './reports/testera-suite',
    onTargetStart: (target) => {
      console.log(`\n🔍 Auditing: ${target.name}`);
      console.log(`   URL:  ${target.url}`);
      console.log(`   Goal: "${target.goal}"`);
    },
    onTargetComplete: (target, result) => {
      console.log(`   ✔ Completed: ${result.steps.length} steps executed`);
      console.log(`   Functionality : ${result.averageScore.functionality}/100`);
      console.log(`   Usability     : ${result.averageScore.usability}/100`);
      console.log(`   Interaction   : ${result.averageScore.interaction}/100`);
      console.log(`   Quality Index : ${result.averageScore.overall}/100`);
      console.log(`   Generated Spec: ${result.generatedTestPath}`);
    },
  });

  console.log('\n====================================================');
  console.log('  Audit Portfolio Summary');
  console.log('====================================================');
  console.table(
    summary.map((s) => ({
      Target: s.name,
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
