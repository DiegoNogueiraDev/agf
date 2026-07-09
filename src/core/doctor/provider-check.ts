/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-E1 — provider-router-expansion / Task E1-R4
 *
 * Deterministic provider configuration check for `mcp-graph doctor
 * --providers`. Reports, per cloud key-based LLM provider, whether its
 * credential env var is present. No network call — doctor stays a fast
 * local diagnostic (DETERMINISTIC FIRST §ADR-0059).
 *
 * All 10 providers are auto-wired via `createGatewayFromEnv` in
 * `gateway-factory.ts`. Flag reflects actual wiring state.
 */

import type { ProviderName } from '../llm/types.js'

export interface ProviderCheckEntry {
  provider: ProviderName
  /** Credential env var the provider reads. */
  envVar: string
  /** True when `envVar` is non-empty in the inspected environment. */
  configured: boolean
  /** True when createGatewayFromEnv instantiates this provider from env. */
  gatewayWired: boolean
}

export interface ProviderCheckReport {
  providers: ProviderCheckEntry[]
  configuredCount: number
}

/** Provider → credential env var + whether the gateway auto-wires it. */
const PROVIDER_ENV: ReadonlyArray<{
  provider: ProviderName
  envVar: string
  gatewayWired: boolean
}> = [
  { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY', gatewayWired: true },
  { provider: 'openai', envVar: 'OPENAI_API_KEY', gatewayWired: true },
  { provider: 'openrouter', envVar: 'OPENROUTER_API_KEY', gatewayWired: true },
  { provider: 'gemini', envVar: 'GEMINI_API_KEY', gatewayWired: true },
  { provider: 'bedrock', envVar: 'BEDROCK_API_KEY', gatewayWired: true },
  { provider: 'azure', envVar: 'AZURE_OPENAI_API_KEY', gatewayWired: true },
  { provider: 'deepseek', envVar: 'DEEPSEEK_API_KEY', gatewayWired: true },
  { provider: 'glm', envVar: 'GLM_API_KEY', gatewayWired: true },
  { provider: 'kimi', envVar: 'KIMI_API_KEY', gatewayWired: true },
  { provider: 'groq', envVar: 'GROQ_API_KEY', gatewayWired: true },
]

/** Inspects `env` and reports which cloud LLM providers have credentials. */
export function checkProviders(env: NodeJS.ProcessEnv = process.env): ProviderCheckReport {
  const providers: ProviderCheckEntry[] = PROVIDER_ENV.map((spec) => ({
    provider: spec.provider,
    envVar: spec.envVar,
    configured: Boolean(env[spec.envVar]),
    gatewayWired: spec.gatewayWired,
  }))
  return {
    providers,
    configuredCount: providers.filter((p) => p.configured).length,
  }
}

/** Renders a ProviderCheckReport into doctor transcript lines. */
export function formatProviderReport(report: ProviderCheckReport): string[] {
  const lines = report.providers.map((entry) => {
    const marker = entry.configured ? '✓' : '·'
    const state = entry.configured ? 'configured' : 'not set'
    const wired = entry.gatewayWired ? '' : '  (adapter ready, not auto-wired)'
    return `  ${marker} ${entry.provider}  ${entry.envVar} ${state}${wired}`
  })
  lines.push(`${report.configuredCount}/${report.providers.length} provider(s) configured`)
  return lines
}
