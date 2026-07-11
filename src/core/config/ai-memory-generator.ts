/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Generates AI instruction sections for CLAUDE.md, AGENTS.md, and
 * .github/copilot-instructions.md.
 *
 * CLI-first: the generated body teaches agents to drive the project through the
 * `agf` CLI — zero MCP. Both outputs are idempotent (use markers to detect
 * existing sections).
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  AGF_MANDATORY_RULE,
  AGF_ECONOMY,
  AGF_GAPS,
  AGF_EXECUTOR_BRIEF,
  AGF_WORKFLOW,
  AGF_LIFECYCLE,
  AGF_FLOW_PRINCIPLES,
  AGF_DOD,
  AGF_XP_PRINCIPLES,
  AGF_TEST_TIERS,
  AGF_SPECKIT,
  AGF_MEMORY_RULE,
  AGF_GOLDEN_RULES,
} from './cli-reference-content.js'
import { buildSkillIndex } from './codex-skill-specs.js'

export const MARKER_START = '<!-- agent-graph-flow:start -->'
export const MARKER_END = '<!-- agent-graph-flow:end -->'

/** Legacy markers from the MCP era — stripped on update so old files migrate cleanly. */
export const LEGACY_MARKER_START = '<!-- mcp-graph:start -->'
export const LEGACY_MARKER_END = '<!-- mcp-graph:end -->'

/**
 * Heading of the JSON Output Contract section. A pre-idempotency appender stranded
 * copies of this section AFTER {@link MARKER_END}; {@link applySection} sweeps any
 * occurrence trailing the marker so the duplication self-heals on the next regen.
 */
export const STRANDED_CONTRACT_HEADING = '## agf JSON Output Contract'

/** Remove any legacy `mcp-graph`-marked block so a fresh agent-graph-flow section replaces it. */
function stripLegacySection(content: string): string {
  const startIdx = content.indexOf(LEGACY_MARKER_START)
  const endIdx = content.indexOf(LEGACY_MARKER_END)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return content
  const before = content.substring(0, startIdx).trimEnd()
  const after = content.substring(endIdx + LEGACY_MARKER_END.length).trimStart()
  const beforePart = before.length > 0 ? before + '\n\n' : ''
  const afterPart = after.length > 0 ? after : ''
  return beforePart + afterPart
}

const LEAN_DISCOVERY_HINT = `> **Referência completa de comandos (sob demanda, ~0 token — não fixada aqui):** \`agf help\` (índice agrupado dos 260+ comandos) · \`agf <comando> --help\` (flags de um comando) · \`agf retrieve-command "<intenção>"\` (RAG-IN: intenção em linguagem natural → comando exato) · \`agf skill list\` (skills do ciclo de vida).
>
> **Web local (\`agf dashboard\`):** SPA com 2 abas — **Grafo** (\`@xyflow\`, busca/filtros/drill-down) e **Economia** (custo real, economia delegate, cache local, levers). Mesma paleta do \`agf\` TUI/the project site. Sobe via \`agf dashboard\` ou \`agf init\` (serve automático).`

// ── Project Context Detection ─────────────────────────────────────────

export interface ProjectContext {
  stack: string[]
  testFramework?: string
  hasTypeScript: boolean
  hasReact: boolean
  hasNode: boolean
  hasPython: boolean
  hasRust: boolean
  hasGo: boolean
  packageManager?: string
  isMonorepo: boolean
}

/** Detect project stack from filesystem signals. */
export function detectProjectContext(projectDir: string): ProjectContext {
  const ctx: ProjectContext = {
    stack: [],
    hasTypeScript: false,
    hasReact: false,
    hasNode: false,
    hasPython: false,
    hasRust: false,
    hasGo: false,
    isMonorepo: false,
  }

  const has = (p: string) => existsSync(path.join(projectDir, p))

  // Node / TypeScript
  if (has('package.json')) {
    ctx.hasNode = true
    ctx.stack.push('node')
    try {
      const pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf-8')) as Record<string, unknown>
      const deps = {
        ...((pkg.dependencies ?? {}) as Record<string, unknown>),
        ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
      }
      if (deps['typescript']) {
        ctx.hasTypeScript = true
        ctx.stack.push('typescript')
      }
      if (deps['react'] || deps['react-dom'] || deps['next']) {
        ctx.hasReact = true
        ctx.stack.push('react')
      }
      if (deps['vitest'] || deps['jest'] || deps['mocha']) {
        ctx.testFramework = deps['vitest'] ? 'vitest' : deps['jest'] ? 'jest' : 'mocha'
        ctx.stack.push(ctx.testFramework)
      }
      if (deps['turbo'] || deps['nx'] || deps['lerna']) {
        ctx.isMonorepo = true
        ctx.stack.push('monorepo')
      }
    } catch {
      /* ignore parse errors */
    }
  }
  if (has('tsconfig.json') || has('tsconfig.base.json')) {
    if (!ctx.hasTypeScript) {
      ctx.hasTypeScript = true
      ctx.stack.push('typescript')
    }
  }
  if (has('pnpm-lock.yaml')) ctx.packageManager = 'pnpm'
  else if (has('yarn.lock')) ctx.packageManager = 'yarn'
  else if (has('bun.lockb')) ctx.packageManager = 'bun'
  else if (has('package-lock.json')) ctx.packageManager = 'npm'

  // Python
  if (has('requirements.txt') || has('pyproject.toml') || has('setup.py') || has('Pipfile')) {
    ctx.hasPython = true
    ctx.stack.push('python')
  }

  // Rust
  if (has('Cargo.toml')) {
    ctx.hasRust = true
    ctx.stack.push('rust')
  }

  // Go
  if (has('go.mod')) {
    ctx.hasGo = true
    ctx.stack.push('go')
  }

  // Monorepo
  if (has('pnpm-workspace.yaml') || has('lerna.json') || has('turbo.json')) {
    ctx.isMonorepo = true
    if (!ctx.stack.includes('monorepo')) ctx.stack.push('monorepo')
  }

  return ctx
}

