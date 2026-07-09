#!/usr/bin/env node
/**
 * compress-bash-output.mjs — PostToolUse hook for Claude Code
 *
 * Intercepts Bash tool output and compresses it via `agf compress run --stdin`
 * before the model reads it. Fail-open: on any error or if agf is not on PATH,
 * returns the original output unchanged.
 *
 * Install in .claude/settings.json:
 *   "hooks": {
 *     "PostToolUse": [{
 *       "matcher": "Bash",
 *       "command": "node scripts/hooks/compress-bash-output.mjs"
 *     }]
 *   }
 *
 * Protocol: JSON on stdin → JSON on stdout { updatedToolOutput: string }
 */

import { spawnSync } from 'node:child_process'

// Skip compression for outputs smaller than this (bytes) — latency guard.
const MIN_SIZE = 1024

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) {
    raw += chunk
  }

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    // Fail-open: not parseable → return nothing (Claude Code uses original output)
    process.exit(0)
  }

  const toolOutput = payload?.tool_response?.output ?? ''

  if (typeof toolOutput !== 'string' || toolOutput.length < MIN_SIZE) {
    // Below threshold: return unchanged
    process.stdout.write(JSON.stringify({ updatedToolOutput: toolOutput }))
    process.exit(0)
  }

  // Attempt compression via installed agf binary (not npm run dev — must be stable)
  const agfResult = spawnSync('agf', ['compress', 'run', '--stdin'], {
    input: toolOutput,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    // Timeout: 5s — fail-open if agf hangs
    timeout: 5000,
  })

  if (agfResult.error || agfResult.status !== 0 || !agfResult.stdout) {
    // agf not on PATH or failed — fail-open with original output
    process.stdout.write(JSON.stringify({ updatedToolOutput: toolOutput }))
    process.exit(0)
  }

  // Parse agf JSON envelope and extract compressed output
  let compressed = toolOutput
  try {
    const envelope = JSON.parse(agfResult.stdout)
    if (envelope?.ok && typeof envelope?.data?.compressed === 'string') {
      compressed = envelope.data.compressed
    }
  } catch {
    // Fail-open: unexpected agf output format
  }

  process.stdout.write(JSON.stringify({ updatedToolOutput: compressed }))
  process.exit(0)
}

main().catch(() => process.exit(0))
