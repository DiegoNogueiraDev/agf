/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LiveRunResult — CONTRACT for /run <prompt> outcomes.
 * mode:'live'      → a real LLM provider responded.
 * mode:'delegated' → no provider; the driving agent should handle execution.
 * Never throws: surfaces errors as delegated fallback.
 */

export interface LiveRunResult {
  mode: 'live' | 'delegated'
  summary: string
}

export interface LiveRunOptions {
  prompt: string
  available: boolean
  implement(prompt: string): Promise<string>
}

/** Executes a /run prompt, returning LiveRunResult instead of throwing. */
export async function buildLiveRunResult(opts: LiveRunOptions): Promise<LiveRunResult> {
  if (!opts.available) {
    return {
      mode: 'delegated',
      summary: `mode:delegated — sem provider configurado. Execute manualmente:\n  agf brief <id> → implemente → agf submit <id> --result '{...}'`,
    }
  }

  try {
    const response = await opts.implement(opts.prompt)
    return { mode: 'live', summary: response }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      mode: 'delegated',
      summary: `mode:delegated — erro ao chamar provider: ${msg}`,
    }
  }
}
