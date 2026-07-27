/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Default RAG-IN corpus available without a downloaded TLDR/PowerShell snapshot.
 *
 * Two always-present sources:
 *  - a small curated set of high-frequency Unix/Windows/PowerShell tasks (so the
 *    retriever is useful out of the box, on any OS), and
 *  - the harness's own command surface, derived from {@link COMMAND_REGISTRY}
 *    (dogfooding 1.4 — the agent auto-operates via retrieval, no shell-out).
 *
 * A richer corpus (full TLDR + PowerShell-Docs + local `--help` extraction) is
 * F2/backlog; this guarantees a non-empty, environment-honest index today.
 */

import { COMMAND_REGISTRY } from '../config/command-registry.js'
import {
  chunkHarnessCommands,
  commandPath,
  isDangerous,
  type CommandChunk,
  type CommandFamily,
} from './command-chunk.js'
import { COMMAND_SURFACE } from './command-surface.generated.js'
import { buildSubcommandCorpus } from './subcommand-cache.js'

interface Seed {
  intent: string
  command: string
  family: CommandFamily
  tool: string
}

const SEEDS: readonly Seed[] = [
  // Unix
  { intent: 'extract a gzipped tar archive', command: 'tar -xzf {file.tar.gz}', family: 'unix', tool: 'tar' },
  { intent: 'create a gzipped tar archive', command: 'tar -czf {target.tar.gz} {files}', family: 'unix', tool: 'tar' },
  {
    intent: 'list the contents of a tar archive without extracting',
    command: 'tar -tf {file.tar}',
    family: 'unix',
    tool: 'tar',
  },
  {
    intent: 'search for a pattern in files recursively',
    command: 'grep -rn {pattern} {dir}',
    family: 'unix',
    tool: 'grep',
  },
  { intent: 'find files by name', command: 'find {dir} -name {pattern}', family: 'unix', tool: 'find' },
  { intent: 'list files in a directory including hidden ones', command: 'ls -la {dir}', family: 'unix', tool: 'ls' },
  { intent: 'recursively delete a directory and its contents', command: 'rm -rf {dir}', family: 'unix', tool: 'rm' },
  { intent: 'change file permissions', command: 'chmod {mode} {file}', family: 'unix', tool: 'chmod' },
  { intent: 'show running processes', command: 'ps aux', family: 'unix', tool: 'ps' },
  { intent: 'monitor a log file as it grows', command: 'tail -f {file}', family: 'unix', tool: 'tail' },
  { intent: 'download a file from a url', command: 'curl -O {url}', family: 'unix', tool: 'curl' },
  { intent: 'show disk usage of a directory', command: 'du -sh {dir}', family: 'unix', tool: 'du' },
  { intent: 'copy files recursively over ssh', command: 'scp -r {src} {user@host:dest}', family: 'unix', tool: 'scp' },
  // Windows / PowerShell
  { intent: 'list files in a directory', command: 'Get-ChildItem {path}', family: 'powershell', tool: 'Get-ChildItem' },
  {
    intent: 'recursively list all files',
    command: 'Get-ChildItem -Recurse -File {path}',
    family: 'powershell',
    tool: 'Get-ChildItem',
  },
  {
    intent: 'search for text inside files',
    command: 'Select-String -Pattern {pattern} -Path {path}',
    family: 'powershell',
    tool: 'Select-String',
  },
  {
    intent: 'recursively delete a directory and its contents',
    command: 'Remove-Item -Recurse -Force {path}',
    family: 'powershell',
    tool: 'Remove-Item',
  },
  {
    intent: 'download a file from a url',
    command: 'Invoke-WebRequest -Uri {url} -OutFile {file}',
    family: 'powershell',
    tool: 'Invoke-WebRequest',
  },
  {
    intent: 'extract a zip archive',
    command: 'Expand-Archive -Path {file.zip} -DestinationPath {dir}',
    family: 'powershell',
    tool: 'Expand-Archive',
  },
]

