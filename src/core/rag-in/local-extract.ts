/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-IN local extraction (F2) — build a command index from what actually
 * exists on the target machine: `apropos` (man universe), shell builtins
 * (`compgen -b`), `<cmd> --help`, and on Windows `Get-Command` / `Get-Help`.
 *
 * Why local: it filters the index to the environment, so the agent never
 * suggests a command that does not exist here, and captures real versions/flags.
 *
 * Design: the parsers are PURE and unit-tested; the only impure part is a
 * `LocalRunner` (injected), so `extractLocalCorpus` is testable with a fake
 * runner and the real shell-out lives behind the same seam.
 */

import { isDangerous, type CommandChunk, type CommandFamily } from './command-chunk.js'

/** Impure seam: run a command, return stdout, or null if it failed/absent. */
export type LocalRunner = (cmd: string, args: string[]) => string | null

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function makeChunk(
  tool: string,
  command: string,
  intent: string,
  family: CommandFamily,
  source: string,
): CommandChunk | null {
  const cmd = command.trim()
  const t = tool.trim()
  if (cmd.length === 0 || t.length === 0) return null
  const cleanIntent = intent.trim() || t
  return {
    id: `${slug(t)}-${slug(cleanIntent)}`,
    intent: cleanIntent,
    command: cmd,
    family,
    tool: t,
    flags_explained: '',
    danger: isDangerous(cmd),
    source,
  }
}

function dedupeIds(chunks: CommandChunk[]): CommandChunk[] {
  const seen = new Map<string, number>()
  return chunks.map((c) => {
    const n = seen.get(c.id) ?? 0
    seen.set(c.id, n + 1)
    return n === 0 ? c : { ...c, id: `${c.id}-${n + 1}` }
  })
}

/** Parse `apropos .` output: `tool (section) - description`. */
export function parseApropos(out: string, family: CommandFamily = 'unix'): CommandChunk[] {
  const chunks: CommandChunk[] = []
  for (const line of out.split(/\r?\n/)) {
    // Non-greedy tool: handles both Linux "tar (1) - …" and macOS "tar(1) - …".
    const m = line.match(/^(\S+?)\s*\(\d+\w*\)\s*-\s*(.+)$/)
    if (!m) continue
    const tool = m[1]!.trim()
    const chunk = makeChunk(tool, tool, m[2]!.trim(), family, 'local-man')
    if (chunk) chunks.push(chunk)
  }
  return dedupeIds(chunks)
}

/** Parse `compgen -b` output (one builtin per line). */
export function parseBuiltins(out: string): CommandChunk[] {
  const chunks: CommandChunk[] = []
  for (const raw of out.split(/\r?\n/)) {
    const name = raw.trim()
    if (name.length === 0) continue
    const chunk = makeChunk(name, name, `${name} (shell builtin)`, 'unix', 'local-builtin')
    if (chunk) chunks.push(chunk)
  }
  return dedupeIds(chunks)
}

/** Parse a `<cmd> --help` blob into a single representative chunk. */
export function parseHelpOutput(help: string, tool: string, family: CommandFamily = 'unix'): CommandChunk | null {
  const lines = help
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return null
  const usage = lines.find((l) => /^usage:/i.test(l))
  // Intent = first descriptive line that isn't the usage/options header.
  const intent = lines.find((l) => !/^usage:/i.test(l) && !/^options?:/i.test(l) && !/^-/.test(l)) ?? tool
  const command = usage ? usage.replace(/^usage:\s*/i, '').trim() : tool
  return makeChunk(tool, command || tool, intent, family, 'local-help')
}

/** Parse `Get-Command` tabular output into powershell chunks. */
export function parseGetCommand(out: string): CommandChunk[] {
  const chunks: CommandChunk[] = []
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^(Cmdlet|Function|Alias|Application)\s+([A-Za-z][\w-]*)\b/)
    if (!m) continue
    const tool = m[2]!
    const chunk = makeChunk(tool, tool, `${tool} (${m[1]!.toLowerCase()})`, 'powershell', 'local-pwsh')
    if (chunk) chunks.push(chunk)
  }
  return dedupeIds(chunks)
}

/**
 * Keep only commands whose tool exists in the environment. Harness chunks
 * (`family: 'harness'`) are always kept — they are the agf surface itself.
 */
export function filterToEnvironment(corpus: readonly CommandChunk[], available: ReadonlySet<string>): CommandChunk[] {
  return corpus.filter((c) => c.family === 'harness' || available.has(c.tool))
}

export interface ExtractOptions {
  /** Include shell builtins (compgen -b) on POSIX. Default true. */
  builtins?: boolean
  /** Include the man universe (apropos) on POSIX. Default true. */
  apropos?: boolean
  /** Target platform — defaults to the host. Pass to make extraction testable. */
  platform?: NodeJS.Platform
}

/** PowerShell command that prints the cmdlet/function inventory as a table. */
const GET_COMMAND_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  'Get-Command -CommandType Cmdlet,Function,Alias,Application | Format-Table -AutoSize',
]

/**
 * Build a local corpus using the injected runner. Environment-honest by
 * construction: every chunk comes from a tool the machine reported. Picks the
 * sources by platform — `Get-Command` on Windows, `apropos`/`compgen` on POSIX.
 */
export function extractLocalCorpus(run: LocalRunner, opts: ExtractOptions = {}): CommandChunk[] {
  const platform = opts.platform ?? process.platform
  const chunks: CommandChunk[] = []

  if (platform === 'win32') {
    // PowerShell Core (pwsh) first, then Windows PowerShell (powershell).
    const out = run('pwsh', GET_COMMAND_ARGS) ?? run('powershell', GET_COMMAND_ARGS)
    if (out) chunks.push(...parseGetCommand(out))
    return dedupeIds(chunks)
  }

  if (opts.apropos !== false) {
    const out = run('apropos', ['.'])
    if (out) chunks.push(...parseApropos(out))
  }

  if (opts.builtins !== false) {
    const out = run('bash', ['-c', 'compgen -b'])
    if (out) chunks.push(...parseBuiltins(out))
  }

  return dedupeIds(chunks)
}

/**
 * Merge a local extraction into the base (seed) corpus. When extraction is
 * empty (e.g. Windows without PowerShell, or a locked-down env), keep the base
 * UNCHANGED — never strip the seed to an empty environment (the footgun).
 * Otherwise filter the seed to the harvested tools and append the local chunks.
 */
export function mergeLocalCorpus(base: readonly CommandChunk[], local: readonly CommandChunk[]): CommandChunk[] {
  if (local.length === 0) return [...base]
  const available = new Set(local.map((c) => c.tool))
  return [...filterToEnvironment(base, available), ...local]
}
