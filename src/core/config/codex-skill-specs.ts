/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Per-skill CLI-first teaching specs — the single source of truth for the
 * `.agents/skills/<name>/SKILL.md` bodies distributed to EVERY CLI agent
 * (Claude, Copilot, Codex, OpenCode, Cursor, Windsurf, Gemini).
 *
 * Hard invariant: **zero MCP**. Every line teaches a real `agf` command —
 * no `mcp__*` verbs, no `start_task`/`finish_task`/`update_status` snake_case.
 * Each skill carries the exact `agf` cheatsheet for its lifecycle phase so the
 * agent knows precisely which commands to drive in that phase.
 */

export interface CodexSkillSpec {
  /** Canonical lifecycle phase label (uppercase) used as `category`. */
  phase: string
  /** One-line description for frontmatter + skill listing. */
  summary: string
  /** Bullets: when this skill applies. */
  when: string[]
  /** The phase cheatsheet — pairs of [`agf` command, what it does]. */
  commands: Array<readonly [string, string]>
  /** A single compact happy-path flow line (CLI-first). */
  flow: string
  /** Exit criteria checkboxes. */
  exit: string[]
  /** Workflow steps — numbered, with concrete commands and examples. */
  steps?: string[]
  /** Anti-patterns — what NOT to do. */
  antiPatterns?: string[]
  /** Output format template for the skill. */
  outputTemplate?: string
  /** Related skills for cross-references. */
  relatedSkills?: string[]
  /** Toolchain commands used by this skill. */
  toolchain?: string[]
  /** Constraints or guardrails for this phase. */
  constraints?: string[]
}

