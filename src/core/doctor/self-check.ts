/*!
 * self-check — install-health golden path for `agf doctor --self-check`.
 *
 * WHY: `agf doctor` runs broad env checks but has no structured PASS/FAIL
 * install-health verdict with per-failure fix commands. `--self-check` gives
 * a fast, actionable summary (db / providers / git / node) with exact remediation.
 *
 * Composing: doctor-cmd.ts wires this into Commander; doctor-runner.ts owns
 * the broader env check surface; self-check.ts is a focused golden-path slice.
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelfCheckLevel = 'ok' | 'warning' | 'error'

export interface SelfCheckItem {
  name: string
  level: SelfCheckLevel
  message: string
  code?: string
  fix?: string
}

export interface SelfCheckResult {
  checks: SelfCheckItem[]
  verdict: 'PASS' | 'FAIL'
  summary: string
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkStore(dir: string): SelfCheckItem {
  const dbPath = join(dir, 'workflow-graph', 'graph.db')
  if (!existsSync(dbPath)) {
    return {
      name: 'db',
      level: 'error',
      message: `graph.db not found at ${dbPath}`,
      code: 'STORE_NOT_FOUND',
      fix: `agf init --dir ${dir}`,
    }
  }
  try {
    const stat = statSync(dbPath)
    return { name: 'db', level: 'ok', message: `graph.db reachable (${stat.size} bytes)` }
  } catch {
    return {
      name: 'db',
      level: 'error',
      message: 'graph.db unreadable',
      code: 'STORE_NOT_FOUND',
      fix: `agf init --dir ${dir}`,
    }
  }
}

function checkNodeVersion(): SelfCheckItem {
  const version = process.version
  const major = parseInt(version.slice(1).split('.')[0], 10)
  if (major < 18) {
    return {
      name: 'node-version',
      level: 'error',
      message: `Node ${version} — requires ≥18`,
      code: 'NODE_TOO_OLD',
      fix: 'Install Node.js ≥18 from https://nodejs.org',
    }
  }
  return { name: 'node-version', level: 'ok', message: `Node ${version}` }
}

function checkGit(): SelfCheckItem {
  try {
    const version = execSync('git --version', { encoding: 'utf-8', timeout: 5000 }).trim()
    return { name: 'git', level: 'ok', message: version }
  } catch {
    return {
      name: 'git',
      level: 'error',
      message: 'git not found in PATH',
      code: 'GIT_MISSING',
      fix: 'Install git: https://git-scm.com/downloads',
    }
  }
}

function checkProviders(): SelfCheckItem {
  const knownEnvVars = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'GEMINI_API_KEY',
    'DEEPSEEK_API_KEY',
    'GROQ_API_KEY',
    'GLM_API_KEY',
    'KIMI_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'BEDROCK_API_KEY',
  ]
  const detected = knownEnvVars.filter((k) => process.env[k] && process.env[k]!.length > 0)
  if (detected.length === 0) {
    // Check for local Ollama as a fallback
    const ollamaRes = spawnSync('ollama', ['list'], { timeout: 3000, encoding: 'utf-8' })
    if (ollamaRes.status === 0) {
      return { name: 'providers', level: 'ok', message: 'Local Ollama detected' }
    }
    return {
      name: 'providers',
      level: 'warning',
      message: 'No provider API keys detected (copilot login may still work)',
      code: 'NO_PROVIDERS',
      fix: 'Set at least one: ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY — or run: agf login',
    }
  }
  const names = detected.map((k) => k.replace('_API_KEY', '').toLowerCase())
  return { name: 'providers', level: 'ok', message: `${detected.length} provider(s) configured: ${names.join(', ')}` }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Run all install-health self-checks and return a structured PASS/FAIL result. */
export async function runSelfCheck(dir: string): Promise<SelfCheckResult> {
  const checks: SelfCheckItem[] = [checkNodeVersion(), checkGit(), checkStore(dir), checkProviders()]

  const failed = checks.filter((c) => c.level === 'error')
  const warned = checks.filter((c) => c.level === 'warning')
  const verdict: 'PASS' | 'FAIL' = failed.length > 0 ? 'FAIL' : 'PASS'
  const summary =
    verdict === 'PASS'
      ? `✓ PASS — ${checks.length} checks ok${warned.length > 0 ? ` (${warned.length} warning)` : ''}`
      : `✗ FAIL — ${failed.length} error(s) found`

  return { checks, verdict, summary }
}
