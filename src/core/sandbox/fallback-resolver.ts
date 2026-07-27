/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import { execSync } from 'node:child_process'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'fallback-resolver.ts' })

export const ToolAvailabilitySchema = z.object({
  docker: z.boolean(),
  podman: z.boolean(),
  process: z.boolean(),
})

export type ToolAvailability = z.infer<typeof ToolAvailabilitySchema>

export const FallbackResultSchema = z.object({
  executionMode: z.enum(['docker', 'podman', 'process', 'error']),
  reason: z.string(),
  fallbackChain: z.array(z.enum(['docker', 'podman', 'process'])),
  timestamp: z.string(),
})

export type FallbackResult = z.infer<typeof FallbackResultSchema>

export class FallbackResolver {
  /**
   * Check if Docker is available on the system.
   */
  async checkDockerAvailability(): Promise<boolean> {
    try {
      execSync('docker --version', { stdio: 'pipe' })
      log.debug('fallback-resolver:checkDockerAvailability', { available: true })
      return true
    } catch {
      log.debug('fallback-resolver:checkDockerAvailability', { available: false })
      return false
    }
  }

  /**
   * Check if Podman is available on the system.
   */
  async checkPodmanAvailability(): Promise<boolean> {
    try {
      execSync('podman --version', { stdio: 'pipe' })
      log.debug('fallback-resolver:checkPodmanAvailability', { available: true })
      return true
    } catch {
      log.debug('fallback-resolver:checkPodmanAvailability', { available: false })
      return false
    }
  }

  /**
   * Check if process isolation is available (always true, fallback method).
   */
  async checkProcessAvailability(): Promise<boolean> {
    log.debug('fallback-resolver:checkProcessAvailability', { available: true })
    return true
  }

  /**
   * Resolve execution mode based on tool availability.
   * Tries Docker first, falls back to Podman, then process isolation.
   */
  resolveExecutionMode(toolsAvailable: ToolAvailability): FallbackResult {
    const fallbackChain: Array<'docker' | 'podman' | 'process'> = []

    let executionMode: 'docker' | 'podman' | 'process' | 'error'
    let reason: string

    // Try Docker first — always add to chain as the first attempted mode
    fallbackChain.push('docker')
    if (toolsAvailable.docker) {
      executionMode = 'docker'
      reason = 'Docker is available.'
    } else if (toolsAvailable.podman) {
      // Try Podman — add to chain even when docker failed
      fallbackChain.push('podman')
      executionMode = 'podman'
      reason = 'Docker unavailable. Using Podman as fallback.'
    } else if (toolsAvailable.process) {
      // Try process isolation — add podman and process to chain (all were considered)
      fallbackChain.push('podman')
      fallbackChain.push('process')
      executionMode = 'process'
      reason = 'Docker unavailable. Podman unavailable. Using process isolation as fallback.'
    } else {
      // All modes unavailable — record all three in chain
      fallbackChain.push('podman')
      fallbackChain.push('process')
      executionMode = 'error'
      reason = 'No isolation method available (Docker, Podman, and process all unavailable).'
    }

    const resultValue: FallbackResult = {
      executionMode,
      reason,
      fallbackChain,
      timestamp: new Date().toISOString(),
    }

    FallbackResultSchema.parse(resultValue)

    log.info('fallback-resolver:resolveExecutionMode', {
      executionMode,
      fallbackChain: fallbackChain.join(' → '),
    })

    return resultValue
  }
}
