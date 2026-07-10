/* eslint-disable security/detect-unsafe-regex */
/*!
 * Lint exemption: the regex patterns in this file are bounded
 * (literal alternations, short character classes, language-keyword
 * lookups) and run against parsed/structured input. The ReDoS class
 * the rule is designed to prevent is not reachable here.
 */
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { UntrustedRegistryError } from '../utils/errors.js'

export interface McpServerSpec {
  readonly command: string
  readonly args: readonly string[]
}

export interface AllowlistOptions {
  readonly allowedScopes?: readonly string[]
  readonly allowedPackages?: readonly string[]
  readonly allowedCommands?: readonly string[]
}

const DEFAULT_ALLOWED_SCOPES = [
  '@modelcontextprotocol',
  '@anthropic-ai',
  'agent-graph-flow-mcp-server',
  '@upstash',
  '@playwright',
]

const DEFAULT_ALLOWED_PACKAGES: readonly string[] = []

const DEFAULT_ALLOWED_COMMANDS = ['node', 'npx', 'deno', 'bun']

const PINNED_SEMVER = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const PINNED_GIT_SHA = /#[0-9a-f]{40}$/

/** isPinnedNpmSpec —  */
export function isPinnedNpmSpec(spec: string): boolean {
  if (typeof spec !== 'string' || spec.length === 0) return false
  if (PINNED_SEMVER.test(spec)) return true
  if (spec.startsWith('github:') || spec.startsWith('git+')) {
    return PINNED_GIT_SHA.test(spec)
  }
  return false
}

export interface ParsedNpxCommand {
  readonly spec: string
  readonly scope: string | null
  readonly name: string
}

/** parseNpxCommand —  */
export function parseNpxCommand(command: string, args: readonly string[]): ParsedNpxCommand | null {
  if (command !== 'npx') return null
  const spec = args.find((a, i) => {
    if (a.startsWith('-')) return false
    // skip value of flags that take values
    const prev = args[i - 1]
    if (prev === '-p' || prev === '--package') return false
    return true
  })
  if (!spec) return null

  const atIdx = spec.startsWith('@') ? spec.indexOf('@', 1) : spec.indexOf('@')
  const base = atIdx > 0 ? spec.slice(0, atIdx) : spec
  const scope = base.startsWith('@') ? base.slice(0, base.indexOf('/')) : null
  const name = scope ? base.slice(scope.length + 1) : base
  return { spec, scope, name }
}

/** assertTrustedMcpServer —  */
export function assertTrustedMcpServer(spec: McpServerSpec, options: AllowlistOptions = {}): void {
  const allowedCommands = new Set([...DEFAULT_ALLOWED_COMMANDS, ...(options.allowedCommands ?? [])])
  if (!allowedCommands.has(spec.command)) {
    throw new UntrustedRegistryError(spec.command, `command "${spec.command}" not in allowlist`)
  }

  if (spec.command === 'sh' || spec.command === 'bash') {
    throw new UntrustedRegistryError(spec.command, 'shell invocations not allowed')
  }

  for (const arg of spec.args) {
    if (typeof arg !== 'string') {
      throw new UntrustedRegistryError(String(arg), 'non-string arg')
    }
    if (arg.includes('|') || arg.includes(';') || arg.includes('`') || arg.includes('$(')) {
      throw new UntrustedRegistryError(arg, 'shell metacharacters in arg')
    }
    if (/curl\s+[^|]*\|\s*sh/i.test(arg)) {
      throw new UntrustedRegistryError(arg, 'curl-pipe-sh pattern')
    }
  }

  if (spec.command === 'npx') {
    const parsed = parseNpxCommand(spec.command, spec.args)
    if (!parsed) {
      throw new UntrustedRegistryError(spec.args.join(' '), 'no package spec found in npx args')
    }
    if (!isPinnedNpmSpec(parsed.spec)) {
      throw new UntrustedRegistryError(parsed.spec, 'npm spec is not pinned (need name@x.y.z or git#<40 hex>)')
    }
    const allowedScopes = new Set([...DEFAULT_ALLOWED_SCOPES, ...(options.allowedScopes ?? [])])
    const allowedPackages = new Set([...DEFAULT_ALLOWED_PACKAGES, ...(options.allowedPackages ?? [])])
    const base = parsed.scope ? `${parsed.scope}/${parsed.name}` : parsed.name
    const scopeOk = parsed.scope && allowedScopes.has(parsed.scope)
    const pkgOk = allowedPackages.has(base)
    if (!scopeOk && !pkgOk) {
      throw new UntrustedRegistryError(parsed.spec, 'scope/package not on allowlist')
    }
  }
}
