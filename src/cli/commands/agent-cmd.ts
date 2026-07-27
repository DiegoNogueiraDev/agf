/*!
 * agf agent — scaffold and list agent roles (AgentRole TOML).
 *
 * WHY: users need a guided way to create custom agent roles without hand-editing TOML.
 * The create subcommand validates the role against AgentRoleSchema before writing,
 * giving early feedback (with path) if required fields are missing.
 *
 * Composes with: agent-role.schema.ts (validation + BUILT_IN_ROLES),
 *               .agf/agents.toml (project-local role store),
 *               caste-cmd.ts (complementary taxonomy listing).
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'commander'
import {
  AgentRoleSchema,
  AgentRoleConfigSchema,
  BUILT_IN_ROLES,
  parseAgentRoleConfig,
  type AgentRole,
} from '../../schemas/agent-role.schema.js'
import { createCliOutput } from '../shared/cli-output.js'

const AGENTS_TOML_PATH = '.agf/agents.toml'

export interface ScaffoldInput {
  model: string
  tools: string[]
  permissions: string
  reasoning?: boolean
  maxRetries?: number
  timeoutMs?: number
}

export interface ScaffoldResult {
  ok: boolean
  tomlPath?: string
  error?: string
}

export interface RoleEntry {
  name: string
  source: 'built-in' | 'project'
  role: AgentRole
}

/** Scaffold an AgentRole TOML entry to `.agf/agents.toml` in the project dir. */
export function scaffoldAgentRole(projectDir: string, name: string, input: ScaffoldInput): ScaffoldResult {
  const candidate = {
    model: input.model,
    tools: input.tools,
    permissions: input.permissions,
    reasoning: input.reasoning ?? false,
    maxRetries: input.maxRetries ?? 2,
    timeoutMs: input.timeoutMs ?? 120_000,
  }

  const validation = AgentRoleSchema.safeParse(candidate)
  if (!validation.success) {
    const issues = validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    return { ok: false, error: issues }
  }

  const role = validation.data
  const tomlPath = join(projectDir, AGENTS_TOML_PATH)

  // Load existing config if present and merge
  let existingAgents: Record<string, AgentRole> = {}
  if (existsSync(tomlPath)) {
    const existing = parseAgentRoleConfig(readFileSync(tomlPath, 'utf8'))
    if (existing.success && existing.data) {
      existingAgents = { ...existing.data.agent }
    }
  }

  existingAgents[name] = role

  // Validate the merged config before writing
  const merged = AgentRoleConfigSchema.safeParse({ agent: existingAgents })
  if (!merged.success) {
    const issues = merged.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    return { ok: false, error: issues }
  }

  mkdirSync(join(projectDir, '.agf'), { recursive: true })
  writeFileSync(tomlPath, buildToml({ agent: existingAgents }), 'utf8')
  return { ok: true, tomlPath }
}

/** List all agent roles — built-in + project-local from `.agf/agents.toml`. */
export function listAgentRoles(projectDir: string): RoleEntry[] {
  const entries: RoleEntry[] = Object.entries(BUILT_IN_ROLES).map(([name, role]) => ({
    name,
    source: 'built-in' as const,
    role,
  }))

  const tomlPath = join(projectDir, AGENTS_TOML_PATH)
  if (existsSync(tomlPath)) {
    const parsed = parseAgentRoleConfig(readFileSync(tomlPath, 'utf8'))
    if (parsed.success && parsed.data) {
      for (const [name, role] of Object.entries(parsed.data.agent)) {
        entries.push({ name, source: 'project', role })
      }
    }
  }

  return entries
}

function buildToml(config: { agent: Record<string, AgentRole> }): string {
  const lines: string[] = []
  for (const [name, role] of Object.entries(config.agent)) {
    lines.push(`[agent.${name}]`)
    lines.push(`model = ${JSON.stringify(role.model)}`)
    lines.push(`tools = [${role.tools.map((t) => JSON.stringify(t)).join(', ')}]`)
    lines.push(`permissions = ${JSON.stringify(role.permissions)}`)
    lines.push(`reasoning = ${role.reasoning}`)
    lines.push(`maxRetries = ${role.maxRetries}`)
    lines.push(`timeoutMs = ${role.timeoutMs}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Builds the `agf agent` CLI command (Commander definition). */
export function agentCommand(): Command {
  const cmd = new Command('agent').description('Agent role management: scaffold and list roles')

  cmd
    .command('create <name>')
    .description('Scaffold a new AgentRole entry in .agf/agents.toml')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--model <model>', 'LLM model ID', 'haiku')
    .option('--tools <tools>', 'Comma-separated tool names', 'read,glob,grep')
    .option('--permissions <perm>', 'Permission level (read-only|workspace-write|danger-full-access)', 'read-only')
    .option('--reasoning', 'Enable reasoning mode', false)
    .option('--max-retries <n>', 'Max retry attempts', '2')
    .option('--timeout-ms <ms>', 'Max execution time in ms', '120000')
    .action(
      (
        name: string,
        opts: {
          dir: string
          model: string
          tools: string
          permissions: string
          reasoning: boolean
          maxRetries: string
          timeoutMs: string
        },
      ) => {
        const out = createCliOutput('agent.create')
        const result = scaffoldAgentRole(opts.dir, name, {
          model: opts.model,
          tools: opts.tools
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          permissions: opts.permissions,
          reasoning: opts.reasoning,
          maxRetries: parseInt(opts.maxRetries, 10),
          timeoutMs: parseInt(opts.timeoutMs, 10),
        })
        if (!result.ok) {
          out.err('VALIDATION_ERROR', result.error ?? 'Validation failed')
          return
        }
        out.ok({ created: name, tomlPath: result.tomlPath })
      },
    )

  cmd
    .command('list')
    .description('List all agent roles (built-in + project-local)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('agent.list')
      const roles = listAgentRoles(opts.dir)
      out.ok({
        roles: roles.map((r) => ({
          name: r.name,
          source: r.source,
          model: r.role.model,
          permissions: r.role.permissions,
        })),
      })
    })

  return cmd
}