/** Generate adaptive rules based on detected stack. */
function buildAdaptiveRules(ctx: ProjectContext): string {
  const rules: string[] = []

  if (ctx.hasTypeScript) {
    rules.push(
      '- **TypeScript**: Usar tipos estritos (`strict: true`). Evitar `any`. Tipar retornos de funções públicas.',
    )
  }

  if (ctx.hasReact) {
    rules.push(
      '- **React**: Componentes funcionais com hooks. Props tipadas via interfaces. Evitar `useEffect` com deps vazias. Testar com React Testing Library (RTL).',
    )
  }

  if (ctx.testFramework) {
    const tf = ctx.testFramework
    if (tf === 'vitest') {
      rules.push(
        '- **Testes (Vitest)**: Arquivos `*.test.ts`. Use `describe`/`it`/`expect`. Mock com `vi.fn()`. Blast: `npm run test:blast`.',
      )
    } else if (tf === 'jest') {
      rules.push('- **Testes (Jest)**: Arquivos `*.test.ts`. Use `describe`/`it`/`expect`. Mock com `jest.fn()`.')
    }
  }

  if (ctx.hasNode) {
    rules.push('- **Node.js**: ESM preferido (`"type": "module"`). Use `node:` prefix em imports built-in.')
  }

  if (ctx.hasPython) {
    rules.push('- **Python**: Type hints obrigatórias (`def foo(x: int) -> str`). Use `pytest` para testes. PEP 8.')
  }

  if (ctx.hasRust) {
    rules.push('- **Rust**: `cargo test` para testes. Ownership/borrowing corretos. `clippy` e `rustfmt` obrigatórios.')
  }

  if (ctx.hasGo) {
    rules.push('- **Go**: `go test` para testes. Error handling explícito (`if err != nil`). `gofmt` obrigatório.')
  }

  if (ctx.isMonorepo) {
    rules.push(
      '- **Monorepo**: Mudanças afetam múltiplos pacotes. Verificar blast radius com `agf insights` antes de refactor.',
    )
  }

  if (ctx.packageManager) {
    rules.push(`- **Package Manager**: ${ctx.packageManager}. Lockfile deve estar versionado.`)
  }

  if (rules.length === 0) return ''

  return `### Contexto do Projeto

Stack detectada: ${ctx.stack.join(', ')}.

${rules.join('\n')}
`
}

const CODEX_AGENT_RULES = `### Codex-Specific Rules

- Root project instructions live in \`AGENTS.md\`; repo-scoped skills live in \`.agents/skills/<skill>/SKILL.md\`.
- Drive the project through the \`agf\` CLI — there is NO MCP server. Use \`agf next\`/\`agf start\`/\`agf check\`/\`agf done\` and the graph commands directly.
- In Plan Mode, use \`agf\` read commands (\`agf stats\`, \`agf query\`, \`agf context\`) for discovery only. Do not edit files until the user asks for implementation outside Plan Mode.
- During implementation, use \`apply_patch\` for manual edits and preserve unrelated user changes in the worktree.
- Respect sandbox and approval prompts. If a required command fails because of sandbox/network restrictions, rerun it with an approval request.
- Do not spawn subagents unless the user explicitly asks for delegation or parallel agent work.`

/**
 * Build the CLI-first instruction body. All three context-mode variants are
 * 100% `agf` — no MCP tool names, no snake_case verbs.
 */
