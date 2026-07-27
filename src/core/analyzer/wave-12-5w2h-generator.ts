/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Wave-12 5W2H Analysis Generator
 *
 * Generates and manages 5W2H strategic planning documents
 * for the Sandbox Build initiative with persistence to SQLite.
 */

import { createLogger } from '../utils/logger.js'
import {
  // Re-exported through `validateWave125W2HAnalysis` below — imported here for
  // documentation/IDE discoverability of the full contract surface.
  Wave125W2HAnalysisSchema as _Wave125W2HAnalysisSchema,
  Wave125W2HAnalysis,
  validateWave125W2HAnalysis,
} from '../../schemas/wave-12-5w2h-analysis.js'

const log = createLogger({ layer: 'core', source: 'wave-12-5w2h-generator.ts' })

/**
 * Generate default 5W2H analysis for Wave-12 Sandbox Build
 */
export function generateWave125W2HAnalysis(): Wave125W2HAnalysis {
  const now = new Date().toISOString()

  return {
    initiative_id: 'wave-12-sandbox-build',
    initiative_name: 'Wave-12: Sandbox Build (Local CI/CD Isolation)',
    created_at: now,
    last_updated: now,

    // Why: Strategic Rationale
    why: {
      rationale:
        'Faster feedback loops reduce CI/CD cycle time from hours to minutes, enabling deterministic local validation before remote CI runs. Improves developer confidence and reduces resource waste from late-stage failures.',
      benefits: [
        'Lower cost per iteration - fail fast locally instead of in expensive CI runners',
        'Increased local confidence - developers validate changes before push',
        'Deterministic gate before remote CI - prevents wasted CI/CD resources',
        'Reduced context-switching - immediate feedback loop integrated into workflow',
      ],
      risks_mitigated: [
        'Late-stage test failures that delay releases',
        'CI resource waste from preventable failures',
        'Integration surprises between local and CI environments',
        'Developer frustration from long feedback loops',
      ],
    },

    // What: Artifacts and Deliverables
    what: {
      artifact: 'Sandbox CLI tool with Docker/Podman/Process fallback for local isolation',
      deliverables: [
        'npm command: sandbox resolve (dependency resolution with lockfile pinning)',
        'npm command: sandbox build (TypeScript compilation + Vite bundling)',
        'npm command: sandbox test (Vitest execution with coverage)',
        'npm command: sandbox lint (ESLint validation)',
        'npm command: sandbox report (structured JSON output for CI integration)',
        'npm command: sandbox env (environment validation and setup)',
        'npm command: sandbox clean (cleanup and cache invalidation)',
        'Deterministic fingerprinting system for caching and reproducibility',
        'Integration with mcp-graph task lifecycle (start_task/finish_task)',
      ],
      scope: 'hybrid',
    },

    // Who: Stakeholders
    who: {
      primary_stakeholders: [
        {
          role: 'AI Developers',
          responsibilities: [
            'Use start_task → sandbox resolve/build/test → finish_task',
            'Debug sandbox failures and report issues',
            'Contribute implementations for sandbox actions',
            'Iterate on PRs with local validation',
          ],
          count_estimate: 15,
        },
        {
          role: 'QA Engineers',
          responsibilities: [
            'Validate sandbox outputs against expected behavior',
            'Report regressions and edge cases',
            'Maintain test suite for sandbox correctness',
            'Cross-environment validation (Docker vs Podman vs process)',
          ],
          count_estimate: 5,
        },
      ],
      secondary_stakeholders: [
        {
          role: 'Infra/DevOps Teams',
          responsibilities: [
            'Monitor sandbox resource usage in CI',
            'Tune isolation configs for different environments',
            'Maintain sandbox binary distribution',
            'Troubleshoot cross-platform compatibility',
          ],
          count_estimate: 2,
        },
        {
          role: 'Project Maintainers',
          responsibilities: [
            'Define sandbox policies and gates',
            'Review and approve sandbox configuration changes',
            'Monitor quality metrics from sandbox executions',
          ],
          count_estimate: 1,
        },
      ],
    },

    // When: Timeline
    when: {
      timeline_phases: [
        {
          phase_name: 'ANALYZE',
          duration_weeks: 1,
          dependencies: [],
        },
        {
          phase_name: 'DESIGN',
          duration_weeks: 1,
          dependencies: ['ANALYZE'],
        },
        {
          phase_name: 'PLAN',
          duration_weeks: 1,
          dependencies: ['DESIGN'],
        },
        {
          phase_name: 'IMPLEMENT',
          duration_weeks: 2,
          dependencies: ['PLAN'],
        },
        {
          phase_name: 'VALIDATE',
          duration_weeks: 1,
          dependencies: ['IMPLEMENT'],
        },
        {
          phase_name: 'REVIEW',
          duration_weeks: 1,
          dependencies: ['VALIDATE'],
        },
      ],
      total_duration_weeks: 7,
      critical_milestone: 'MVP with resolve + build + test on local Docker ready for pilot',
    },

    // Where: Environments
    where: {
      execution_environments: [
        {
          name: 'local',
          purpose: 'Developer pre-push validation on workstations',
          access_requirements: ['Docker or Podman installed', 'Node.js >= 18', 'npm >= 9'],
        },
        {
          name: 'ci-pipeline',
          purpose: 'Automated sandbox execution in release workflow',
          access_requirements: ['CI runner with Docker support', 'Sandbox binary in PATH'],
        },
        {
          name: 'team-machines',
          purpose: 'Shared validation environment for code reviews',
          access_requirements: ['Standard dev VM image', 'Docker pre-installed'],
        },
      ],
      primary_environment: 'local',
    },

    // How: Technical Approach
    how: {
      approach:
        '3-tier isolation with content-addressable caching and deterministic fingerprinting for reproducibility across environments',
      architecture_tiers: [
        {
          name: 'Resolver (Layer 1)',
          responsibility: 'Deterministic dependency resolution with lockfile pinning and offline capability',
          technology_stack: ['npm ci', 'package-lock.json', 'npm cache', 'SHA256 fingerprinting'],
        },
        {
          name: 'Builder (Layer 2)',
          responsibility: 'Isolated compilation with artifact caching by content hash',
          technology_stack: ['TypeScript tsc', 'Vite bundler', 'Content-addressed cache', 'Deterministic seed'],
        },
        {
          name: 'Reporter (Layer 3)',
          responsibility: 'Structured test execution and failure reporting',
          technology_stack: [
            'Vitest with fixed seed',
            'JSON output format',
            'Code coverage metrics',
            'Performance tracing',
          ],
        },
      ],
      key_mechanisms: [
        'Deterministic execution via fixed random seed (reproducible across runs)',
        'Content addressable caching by fingerprint (shared across team)',
        'Isolation via Docker/Podman containers (strong boundary)',
        'Process namespace fallback if containerization unavailable',
        'Exit code semantics for CI integration (0=success, >0=failure)',
      ],
      fallback_strategies: [
        'Process isolation fallback when Docker/Podman unavailable',
        'Temp directory with ownership-based cleanup if no sandboxing available',
        'Skip caching if storage unavailable (slow but correct)',
        'Graceful degradation: prefer Docker > Podman > process > error',
      ],
    },

    // How Much: Cost and Effort
    how_much: {
      cost_summary: {
        development_effort_person_weeks: 8,
        infrastructure_cost_usd_monthly: 150,
        maintenance_effort_percent: 15,
      },
      team_size: {
        developers: 2,
        qa_engineers: 1,
        devops_infra: 1,
      },
      resource_requirements: {
        compute_hours_per_week: 40,
        storage_gb: 10,
        concurrent_executions: 5,
      },
      incremental_phases: [
        {
          phase: 'MVP (Phase 1-2)',
          effort_weeks: 2,
          scope: 'Basic resolve + build + test on local Docker with minimal caching and reporting',
        },
        {
          phase: 'V1 (Phase 3-4)',
          effort_weeks: 2,
          scope: 'Add lint + report + basic fingerprint-based caching, process isolation fallback',
        },
        {
          phase: 'V2 (Phase 5-6)',
          effort_weeks: 2,
          scope: 'CI/CD pipeline integration, shared cache management, multi-environment support',
        },
        {
          phase: 'V3 (Phase 7+)',
          effort_weeks: 2,
          scope: 'Advanced features: distributed caching, analytics, environment parity validation',
        },
      ],
    },
  }
}