/** Extra harness chunks not derivable from COMMAND_REGISTRY subcommands. */
const EXTRA_HARNESS_CHUNKS: readonly CommandChunk[] = [
  {
    id: 'agf-compress-run-command',
    intent: 'run a command and compress its output',
    command: 'agf compress run -- {command}',
    family: 'harness',
    tool: 'agf',
    flags_explained: '--stdin reads from stdin; omit to run the command directly',
    danger: false,
    source: 'builtin',
  },
  {
    id: 'agf-compress-run-stdin',
    intent: 'compress stdout from a piped command via stdin',
    command: 'agf compress run --stdin',
    family: 'harness',
    tool: 'agf',
    flags_explained: 'reads compressed stdin; pipe output: cmd | agf compress run --stdin',
    danger: false,
    source: 'builtin',
  },
]

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Curated cross-OS command tasks as chunks. */
export function buildSeedCorpus(): CommandChunk[] {
  return SEEDS.map((s) => ({
    id: `${slug(s.tool)}-${slug(s.intent)}`,
    intent: s.intent,
    command: s.command,
    family: s.family,
    tool: s.tool,
    flags_explained: '',
    danger: isDangerous(s.command),
    source: 'builtin',
  }))
}

/**
 * What the CLI exposes, described as well as we can describe it.
 *
 * `COMMAND_SURFACE` is generated from the live commander tree, so it answers *what exists* —
 * all 392 paths, subcommands included. `COMMAND_REGISTRY` is hand-written and answers *what it
 * is for*, often in the words a user would actually type. Where both speak, the curated intent
 * wins: retrieval ranks prose against prose, and `--help` text is written for a terminal, not
 * for a question.
 */
function describedSurface(): Array<{ name: string; description: string }> {
  const curated = new Map<string, string>()
  for (const entry of COMMAND_REGISTRY) {
    if (entry.description) curated.set(commandPath(entry.name, entry.parent), entry.description)
  }

  // Both, not one. `agf done` says "Complete task: DoD check + store memory + mark done" in
  // commander and "Finaliza: DoD + run tests + memória + done + sugere próxima" in the registry.
  // Picking either leaves half the questions unanswerable — the corpus is read in two languages.
  const described = COMMAND_SURFACE.map((entry) => ({
    name: entry.path,
    description: join(entry.description, curated.get(entry.path)),
  }))

  // The registry also carries invocation *forms* the commander tree cannot know:
  // `compress run -- {command}`, `risk triage --promote`. A path with flags is a distinct
  // way to ask, and dropping it would silently un-index it.
  const walked = new Set(COMMAND_SURFACE.map((entry) => entry.path))
  const forms = [...curated.entries()]
    .filter(([path]) => !walked.has(path))
    .map(([name, description]) => ({ name, description }))

  return [...described, ...forms]
}

/** Two descriptions of the same command, once each, in the order they were written. */
function join(primary: string, secondary?: string): string {
  if (!secondary || secondary.trim() === primary.trim()) return primary
  return primary ? `${primary} — ${secondary}` : secondary
}

/** Harness command surface as chunks (dogfooding 1.4). */
export function buildHarnessCorpus(): CommandChunk[] {
  return [...chunkHarnessCommands(describedSurface()), ...EXTRA_HARNESS_CHUNKS]
}

/** Default in-memory corpus: harness surface + curated cross-OS tasks. */
export function loadDefaultCorpus(): CommandChunk[] {
  return [...buildHarnessCorpus(), ...buildSeedCorpus()]
}

/**
 * Build corpus from COMMAND_REGISTRY (DRY: derived, not hand-duplicated) plus optional extras.
 * Pass CLI_COMMANDS from cli/index.ts as extras to derive from the live command surface
 * without creating a circular dep (core → cli).
 *
 * Usage:
 *   buildLiveCorpus()                — COMMAND_REGISTRY base only
 *   buildLiveCorpus(CLI_COMMANDS)    — live CLI surface (pass from the cli layer)
 *   buildLiveCorpus(fakeCommands)    — simulate new commands in tests
 */
export function buildLiveCorpus(extraCommands: Array<{ name: string; description: string }> = []): CommandChunk[] {
  // The overlay exists for a command that reached the CLI but not the manifest. One that is in
  // both would be indexed twice: two identical chunks, and — worse — a document frequency that
  // counts every top-level command's words twice. `agf brief` lost to `agf generate-prd` by ten
  // thousandths of a point that way.
  const known = new Set(COMMAND_SURFACE.map((entry) => entry.path))
  const overlay = extraCommands.filter((command) => !known.has(command.name))
  const base = chunkHarnessCommands([...describedSurface(), ...overlay])
  // The command set rarely changes between calls — cache the enriched corpus
  // (previously rebuilt from scratch every time) keyed by a hash of `base`.
  return buildSubcommandCorpus(base, (b) => [...b, ...buildSeedCorpus()])
}