function buildSectionBody(
  projectName: string,
  mode: 'ultra-lean' | 'lean' | 'full' = 'full',
  projectContext?: ProjectContext,
): string {
  const header = `## agent-graph-flow (\`agf\`) — ${projectName}

Este projeto usa **agent-graph-flow** para gestão de execução via grafo persistente (SQLite).
Dados em \`workflow-graph/graph.db\` (local, gitignored). **Tudo via o CLI \`agf\` — zero MCP.**

${AGF_MANDATORY_RULE}`

  const adaptiveRules = projectContext ? buildAdaptiveRules(projectContext) : ''

  if (mode === 'ultra-lean') {
    const adaptivePart = adaptiveRules ? `\n${adaptiveRules}` : ''
    return `${header}

${AGF_WORKFLOW}

${AGF_LIFECYCLE}

${AGF_MEMORY_RULE}${adaptivePart}

${LEAN_DISCOVERY_HINT}`
  }

  // lean and full both emit the full command surface (CLI-first); full adds the
  // complete doctrine set. There is no MCP "40-tool" mode anymore.
  const adaptivePart = adaptiveRules ? `\n${adaptiveRules}` : ''
  return `${header}

${AGF_GOLDEN_RULES}

${AGF_ECONOMY}

${AGF_GAPS}

${AGF_EXECUTOR_BRIEF}

${AGF_WORKFLOW}

${AGF_LIFECYCLE}

${buildSkillIndex()}

${AGF_DOD}

${AGF_FLOW_PRINCIPLES}

${AGF_XP_PRINCIPLES}

${AGF_TEST_TIERS}

${AGF_SPECKIT}

${AGF_MEMORY_RULE}${adaptivePart}

${LEAN_DISCOVERY_HINT}`
}

/** Generate the agent-graph-flow section for CLAUDE.md. */
export function generateClaudeMdSection(
  projectName: string,
  mode: 'ultra-lean' | 'lean' | 'full' = 'full',
  projectContext?: ProjectContext,
): string {
  return `
${MARKER_START}
${buildSectionBody(projectName, mode, projectContext)}
${MARKER_END}
`
}

/** Generate the agent-graph-flow section for copilot-instructions.md. */
export function generateCopilotInstructions(
  projectName: string,
  mode: 'ultra-lean' | 'lean' | 'full' = 'full',
  projectContext?: ProjectContext,
): string {
  return `${MARKER_START}
${buildSectionBody(projectName, mode, projectContext)}
${MARKER_END}
`
}

/** Generate the agent-graph-flow section for Codex AGENTS.md. */
export function generateCodexAgentsMdSection(
  projectName: string,
  mode: 'ultra-lean' | 'lean' | 'full' = 'full',
  projectContext?: ProjectContext,
): string {
  return `${MARKER_START}
# AGENTS.md — ${projectName}

${CODEX_AGENT_RULES}

${buildSectionBody(projectName, mode, projectContext)}

### Skills

Essential agent-graph-flow workflows live as repo-scoped skills in \`.agents/skills/\`,
consolidated into 3 pillars: \`graph-backlog-generation\` (PLAN), \`graph-builder-leafcutter\`
(BUILD), \`graph-woodpecker\` (HARDEN). List them with \`agf skill list\` and inspect with
\`agf skill show <name>\`. They cadence the \`agf\` CLI, not MCP.
${MARKER_END}
`
}

/**
 * Apply a section to existing content idempotently.
 * If markers exist, replace the section. Otherwise, append.
 */
export function applySection(rawExistingContent: string, newSection: string): string {
  // Migrate legacy `mcp-graph`-marked blocks first so they don't duplicate.
  const existingContent = stripLegacySection(rawExistingContent)
  const startIdx = existingContent.indexOf(MARKER_START)
  const endIdx = existingContent.indexOf(MARKER_END)
  const trimmedSection = newSection.trim() + '\n'

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existingContent.substring(0, startIdx).trimEnd()
    const rawAfter = existingContent.substring(endIdx + MARKER_END.length).trimStart()
    // Self-heal: the JSON Output Contract now lives INSIDE the markers (see
    // agent-format.ts). Older runs appended it AFTER MARKER_END and the appender
    // wasn't idempotent, so copies accumulated on every regen. Strip any stranded
    // contract section(s) trailing the marker so the bloat collapses automatically.
    const strandedIdx = rawAfter.indexOf(STRANDED_CONTRACT_HEADING)
    const after = (strandedIdx !== -1 ? rawAfter.substring(0, strandedIdx) : rawAfter).trimEnd()
    const beforePart = before.length > 0 ? before + '\n\n' : ''
    const afterPart = after.length > 0 ? '\n' + after : ''
    return beforePart + trimmedSection + afterPart
  }

  const base = existingContent.trimEnd()
  const prefix = base.length > 0 ? base + '\n\n' : ''
  return prefix + trimmedSection
}