/**
 * Validate and return 5W2H analysis
 */
export function validate5W2HAnalysis(
  data: unknown,
): { valid: true; data: Wave125W2HAnalysis } | { valid: false; errors: string[] } {
  const resultValue = validateWave125W2HAnalysis(data)

  if (!resultValue.valid) {
    log.error('5W2H validation failed', {
      errors: resultValue.errors,
    })
  }

  return resultValue
}

/**
 * Format 5W2H analysis for display
 */
export function format5W2HForDisplay(analysis: Wave125W2HAnalysis): string {
  const lines: string[] = []

  lines.push(`\n${'='.repeat(80)}`)
  lines.push(`Wave-12 5W2H Analysis: ${analysis.initiative_name}`)
  lines.push(`Generated: ${analysis.created_at}`)
  lines.push(`${'='.repeat(80)}\n`)

  // Why
  lines.push('WHY (Strategic Rationale)')
  lines.push('-'.repeat(40))
  lines.push(`Rationale: ${analysis.why.rationale}\n`)
  lines.push('Benefits:')
  analysis.why.benefits.forEach((b) => lines.push(`  • ${b}`))
  if (analysis.why.risks_mitigated?.length) {
    lines.push('\nRisks Mitigated:')
    analysis.why.risks_mitigated.forEach((r) => lines.push(`  • ${r}`))
  }

  // What
  lines.push('\n\nWHAT (Artifacts & Deliverables)')
  lines.push('-'.repeat(40))
  lines.push(`Artifact: ${analysis.what.artifact}`)
  lines.push(`Scope: ${analysis.what.scope}\n`)
  lines.push('Deliverables:')
  analysis.what.deliverables.forEach((d) => lines.push(`  • ${d}`))

  // Who
  lines.push('\n\nWHO (Stakeholders)')
  lines.push('-'.repeat(40))
  lines.push('Primary Stakeholders:')
  analysis.who.primary_stakeholders.forEach((s) => {
    const count = s.count_estimate ? ` (${s.count_estimate})` : ''
    lines.push(`  ${s.role}${count}:`)
    s.responsibilities.forEach((r) => lines.push(`    - ${r}`))
  })

  // When
  lines.push('\n\nWHEN (Timeline)')
  lines.push('-'.repeat(40))
  lines.push(`Total Duration: ${analysis.when.total_duration_weeks} weeks`)
  lines.push('Phases:')
  analysis.when.timeline_phases.forEach((p) => {
    lines.push(`  ${p.phase_name}: ${p.duration_weeks}w`)
  })
  lines.push(`Critical Milestone: ${analysis.when.critical_milestone}`)

  // Where
  lines.push('\n\nWHERE (Environments)')
  lines.push('-'.repeat(40))
  lines.push(`Primary: ${analysis.where.primary_environment}`)
  lines.push('Execution Environments:')
  analysis.where.execution_environments.forEach((e) => {
    lines.push(`  ${e.name}: ${e.purpose}`)
  })

  // How
  lines.push('\n\nHOW (Technical Approach)')
  lines.push('-'.repeat(40))
  lines.push(`Approach: ${analysis.how.approach}\n`)
  lines.push('Architecture Tiers:')
  analysis.how.architecture_tiers.forEach((t) => {
    lines.push(`  ${t.name}:`)
    lines.push(`    ${t.responsibility}`)
    lines.push(`    Stack: ${t.technology_stack.join(', ')}`)
  })
  lines.push('\nKey Mechanisms:')
  analysis.how.key_mechanisms.forEach((m) => lines.push(`  • ${m}`))

  // How Much
  lines.push('\n\nHOW MUCH (Cost & Effort)')
  lines.push('-'.repeat(40))
  lines.push(`Development Effort: ${analysis.how_much.cost_summary.development_effort_person_weeks}pw`)
  lines.push(
    `Team Size: ${analysis.how_much.team_size.developers}dev + ${analysis.how_much.team_size.qa_engineers}qa + ${analysis.how_much.team_size.devops_infra}infra`,
  )
  lines.push('Incremental Phases:')
  analysis.how_much.incremental_phases.forEach((p) => {
    lines.push(`  ${p.phase} (${p.effort_weeks}w): ${p.scope}`)
  })

  lines.push(`\n${'='.repeat(80)}\n`)

  return lines.join('\n')
}
