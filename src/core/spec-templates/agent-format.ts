/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * agent_format — generates AI agent instructions in multiple formats.
 * Supported formats: markdown, toml, skill.md, json
 * Supported agents: explore, plan, implement, review, test, deploy
 *
 * Plus per-CLI CLI-first context generation ({@link generateCliContext}) that
 * emits real `agf` instruction bodies in each target CLI's native format —
 * zero MCP. This is the source used to distribute context across CLIs.
 */

import {
  generateClaudeMdSection,
  generateCopilotInstructions,
  generateCodexAgentsMdSection,
  MARKER_END,
  type ProjectContext,
} from '../config/ai-memory-generator.js'
import { generateContractSection } from '../output/consumer-contract.js'
import { McpGraphError } from '../utils/errors.js'

export const FORMATS = ['markdown', 'toml', 'skill.md', 'json'] as const
export type AgentFormat = (typeof FORMATS)[number]

export const AGENTS = ['explore', 'plan', 'implement', 'review', 'test', 'deploy'] as const
export type AgentType = (typeof AGENTS)[number]

/** Target CLIs for per-CLI context distribution (CLI-first, zero MCP). */
export const CLI_TARGETS = [
  'claude',
  'copilot',
  'codex',
  'opencode',
  'cursor',
  'windsurf',
  'gemini',
  'generic',
] as const
export type CliTarget = (typeof CLI_TARGETS)[number]

/** Where each CLI expects its context file, relative to the project root. */
export const CLI_TARGET_PATHS: Record<CliTarget, string> = {
  claude: 'CLAUDE.md',
  copilot: '.github/copilot-instructions.md',
  codex: 'AGENTS.md',
  opencode: 'AGENTS.md',
  cursor: '.cursor/rules/agent-graph-flow.md',
  windsurf: '.windsurf/rules/agent-graph-flow.md',
  gemini: 'GEMINI.md',
  generic: 'AGENTS.md',
}

/** List supported CLI agent targets (claude, copilot, codex, ...). */
export function listCliTargets(): readonly string[] {
  return CLI_TARGETS
}

/**
 * Generate the CLI-first instruction body for a target CLI in its native
 * format. All bodies teach the `agf` CLI — no MCP tool names.
 */
export function generateCliContext(
  cli: CliTarget,
  projectName: string,
  mode: 'ultra-lean' | 'lean' | 'full' = 'lean',
  projectContext?: ProjectContext,
): string {
  if (!CLI_TARGETS.includes(cli)) {
    throw new McpGraphError(`Unknown CLI target: ${cli}`)
  }
  const contract = mode === 'full' ? '\n\n' + generateContractSection() : ''

  // Insert the contract section INSIDE the markers (before MARKER_END) so that
  // applySection() treats it as managed content and replaces it idempotently.
  // Appending it after MARKER_END caused it to accumulate on each agf init run.
  const withContract = (section: string): string =>
    contract ? section.replace(MARKER_END, contract.trim() + '\n' + MARKER_END) : section

  switch (cli) {
    case 'claude':
      return withContract(generateClaudeMdSection(projectName, mode, projectContext))
    case 'copilot':
      return withContract(generateCopilotInstructions(projectName, mode, projectContext))
    case 'codex':
    case 'opencode':
    case 'generic':
      return withContract(generateCodexAgentsMdSection(projectName, mode, projectContext))
    case 'cursor':
    case 'windsurf':
    case 'gemini':
      return withContract(generateCopilotInstructions(projectName, mode, projectContext))
    default:
      throw new McpGraphError(`Unknown CLI target: ${cli as string}`)
  }
}

export interface AgentInstructionParams {
  projectName: string
  lifecycle: string
  tools?: string[]
}

/** List supported agent instruction output formats. */
export function listFormats(): readonly string[] {
  return FORMATS
}

/** List known agent types. */
export function listAgents(): readonly string[] {
  return AGENTS
}

/** Generate agent instructions for a given agent, format, and params. */
export function generate(agent: AgentType, format: AgentFormat, params: AgentInstructionParams): string {
  if (!FORMATS.includes(format)) {
    throw new McpGraphError(`Unsupported format: ${format}`)
  }
  if (!AGENTS.includes(agent)) {
    throw new McpGraphError(`Unknown agent: ${agent}`)
  }

  const tools = params.tools ?? []

  switch (format) {
    case 'markdown':
      return [
        `# ${agent}`,
        ``,
        `Project: ${params.projectName}`,
        `Phase: ${params.lifecycle}`,
        ``,
        `## Tools`,
        ...tools.map((t) => `- ${t}`),
        ``,
      ].join('\n')

    case 'json':
      return (
        JSON.stringify(
          {
            agent,
            project: params.projectName,
            phase: params.lifecycle,
            tools,
          },
          null,
          2,
        ) + '\n'
      )

    case 'toml':
      return [
        '[agent]',
        `name = "${agent}"`,
        `project = "${params.projectName}"`,
        `phase = "${params.lifecycle}"`,
        '',
        '[tools]',
        ...tools.map((t) => `items = "${t}"`),
        '',
      ].join('\n')

    case 'skill.md': {
      const today = new Date().toISOString().split('T')[0]
      return [
        '---',
        `name: ${agent}`,
        `description: Auto-generated instructions for ${agent} agent`,
        `triggers:`,
        `  - ${agent}`,
        `version: 1.0.0`,
        `author: auto-generated`,
        `date: ${today}`,
        `category: ${params.lifecycle}`,
        `phase: ${params.lifecycle}`,
        `tools_used: [${tools.join(', ')}]`,
        '---',
        '',
        `# ${agent}`,
        '',
        `Use this skill for ${params.projectName} tasks in the ${params.lifecycle} phase.`,
        '',
        '## When to Use',
        '',
        `- When the current phase is ${params.lifecycle}`,
        `- When working on ${params.projectName}`,
        '',
        '## Steps',
        '',
        '### Tools',
        ...tools.map((t) => `- ${t}`),
        '',
        '## Exit',
        '',
        '- [ ] Task completed using the `agf` CLI',
        '',
        '## Anti-Patterns',
        '',
        '- Do NOT use MCP tools — use the `agf` CLI instead',
        '- Do NOT work without context from the graph',
        '',
        '## Codex Notes',
        '',
        '- In Codex Plan Mode, use this skill for planning only and do not mutate files.',
        '- During implementation, follow the project `AGENTS.md` rules.',
        '',
      ].join('\n')
    }

    default:
      throw new McpGraphError(`Unsupported format: ${format}`)
  }
}
