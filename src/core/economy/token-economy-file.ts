/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * token-economy.json — materialized KV ledger at ~/.config/agf/.
 * Global file that aggregates ALL projects a developer works on.
 * Incrementally updated on every `agf` command invocation and on `agf done`.
 * Human-readable, git-committable artifact for cost auditing and reduction proof.
 *
 * Schema:
 *   projects.<abs-path>      → per-project block
 *     .commands.<name>       → { calls, in, out, tok, ms }
 *     .llm                  → { calls, in, out, cache, cost }
 *     .totals               → { cmd_calls, cmd_tok, llm_tok, combined_tok, cost }
 *   global_totals            → aggregated across all projects
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'token-economy-file.ts' })

const AGF_DIR = join(homedir(), '.config', 'agf')
export const ECONOMY_FILE = join(AGF_DIR, 'token-economy.json')

export interface CommandEntry {
  calls: number
  in: number
  out: number
  tok: number
  ms: number
}

export interface LlmEntry {
  calls: number
  in: number
  out: number
  cache: number
  cost: number
}

export interface ProjectTotals {
  cmd_calls: number
  cmd_tok: number
  llm_tok: number
  combined_tok: number
  cost: number
  /** Cumulative tokens saved by economy levers (RAG, compression, cache, reuse). */
  saved_tok: number
}

export interface ProjectBlock {
  started: string
  updated: string
  commands: Record<string, CommandEntry>
  llm: LlmEntry
  totals: ProjectTotals
}

export interface GlobalTotals {
  projects: number
  cmd_calls: number
  cmd_tok: number
  llm_tok: number
  combined_tok: number
  cost: number
  /** Cumulative tokens saved by economy levers across all projects. */
  saved_tok: number
}

export interface EconomyFile {
  started: string
  updated: string
  projects: Record<string, ProjectBlock>
  global_totals: GlobalTotals
}

function emptyProjectBlock(): ProjectBlock {
  const now = new Date().toISOString()
  return {
    started: now,
    updated: now,
    commands: {},
    llm: { calls: 0, in: 0, out: 0, cache: 0, cost: 0 },
    totals: { cmd_calls: 0, cmd_tok: 0, llm_tok: 0, combined_tok: 0, cost: 0, saved_tok: 0 },
  }
}

function emptyEconomyFile(): EconomyFile {
  return {
    started: new Date().toISOString(),
    updated: new Date().toISOString(),
    projects: {},
    global_totals: { projects: 0, cmd_calls: 0, cmd_tok: 0, llm_tok: 0, combined_tok: 0, cost: 0, saved_tok: 0 },
  }
}

function ensureDir(): void {
  if (!existsSync(AGF_DIR)) {
    mkdirSync(AGF_DIR, { recursive: true })
  }
}

function recalcGlobalTotals(data: EconomyFile): void {
  const gt: GlobalTotals = { projects: 0, cmd_calls: 0, cmd_tok: 0, llm_tok: 0, combined_tok: 0, cost: 0, saved_tok: 0 }
  for (const [, proj] of Object.entries(data.projects)) {
    gt.projects += 1
    gt.cmd_calls += proj.totals.cmd_calls
    gt.cmd_tok += proj.totals.cmd_tok
    gt.llm_tok += proj.totals.llm_tok
    gt.combined_tok += proj.totals.combined_tok
    gt.cost += proj.totals.cost
    gt.saved_tok += proj.totals.saved_tok ?? 0 // legacy blocks lack saved_tok
  }
  data.global_totals = gt
}

export function readEconomyFile(): EconomyFile {
  ensureDir()
  if (!existsSync(ECONOMY_FILE)) {
    return emptyEconomyFile()
  }
  try {
    const raw = readFileSync(ECONOMY_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as EconomyFile
    if (!parsed.projects || !parsed.global_totals) {
      return emptyEconomyFile()
    }
    recalcGlobalTotals(parsed)
    return parsed
  } catch {
    log.warn('token-economy-file:corrupt', { path: ECONOMY_FILE })
    return emptyEconomyFile()
  }
}

export function writeEconomyFile(data: EconomyFile): void {
  ensureDir()
  data.updated = new Date().toISOString()
  recalcGlobalTotals(data)
  try {
    writeFileSync(ECONOMY_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  } catch (err) {
    log.warn('token-economy-file:write-failed', { path: ECONOMY_FILE, error: String(err) })
  }
}

function getOrCreateProject(data: EconomyFile, projectDir: string): ProjectBlock {
  if (!data.projects[projectDir]) {
    data.projects[projectDir] = emptyProjectBlock()
  }
  return data.projects[projectDir]
}

export function incrementCommand(
  projectDir: string,
  command: string,
  inputBytes: number,
  outputBytes: number,
  durationMs: number,
): EconomyFile {
  const data = readEconomyFile()
  const proj = getOrCreateProject(data, projectDir)
  const estimatedTokens = Math.ceil((inputBytes + outputBytes) / 4)

  const entry = proj.commands[command]
  if (entry) {
    entry.calls += 1
    entry.in += inputBytes
    entry.out += outputBytes
    entry.tok += estimatedTokens
    entry.ms = Math.round((entry.ms * (entry.calls - 1) + durationMs) / entry.calls)
  } else {
    proj.commands[command] = {
      calls: 1,
      in: inputBytes,
      out: outputBytes,
      tok: estimatedTokens,
      ms: durationMs,
    }
  }

  proj.totals.cmd_calls += 1
  proj.totals.cmd_tok += estimatedTokens
  proj.totals.combined_tok = proj.totals.cmd_tok + proj.totals.llm_tok
  proj.updated = new Date().toISOString()

  writeEconomyFile(data)
  return data
}

export function incrementLlm(
  projectDir: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  costUsd: number,
): EconomyFile {
  const data = readEconomyFile()
  const proj = getOrCreateProject(data, projectDir)

  proj.llm.calls += 1
  proj.llm.in += inputTokens
  proj.llm.out += outputTokens
  proj.llm.cache += cachedTokens
  proj.llm.cost += costUsd

  proj.totals.llm_tok += inputTokens + outputTokens
  proj.totals.combined_tok = proj.totals.cmd_tok + proj.totals.llm_tok
  proj.totals.cost += costUsd
  proj.updated = new Date().toISOString()

  writeEconomyFile(data)
  return data
}

/**
 * SET (not increment) the cumulative tokens saved by economy levers for a
 * project. Idempotent: the caller passes the current cumulative total (e.g. the
 * SUM of economy_lever_ledger), so repeated calls converge instead of drifting.
 */
export function setProjectSaved(projectDir: string, savedTok: number): EconomyFile {
  const data = readEconomyFile()
  const proj = getOrCreateProject(data, projectDir)
  proj.totals.saved_tok = savedTok
  proj.updated = new Date().toISOString()
  writeEconomyFile(data)
  return data
}

/** Read only this project's block from the global file. */
export function readProjectBlock(projectDir: string): ProjectBlock | undefined {
  const data = readEconomyFile()
  return data.projects[projectDir]
}