/** Specs for the distributed lifecycle skills (see CODEX_SKILL_NAMES). */
export const CODEX_SKILL_SPECS: Record<string, CodexSkillSpec> = {
  'graph-backlog-generation': {
    phase: 'PLAN',
    summary:
      'Human-in-the-loop planner — investigate then run ANALYZE/DESIGN/PLAN to inject a complete PRD as graph backlog (5W2H, JTBD, Pareto, MoSCoW, INVEST, GWT, Risk Matrix, Lean, SOLID, STRIDE/OWASP as AC) + spec-kit (constitution/spec/preset). PLAN-ONLY: emits graph nodes + text, never code/git. Carries a deterministic low-reasoning fast-path so light models (Haiku/Flash/MiniMax) plan deterministically.',
    when: [
      'Start of a cycle, a vague idea, or "what should we build next?"',
      'Backlog empty/stale or a cycle just shipped (iterate from findings)',
      'Importing or structuring a PRD into the graph',
    ],
    commands: [
      ['agf stats --select data.byStatus', 'Investigate the project state (dogfood seed)'],
      ['agf gaps --severity required', 'Surface required gaps to plan against'],
      ['agf generate-prd "<idea>"', 'Draft a PRD from a prompt'],
      ['agf import-prd <file> --build-tree', 'Import PRD → graph (epics + tasks + edges)'],
      ['agf decompose', 'Break large tasks into atomic (≤2h) subtasks'],
      ['agf node add --ac "<GWT>" --ac "<GWT>"', 'Testable AC — multiple discrete criteria'],
      ['agf constitution', 'Spec-kit — governing principles enforced at every gate'],
      ['agf gate design', 'Definition of Ready (7 checks)'],
    ],
    flow: 'investigate → generate-prd/import-prd → decompose → node add + edge add (AC) → constitution/spec → gaps → gate design → STOP for human ⇆ iterate',
    exit: [
      'Complete PRD injected as graph backlog (epics + tasks + AC)',
      'Every required gap closed',
      'DoR (gate design) passes; prd_quality ≥ 60',
      'Stopped for human review; ready for graph-builder-leafcutter',
    ],
    antiPatterns: [
      'DO NOT implement/test/review here — that is graph-builder-leafcutter',
      'DO NOT write or edit code, or create/switch/commit a git branch — PLAN-ONLY',
      'DO NOT emit one run-on AC — use multiple discrete Given-When-Then criteria',
      'DO NOT skip the investigate step — backlog must be grounded in real findings',
    ],
    relatedSkills: ['graph-builder-leafcutter', 'graph-woodpecker'],
    constraints: [
      'PLAN-ONLY — emits graph nodes + text; never touches code or git',
      'Deterministic low-reasoning fast-path for light models (framework names → inline rules)',
      'CLI-first: agf generate-prd/import-prd/decompose/constitution/gate — zero MCP',
    ],
  },
  'graph-builder-leafcutter': {
    phase: 'BUILD',
    summary:
      'Autonomous build+learn loop — consume the backlog and implement it (TDD → review → test → handoff → listening) with ACO/pheromone + GA-inspired selection and full context economy (--ai, RAG-IN/OUT/cache, scaffold reuse). BUILD-ONLY: implements existing nodes, never plans; OWNS git (branch→TDD→merge→commit→delete). Hierarchical gates (blast/node/full + agf gate) and cost routing (provider/model). Deterministic low-reasoning fast-path for light models (Haiku/Flash/MiniMax).',
    when: [
      'An unblocked task exists; implement the backlog end-to-end',
      'Run agf on its own backlog autonomously, perpetually',
      'A backlog was just injected and needs execution',
    ],
    commands: [
      ['agf start', 'next + context + mark in_progress (WIP=1)'],
      ['agf brief <id>', 'Delegation spec for the executor'],
      ['agf retrieve-command "<intenção>"', 'RAG-IN: exact command for an intent'],
      ['agf scaffold <name>', 'Deterministic boilerplate — reuse before writing new'],
      ['agf check <id> && npm run test:blast', 'DoD + blast gate (hierarchical: blast/node/full)'],
      ['agf provider use <id>', 'Route by cost — gateway + tier (cheap→build→frontier)'],
      ['agf done <id>', 'Close the task (9 DoD checks, epic promotion)'],
      [
        'agf autopilot',
        'Autonomous loop; on empty backlog (NO_TASKS) it HARVESTS by default (migrate-ac + risk-surface + wire-dormant) and re-feeds the loop — pass --no-harvest to opt out',
      ],
      ['agf savings --select data.totalSaved', 'Measure economy from the ledger'],
    ],
    flow: 'scan → next (WIP=1) → INVESTIGATE (expand, not recreate) → BUILD (TDD + economy) → check + test:blast → done/submit → learn (pheromone) → select next by fitness → on NO_TASKS HARVEST by default (migrate-ac + risk-surface + wire-dormant; --no-harvest opts out) → re-pull if it generated work → repeat',
    exit: [
      '9 DoD checks pass; test:blast green',
      'Pheromone trail deposited; reusable rule generated',
      'Epic promotion checked',
      'On NO_TASKS the harvest pass runs by default (--no-harvest opts out) and re-feeds the loop; only when harvest is ALSO dry → signal graph-backlog-generation',
    ],
    antiPatterns: [
      'DO NOT plan/PRD/decompose scope here — consume the backlog (BUILD-ONLY)',
      'DO NOT break WIP=1 — one in_progress task at a time',
      'DO NOT write new code where a scaffold or RAG-OUT entry exists — reuse first',
      'DO NOT lower a gate to pass, or mark done on a false claim',
    ],
    relatedSkills: ['graph-backlog-generation', 'graph-woodpecker'],
    toolchain: [
      'agf start',
      'agf done',
      'agf check',
      'agf brief',
      'agf submit',
      'agf gate',
      'agf harness',
      'agf gaps',
      'agf scaffold',
      'agf provider',
      'agf economy',
      'agf learning',
      'agf savings',
      'agf heal',
    ],
    constraints: [
      "WIP=1 at all times (Little's Law); BUILD-ONLY — never plans; owns git",
      'Reuse > duplication: scaffold/RAG-OUT before new code',
      'Deterministic low-reasoning fast-path for light models; CLI-first, --ai/--select — zero MCP',
    ],
  },
  'graph-woodpecker': {
    phase: 'HARDEN',
    summary:
      'Autonomous harden loop — hunt and fix bugs, security vulns (STRIDE/OWASP), quality rot, and logging/observability gaps; every finding becomes a bug/risk node, every fix is proven by a reproducing regression test (RED→GREEN) with coverage ≥80% and observability wired in the same change',
    when: [
      'Code exists and works but needs hardening (bugs, vulns, debt, blind spots)',
      'A security/quality/coverage audit is due, or a regression hotspot needs attention',
      'Coverage is below 80%, logs are thin, or failures are silent',
    ],
    commands: [
      ['agf harness --violations --select data.violations', 'Find quality/type/doc/naming/error flaws'],
      ['agf gaps --severity required --select data', 'Find missing tests / edge / error cases'],
      ['agf lint && agf quality', 'Lint + security rules + quality bars'],
      ['agf node add --type bug "<flaw> @ file:line"', 'File every finding (never fix silently)'],
      ['agf tdd-score <id> --select data.score', 'Coverage/TDD quality — ≥80 required'],
      ['agf check <id> && npm run test:blast', 'DoD + blast gate (green)'],
      ['agf done <id>', 'Close honestly — the regression test proves the fix'],
    ],
    flow: 'hunt (harness·gaps·lint·insights) → file bug/risk nodes → pick by severity (WIP=1) → reproduce (RED) → root-cause (5 Whys/bisect) → fix (GREEN) + observability → coverage ≥80% + STRIDE/OWASP → check + blast → done → learn → repeat',
    exit: [
      'Every flaw tracked as a bug/risk node; none fixed silently',
      'Each fix has a reproducing regression test (RED→GREEN)',
      'Coverage ≥80% (tdd-score); STRIDE/OWASP pass; harness clean',
      'Failure paths carry structured logs + RED/USE metrics (observability)',
    ],
    antiPatterns: [
      'DO NOT fix without a reproducing test — that is a guess',
      'DO NOT fix the symptom — 5 Whys to the root cause',
      'DO NOT lower a gate (test/lint/coverage) to go green',
      'DO NOT leave a failure path silent — log + metric is part of the fix',
      'DO NOT plan or build new features here — harden what already exists',
    ],
    relatedSkills: ['graph-builder-leafcutter', 'graph-backlog-generation'],
    toolchain: [
      'agf harness',
      'agf gaps',
      'agf lint',
      'agf quality',
      'agf check',
      'agf tdd-score',
      'agf insights',
      'agf provenance',
      'agf node add',
      'agf done',
      'agf heal',
      'agf memory',
    ],
    constraints: [
      'Every finding → a bug/risk node; every fix → a regression test (RED→GREEN)',
      'Coverage ≥80%; security STRIDE/OWASP per fix; observability in the same change',
      'CLI-first, output compressed via --ai/--select — zero MCP',
    ],
  },
}

