/*!
 * live-run-result-cascade — provider fallback cascade for deliver/run commands.
 *
 * WHY: buildLiveRunResult (live-run-result.ts) uses a single boolean `available`
 * flag. The deliver command should try cheaper/local providers before giving up
 * and returning mode:delegated. This module adds a cascade: primary → cheaper →
 * local → delegated, without changing the existing contract.
 *
 * Pure orchestration — providers are injected via CascadeProvider[]. The caller
 * builds the list (e.g. [primary, openrouter-cheap, ollama]) and this module
 * tries each in order until one succeeds or the list is exhausted.
 */

export interface CascadeProvider {
  /** Human-readable label for diagnostics (e.g. 'anthropic', 'openrouter', 'ollama'). */
  name: string
  /** Call the provider with the prompt; throw on failure. */
  implement(prompt: string): Promise<string>
}

export interface CascadeRunResult {
  mode: 'live' | 'delegated'
  summary: string
  /** Name of the provider that succeeded, or undefined in delegated mode. */
  providerUsed?: string
}

/**
 * Try each provider in cascade order, returning the first successful response.
 * Falls back to mode:delegated when all providers fail or the list is empty.
 *
 * @param providers - Ordered list of providers to try (primary first).
 * @param prompt    - The prompt to send to the provider.
 */
export async function buildLiveRunResultWithCascade(
  providers: CascadeProvider[],
  prompt: string,
): Promise<CascadeRunResult> {
  for (const provider of providers) {
    try {
      const response = await provider.implement(prompt)
      return { mode: 'live', summary: response, providerUsed: provider.name }
    } catch {
      // Try next provider in cascade
    }
  }

  return {
    mode: 'delegated',
    summary: `mode:delegated — all providers exhausted or none configured. Run: agf brief <id> → implement → agf submit <id> --result '{...}'`,
  }
}
