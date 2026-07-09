/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Real-network responsiveness check for `agf doctor --providers`.
 * Sends a minimal request to each configured provider and reports
 * { reachable, latencyMs, error? }.
 */

import { FiberSet } from '../autonomy/fiber-set.js'

export interface ProviderPingSpec {
  provider: string
  envVar: string
  endpoint: string
}

export interface PingResult {
  provider: string
  envDetected: boolean
  reachable: boolean
  latencyMs: number
  error?: string
}

export type PingFetchFn = (url: string, init: RequestInit) => Promise<Response>

const PROVIDER_SPECS: ProviderPingSpec[] = [
  { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY', endpoint: 'https://api.anthropic.com/v1/models' },
  { provider: 'openai', envVar: 'OPENAI_API_KEY', endpoint: 'https://api.openai.com/v1/models' },
  { provider: 'openrouter', envVar: 'OPENROUTER_API_KEY', endpoint: 'https://openrouter.ai/api/v1/models' },
  { provider: 'gemini', envVar: 'GEMINI_API_KEY', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models' },
  {
    provider: 'bedrock',
    envVar: 'BEDROCK_API_KEY',
    endpoint: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/list',
  },
  { provider: 'azure', envVar: 'AZURE_OPENAI_API_KEY', endpoint: 'https://management.azure.com/ping' },
  { provider: 'deepseek', envVar: 'DEEPSEEK_API_KEY', endpoint: 'https://api.deepseek.com/models' },
  { provider: 'glm', envVar: 'GLM_API_KEY', endpoint: 'https://open.bigmodel.cn/api/paas/v4/models' },
  { provider: 'kimi', envVar: 'KIMI_API_KEY', endpoint: 'https://api.moonshot.cn/v1/models' },
  { provider: 'groq', envVar: 'GROQ_API_KEY', endpoint: 'https://api.groq.com/openai/v1/models' },
]

export async function pingProvider(
  spec: ProviderPingSpec,
  apiKey: string,
  timeout: number,
  fetchFn: PingFetchFn,
): Promise<PingResult> {
  const start = Date.now()

  const timeoutPromise = new Promise<PingResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          provider: spec.provider,
          envDetected: true,
          reachable: false,
          latencyMs: Date.now() - start,
          error: 'TIMEOUT',
        }),
      timeout,
    ),
  )

  const fetchPromise = (async (): Promise<PingResult> => {
    try {
      const response = await fetchFn(spec.endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: undefined,
      })
      const latencyMs = Date.now() - start
      if (response.status === 401 || response.status === 403) {
        return { provider: spec.provider, envDetected: true, reachable: false, latencyMs, error: 'AUTH_ERROR' }
      }
      if (response.ok) {
        return { provider: spec.provider, envDetected: true, reachable: true, latencyMs }
      }
      return { provider: spec.provider, envDetected: true, reachable: false, latencyMs, error: 'NETWORK_ERROR' }
    } catch {
      return {
        provider: spec.provider,
        envDetected: true,
        reachable: false,
        latencyMs: Date.now() - start,
        error: 'NETWORK_ERROR',
      }
    }
  })()

  return Promise.race([fetchPromise, timeoutPromise])
}

export async function pingAllProviders(
  env: NodeJS.ProcessEnv,
  opts?: { timeout?: number; fetchFn?: PingFetchFn; noPing?: boolean },
): Promise<PingResult[]> {
  if (opts?.noPing) return []

  const fetchFn: PingFetchFn = opts?.fetchFn ?? ((url, init) => fetch(url, init))
  const timeout = opts?.timeout ?? 5000

  const configured = PROVIDER_SPECS.filter((spec) => env[spec.envVar])

  const fibers = new FiberSet()
  for (const spec of configured) {
    fibers.run(() => pingProvider(spec, env[spec.envVar]!, timeout, fetchFn))
  }
  return (await fibers.join()) as PingResult[]
}
