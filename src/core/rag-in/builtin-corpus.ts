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
import { chunkHarnessCommands, isDangerous, type CommandChunk, type CommandFamily } from './command-chunk.js'
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

/** Harness command surface as chunks (dogfooding 1.4). */
export function buildHarnessCorpus(): CommandChunk[] {
  return [
    ...chunkHarnessCommands(
      COMMAND_REGISTRY.map((c) => ({ name: c.name, parent: c.parent, description: c.description })),
    ),
    ...EXTRA_HARNESS_CHUNKS,
  ]
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
  const base = chunkHarnessCommands([
    ...COMMAND_REGISTRY.map((c) => ({ name: c.name, parent: c.parent, description: c.description })),
    ...extraCommands,
  ])
  // The command set rarely changes between calls — cache the enriched corpus
  // (previously rebuilt from scratch every time) keyed by a hash of `base`.
  return buildSubcommandCorpus(base, (b) => [...b, ...buildSeedCorpus()])
}
