// ============================================================================
// CLI - Command-line interface for manual scan execution
// ============================================================================

import { Command } from 'commander';
import { Orchestrator } from './orchestrator';
import { AgentType, Platform } from './types';

const program = new Command();

program
  .name('vzy-agent')
  .description('VZY OTT Verification Agent - Security, Performance & Code Quality Scanner')
  .version('1.0.0');

program
  .command('scan')
  .description('Run a scan against an OTT website or codebase')
  .option('-u, --url <url>', 'Target website URL')
  .option('-r, --repo-path <path>', 'Path to source code repository')
  .option('-a, --agent <agents>', 'Comma-separated agents: security,performance,code-quality', 'security,performance,code-quality')
  .option('-p, --platform <platform>', 'Platform: desktop, mweb, both', 'both')
  .option('-o, --output <path>', 'Output report path', './scan-results')
  .option('--json', 'Output raw JSON report')
  .action(async (options) => {
    if (!options.url && !options.repoPath) {
      console.error('Error: Either --url or --repo-path is required');
      process.exit(1);
    }

    const agents = options.agent.split(',').map((a: string) => a.trim()) as AgentType[];
    const orchestrator = new Orchestrator();

    const config = Orchestrator.createConfig({
      url: options.url,
      repoPath: options.repoPath,
      agents,
      platform: options.platform as Platform,
    });

    console.log(`\n  VZY OTT Verification Agent v1.0.0`);
    console.log(`  Target:    ${options.url || options.repoPath}`);
    console.log(`  Agents:    ${agents.join(', ')}`);
    console.log(`  Platform:  ${options.platform}`);
    console.log(`  Scan ID:   ${config.id}\n`);

    try {
      const report = await orchestrator.runScan(config);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printReport(report);
      }

      process.exit(report.kpiScore.passesThreshold ? 0 : 1);
    } catch (error) {
      console.error('Scan failed:', error);
      process.exit(2);
    }
  });

function printReport(report: any): void {
  const { kpiScore } = report;
  const bar = (score: number, max: number = 100) => {
    const filled = Math.round(score / max * 30);
    return '█'.repeat(filled) + '░'.repeat(30 - filled);
  };

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  OVERALL SCORE: ${kpiScore.overallScore.toString().padStart(5)}/100  ${kpiScore.passesThreshold ? '✅ PASS' : '❌ FAIL'}                    ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Security:     ${bar(kpiScore.grades.security.rawScore)} ${kpiScore.grades.security.rawScore.toString().padStart(3)}/100 ║`);
  console.log(`║  Performance:  ${bar(kpiScore.grades.performance.rawScore)} ${kpiScore.grades.performance.rawScore.toString().padStart(3)}/100 ║`);
  console.log(`║  Code Quality: ${bar(kpiScore.grades.codeQuality.rawScore)} ${kpiScore.grades.codeQuality.rawScore.toString().padStart(3)}/100 ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Trend: ${kpiScore.trend.direction.padEnd(10)} (${kpiScore.trend.delta > 0 ? '+' : ''}${kpiScore.trend.delta.toFixed(1)})                           ║`);
  console.log(`║  Critical Findings: ${report.criticalFindings.length.toString().padStart(3)}                                  ║`);
  console.log(`║  Regressions:       ${kpiScore.regressions.length.toString().padStart(3)}                                  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (report.criticalFindings.length > 0) {
    console.log('\n🔴 Critical/High Findings:');
    for (const f of report.criticalFindings.slice(0, 10)) {
      console.log(`   [${f.severity.toUpperCase().padEnd(8)}] ${f.title}`);
    }
  }

  if (report.recommendations.length > 0) {
    console.log('\n📋 Top Recommendations:');
    for (const r of report.recommendations.slice(0, 5)) {
      console.log(`   ${r.priority}. ${r.title} (effort: ${r.effort})`);
    }
  }

  console.log(`\n📄 Full report: ./scan-results/${report.scanId}.json\n`);
}

program.parse();