/**
 * Skill index + approach-selection table, DERIVED from {@link CODEX_SKILL_SPECS}
 * (never hand-maintained). Emitted into every generated CLI context so any agent
 * can read it and pick the right lifecycle skill for the current intent. The
 * "Quando usar" column is the selection signal (situation → skill).
 */
export function buildSkillIndex(): string {
  const esc = (s: string): string => s.replace(/\|/g, '\\|')
  const rows = Object.entries(CODEX_SKILL_SPECS).map(([name, spec]) => {
    const when = esc(spec.when[0] ?? spec.summary)
    const entry = esc(spec.commands[0]?.[0] ?? `agf skill show ${name}`)
    const related = esc((spec.relatedSkills ?? []).join(', '))
    return `| \`${name}\` | ${spec.phase} | ${when} | \`${entry}\` | ${related} |`
  })
  return [
    '### Índice de skills do ciclo (escolha a abordagem certa)',
    '',
    'Qualquer CLI lê esta tabela pra escolher a skill certa pro intent atual — a coluna **Quando usar** mapeia situação → skill. Rode com `agf skill show <name>` ou siga o comando de entrada.',
    '',
    '| Skill | Fase | Quando usar | Comando de entrada | Skills relacionadas |',
    '|-------|------|-------------|--------------------|---------------------|',
    ...rows,
  ].join('\n')
}

/** Generic fallback spec for skill names without an explicit entry. */
/**
 * Shared token-discipline footer woven into EVERY rendered skill body. Teaches the
 * `--select` field projection that closes the agentic loop: every `agf` command
 * prints a single-line JSON envelope, so consume only the fields you need.
 */
export const SELECT_DISCIPLINE = `
## Token Discipline (\`--select\`)

Every \`agf\` command prints a **single-line JSON** envelope to stdout
(\`{ok,code,data,error,meta}\`); logs are NDJSON on stderr. Consume the smallest slice:

- \`agf <cmd> --select data.x,data.y\` — project only the fields you need (no \`jq\`; ~80–90% fewer tokens). Always keeps \`ok\`/\`code\`/\`error\`/\`meta\`; an invalid path falls back to the full envelope (never errors). E.g. \`agf next --select data.node.id,data.node.title\`.
- \`agf <cmd> --profile claude-code|copilot|opencode|minimal\` — agent-aware field presets per command (\`--select\` wins when both are given).
- \`agf exec pipe <cmd>\` returns the inner \`.data\`; \`agf exec chain "next; check <id>"\` runs a sequence — cross-platform, no shell.
- \`--pretty\` is for humans only. Never wrap \`agf\` in \`agf compress\` — its output is already minimal.
`
