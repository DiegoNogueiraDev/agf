/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §EPIC-serena-symbol-retrieval-bridge — Task 2.2: Health check bridge
 *
 * Probes the Serena MCP server and reports connectivity, version, and
 * exposed tools. Never throws — returns { connected: false } on any failure.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'serena-health.ts' })

export const DEFAULT_SERENA_URL = process.env['SERENA_URL'] ?? 'http://localhost:4568'
const PROBE_TIMEOUT_MS = 5000

export interface SerenaHealthResult {
  connected: boolean
  version?: string
  exposedTools?: string[]
}

export async function checkSerenaHealth(baseUrl: string = DEFAULT_SERENA_URL): Promise<SerenaHealthResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!response.ok) {
      log.info('serena:health:not_ok', { status: response.status })
      return { connected: false }
    }

    const data = (await response.json()) as Record<string, unknown>
    const rawTools = Array.isArray(data['tools'])
      ? (data['tools'] as string[])
      : Array.isArray(data['exposedTools'])
        ? (data['exposedTools'] as string[])
        : []

    log.info('serena:health:ok', { version: data['version'], toolCount: rawTools.length })
    return {
      connected: true,
      version: typeof data['version'] === 'string' ? data['version'] : 'unknown',
      exposedTools: rawTools,
    }
  } catch (err) {
    clearTimeout(timer)
    const message = err instanceof Error ? err.message : String(err)
    log.info('serena:health:unreachable', { error: message })
    return { connected: false }
  }
}
