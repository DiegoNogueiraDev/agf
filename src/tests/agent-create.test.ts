/*!
 * TDD: agf agent create scaffolds a valid AgentRole TOML (node_694ada3dd8ae).
 *
 * AC1: agf agent create <name> --model sonnet --tools Read,Grep --permissions read-only
 *      writes a valid TOML (parseAgentRoleConfig accepts) and appears in listing.
 * AC2: Missing required fields → validation error with path, no file written.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldAgentRole, listAgentRoles } from '../cli/commands/agent-cmd.js'
import { parseAgentRoleConfig } from '../schemas/agent-role.schema.js'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agf-agent-test-'))
}

describe('AC1: scaffoldAgentRole writes valid TOML + appears in listing', () => {
  let dir: string
  beforeEach(() => {
    dir = makeTmpDir()
    mkdirSync(join(dir, '.agf'), { recursive: true })
  })

  it('writes a TOML file that parseAgentRoleConfig accepts', () => {
    const result = scaffoldAgentRole(dir, 'code-reviewer', {
      model: 'sonnet',
      tools: ['Read', 'Grep'],
      permissions: 'read-only',
    })
    expect(result.ok).toBe(true)
    const tomlPath = join(dir, '.agf', 'agents.toml')
    expect(existsSync(tomlPath)).toBe(true)
    const toml = readFileSync(tomlPath, 'utf8')
    const parsed = parseAgentRoleConfig(toml)
    expect(parsed.success).toBe(true)
    expect(parsed.data?.agent['code-reviewer']).toBeDefined()
  })

  it('appears in listAgentRoles after creation', () => {
    scaffoldAgentRole(dir, 'qa-agent', {
      model: 'haiku',
      tools: ['Read'],
      permissions: 'read-only',
    })
    const roles = listAgentRoles(dir)
    const names = roles.map((r) => r.name)
    expect(names).toContain('qa-agent')
  })

  it('includes built-in roles in listing', () => {
    const roles = listAgentRoles(dir)
    const names = roles.map((r) => r.name)
    expect(names).toContain('builder')
    expect(names).toContain('reviewer')
  })
})

describe('AC2: missing required fields → validation error, no file written', () => {
  it('returns error with field path when tools is missing', () => {
    const dir = makeTmpDir()
    const result = scaffoldAgentRole(dir, 'bad-agent', {
      model: 'sonnet',
      tools: [],
      permissions: 'read-only',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    const tomlPath = join(dir, '.agf', 'agents.toml')
    expect(existsSync(tomlPath)).toBe(false)
  })
})
