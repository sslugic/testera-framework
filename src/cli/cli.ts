#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import fs from 'node:fs/promises';
import { TesteraEngine } from '../engine.js';
import { loadWorkspaceEnv } from '../config/load-env.js';
import { SelfHealer } from '../healer/self-healer.js';
import { BrowserRuntime } from '../runtime/browser.js';
import { PageObserver } from '../observer/observer.js';
import type { FrameworkConfig } from '../types/index.js';
import { runAudit } from '../audit/run-audit.js';
import {
  loadTargetsFromFile,
  targetsFromUrls,
  type AuditTarget,
} from '../audit/targets.js';

loadWorkspaceEnv();

const program = new Command();

program
  .name('testera')
  .description('AI-Driven UI Testing, Autonomous Exploration, and Self-Healing Framework')
  .version('0.1.0');

program
  .command('explore')
  .description('Autonomously explore a web application to map states, test interactions, and score UX')
  .argument('<url>', 'Target URL to explore')
  .option('-m, --max-steps <number>', 'Maximum steps to explore', '10')
  .option('--headless <boolean>', 'Run browser in headless mode', 'true')
  .option('-p, --provider <name>', 'AI Provider (cursor | gemini | anthropic | openai | mock)', process.env.AI_PROVIDER || 'gemini')
  .option('-o, --out-dir <path>', 'Output directory for reports', './reports')
  .action(async (url, options) => {
    console.log(chalk.bold.hex('#6366f1')('\n🚀 Testera Luna: Autonomous UI Exploration'));
    console.log(chalk.gray(`Target: ${url}`));
    console.log(chalk.gray(`Provider: ${options.provider} | Max Steps: ${options.maxSteps}\n`));

    const spinner = ora('Launching browser runtime and exploring UI...').start();

    const engine = new TesteraEngine({
      provider: options.provider,
      headless: options.headless !== 'false',
      maxSteps: parseInt(options.maxSteps, 10),
      artifactsDir: path.resolve(process.cwd(), options.outDir),
    });

    try {
      const result = await engine.runExploration(url, parseInt(options.maxSteps, 10));
      spinner.succeed(chalk.green('Exploration run finished!'));

      console.log(chalk.bold('\n📊 Quality Audit Scores:'));
      console.log(`  Functionality : ${chalk.hex('#60a5fa')(`${result.averageScore.functionality}/100`)}`);
      console.log(`  Usability     : ${chalk.hex('#34d399')(`${result.averageScore.usability}/100`)}`);
      console.log(`  Interaction   : ${chalk.hex('#fbbf24')(`${result.averageScore.interaction}/100`)}`);
      console.log(`  Overall Index : ${chalk.bold.hex('#a78bfa')(`${result.averageScore.overall}/100`)}`);

      console.log(chalk.bold('\n🗺️  Exploration Summary:'));
      console.log(`  Screen States Discovered: ${result.graphSummary.totalStates}`);
      console.log(`  Transitions Mapped      : ${result.graphSummary.totalTransitions}`);
      console.log(`  Explored Elements       : ${result.graphSummary.totalExploredElements}`);

      if (result.reportPath) {
        console.log(chalk.bold.green(`\n📄 Report: ${result.reportPath}`));
      }
      if (result.generatedTestPath) {
        console.log(chalk.bold.green(`🧪 Generated Playwright Spec: ${result.generatedTestPath}`));
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`Exploration failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('Audit one or more websites — pass URL(s) and an optional goal; outputs Playwright specs and HTML reports')
  .argument('[urls...]', 'Target URL(s) to audit')
  .option('-g, --goal <goal>', 'Journey goal applied to every URL (optional — auto-generated per site if omitted)')
  .option('-m, --max-steps <number>', 'Maximum steps per target', '8')
  .option('-f, --file <path>', 'Targets file (.json array or line-based: url | goal)')
  .option('-n, --name <name>', 'Display name when auditing a single URL')
  .option('--headless <boolean>', 'Run browser headless', 'true')
  .option('-p, --provider <name>', 'AI Provider (cursor | gemini | anthropic | openai | mock)', process.env.AI_PROVIDER || 'gemini')
  .option('-o, --out-dir <path>', 'Output directory for specs and reports', './reports')
  .option('--json', 'Print summary as JSON')
  .action(async (urls: string[], options) => {
    let targets: AuditTarget[] = [];

    if (options.file) {
      targets = await loadTargetsFromFile(path.resolve(process.cwd(), options.file));
    } else if (urls.length > 0) {
      targets = targetsFromUrls(urls, options.goal);
      if (options.name && targets.length === 1) {
        targets[0].name = options.name;
      }
    } else {
      console.error(chalk.red('Provide at least one URL or use --file <targets.json>'));
      process.exit(1);
    }

    console.log(chalk.bold.hex('#6366f1')('\n🔍 Testera Luna: Multi-Site Audit'));
    console.log(chalk.gray(`Targets: ${targets.length} | Provider: ${options.provider} | Max steps: ${options.maxSteps}`));
    if (options.goal) console.log(chalk.gray(`Shared goal: "${options.goal}"`));
    console.log('');

    const spinner = ora('Starting audit...').start();

    try {
      const summary = await runAudit({
        targets,
        provider: options.provider,
        headless: options.headless !== 'false',
        maxSteps: parseInt(options.maxSteps, 10),
        goal: options.goal,
        artifactsDir: options.outDir,
        onTargetStart: (target, index, total) => {
          spinner.text = `[${index + 1}/${total}] ${target.name} — ${target.url}`;
        },
        onTargetComplete: (target, result) => {
          if (!options.json) {
            console.log(
              chalk.green(
                `\n  ✔ ${target.name}: ${result.steps.length} steps | Quality ${result.averageScore.overall}/100`
              )
            );
            if (result.generatedTestPath) {
              console.log(chalk.gray(`    Spec:   ${result.generatedTestPath}`));
            }
            if (result.reportPath) {
              console.log(chalk.gray(`    Report: ${result.reportPath}`));
            }
          }
        },
      });

      spinner.succeed(chalk.green(`Audit complete — ${summary.length} target(s)`));

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(chalk.bold('\n📊 Portfolio Summary'));
        console.table(
          summary.map((s) => ({
            Target: s.name,
            URL: s.url,
            Steps: s.steps,
            Overall: `${s.scores.overall}%`,
          }))
        );
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`Audit failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('journey')
  .description('Execute a goal-driven autonomous user journey with self-healing and test generation')
  .argument('<url>', 'Target URL')
  .requiredOption('-g, --goal <goal>', 'User journey goal (e.g. "Add wireless headphones to cart and checkout")')
  .option('-m, --max-steps <number>', 'Maximum steps', '12')
  .option('--headless <boolean>', 'Run headless', 'true')
  .option('-p, --provider <name>', 'AI Provider (cursor | gemini | anthropic | openai | mock)', process.env.AI_PROVIDER || 'gemini')
  .option('-o, --out-dir <path>', 'Output directory', './reports')
  .action(async (url, options) => {
    console.log(chalk.bold.hex('#6366f1')('\n🎯 Testera Luna: Goal-Directed Journey'));
    console.log(chalk.white(`Goal: "${options.goal}"`));
    console.log(chalk.gray(`Target: ${url} | Provider: ${options.provider}\n`));

    const spinner = ora('Executing journey planner...').start();

    const engine = new TesteraEngine({
      provider: options.provider,
      headless: options.headless !== 'false',
      maxSteps: parseInt(options.maxSteps, 10),
      artifactsDir: path.resolve(process.cwd(), options.outDir),
    });

    try {
      const result = await engine.runJourney({
        goal: options.goal,
        startUrl: url,
        maxSteps: parseInt(options.maxSteps, 10),
      });

      if (result.success) {
        spinner.succeed(chalk.green('Journey goal achieved successfully!'));
      } else {
        spinner.warn(chalk.yellow('Journey concluded with partial completion.'));
      }

      console.log(chalk.bold('\n📊 Quality Audit Scores:'));
      console.log(`  Functionality : ${chalk.hex('#60a5fa')(`${result.averageScore.functionality}/100`)}`);
      console.log(`  Usability     : ${chalk.hex('#34d399')(`${result.averageScore.usability}/100`)}`);
      console.log(`  Interaction   : ${chalk.hex('#fbbf24')(`${result.averageScore.interaction}/100`)}`);
      console.log(`  Overall Index : ${chalk.bold.hex('#a78bfa')(`${result.averageScore.overall}/100`)}`);

      if (result.selfHealingPatches.length > 0) {
        console.log(chalk.bold.hex('#10b981')(`\n⚡ Self-Healed ${result.selfHealingPatches.length} locators:`));
        result.selfHealingPatches.forEach((p) => {
          console.log(`  - ${chalk.strikethrough.red(p.originalSelector)} ➔ ${chalk.green(p.healedSelector)} (${Math.round(p.similarityScore * 100)}% match)`);
        });
      }

      if (result.generatedTestPath) {
        console.log(chalk.bold.green(`\n🧪 Playwright Spec Generated: ${result.generatedTestPath}`));
      }
      if (result.reportPath) {
        console.log(chalk.bold.green(`📄 Visual Report: ${result.reportPath}`));
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`Journey execution failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('heal')
  .description('Inspect a target URL and self-heal broken selectors in a Playwright test file')
  .argument('<specFile>', 'Path to Playwright test spec (*.spec.ts)')
  .argument('<url>', 'Target URL where selector changed')
  .action(async (specFile, url) => {
    console.log(chalk.bold.hex('#6366f1')('\n🩺 Testera Luna: Self-Healing Spec Repair'));
    console.log(chalk.gray(`Spec: ${specFile}`));
    console.log(chalk.gray(`URL: ${url}\n`));

    const spinner = ora('Scanning page and locating candidate element replacements...').start();

    const config: FrameworkConfig = {
      provider: 'mock',
      headless: true,
      slowMo: 0,
      viewport: { width: 1280, height: 800 },
      artifactsDir: './reports',
      maxSteps: 5,
      enableAxeCore: true,
      captureScreenshots: false,
    };

    const runtime = new BrowserRuntime(config);
    try {
      const page = await runtime.launch();
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      const observer = new PageObserver(runtime.telemetry, { artifactsDir: './reports', captureScreenshots: false });
      const obs = await observer.observe(page, 1);

      let specContent = await fs.readFile(specFile, 'utf-8');

      const locatorRegex = /page\.(getByRole\('([^']+)',\s*\{\s*name:\s*'([^']+)'[^}]*\}\)|getByTestId\('([^']+)'\)|locator\('([^']+)'\))/g;
      const matches = [...specContent.matchAll(locatorRegex)];

      let repairedCount = 0;
      for (const match of matches) {
        const fullExpr = match[0];
        let role = 'button';
        let name = '';
        let testId: string | undefined;
        let selector: string | undefined;
        let loc: any;

        if (match[2] && match[3]) {
          role = match[2];
          name = match[3];
          loc = page.getByRole(role as any, { name, exact: false });
        } else if (match[4]) {
          testId = match[4];
          loc = page.getByTestId(testId);
        } else if (match[5]) {
          selector = match[5];
          loc = page.locator(selector);
        }

        const count = loc ? await loc.count().catch(() => 0) : 0;
        if (count === 0) {
          // Broken locator! Self-heal against current page observation
          const healed = SelfHealer.findHealedElement(
            { role, name, tagName: role === 'link' ? 'a' : 'button', testId, cssSelector: selector || '' },
            obs,
            0.5
          );

          if (healed) {
            let newExpr = '';
            if (healed.match.testId) {
              newExpr = `page.getByTestId('${healed.match.testId}')`;
            } else if (healed.match.role && healed.match.name) {
              newExpr = `page.getByRole('${healed.match.role}', { name: '${healed.match.name}' })`;
            } else {
              newExpr = `page.locator('${healed.match.selector}')`;
            }

            specContent = specContent.replaceAll(fullExpr, newExpr);
            console.log(`\n  ${chalk.strikethrough.red(fullExpr)} ➔ ${chalk.green(newExpr)} (${Math.round(healed.similarity * 100)}% match)`);
            repairedCount++;
          }
        }
      }

      if (repairedCount > 0) {
        await fs.writeFile(specFile, specContent, 'utf-8');
        spinner.succeed(chalk.green(`Successfully healed and patched ${repairedCount} selector(s) in ${specFile}!`));
      } else {
        spinner.info(chalk.yellow('No broken selectors identified that required healing.'));
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`Healing failed: ${err.message}`));
    } finally {
      await runtime.close();
    }
  });

program.parse(process.argv);
