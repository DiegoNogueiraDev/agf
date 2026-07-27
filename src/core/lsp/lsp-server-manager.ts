/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LspServerManager — Manages multiple language server instances (one per language).
 *
 * Handles lazy startup, keep-alive timers, auto-restart on crash,
 * and extension-based routing via ServerRegistry.
 */

import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { LspClient } from './lsp-client.js'
import { ServerRegistry } from './server-registry.js'
import type { LspServerConfig, LspServerState } from './lsp-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'lsp-server-manager.ts' })

const execAsync = promisify(exec)

const DEFAULT_KEEPALIVE_MS = 5 * 60 * 1000 // 5 minutes
const MAX_RESTART_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 30_000

interface ManagedServer {
  client: LspClient
  config: LspServerConfig
  state: LspServerState
  restartCount: number
  keepAliveTimer: ReturnType<typeof setTimeout> | null
  lastActivity: number
  intentionalStop: boolean
}

export class LspServerManager {
  private servers = new Map<string, ManagedServer>()

  constructor(
    private readonly registry: ServerRegistry,
    private readonly rootUri: string,
    private readonly keepAliveMs: number = DEFAULT_KEEPALIVE_MS,
  ) {}

  /**
   * Get a running LSP client for a language. Starts the server lazily if needed.
   * Returns null if the server binary is not available.
   */
  async ensureServer(languageId: string): Promise<LspClient | null> {
    // 1. Check if already running
    const existing = this.servers.get(languageId)
    if (existing && existing.state.status === 'ready') {
      this.resetKeepAlive(languageId)
      return existing.client
    }

    // 2. Get config from registry
    const config = this.registry.getConfigForLanguage(languageId)
    if (!config) {
      log.debug('LspServerManager: no config for language', { languageId })
      return null
    }

    // 3. Check if installed
    const installed = await this.isServerInstalled(languageId)
    if (!installed) {
      log.warn('LspServerManager: server binary not found', {
        languageId,
        command: config.command,
      })
      return null
    }

    // 4. Start server
    try {
      const client = await this.startServer(config)

      const managed: ManagedServer = {
        client,
        config,
        state: {
          languageId,
          status: 'ready',
          pid: client.pid,
        },
        restartCount: 0,
        keepAliveTimer: null,
        lastActivity: Date.now(),
        intentionalStop: false,
      }

      this.servers.set(languageId, managed)

      // 5. Set up exit handler for auto-restart
      client.on('exit', (code: number | null) => {
        void this.handleServerExit(languageId, code)
      })

      // 6. Set up keepAlive timer
      this.resetKeepAlive(languageId)

      log.info('LspServerManager: server started', {
        languageId,
        pid: String(client.pid ?? 'unknown'),
      })

      return client
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error('LspServerManager: failed to start server', {
        languageId,
        error: errorMsg,
      })

      // Store error state
      this.servers.set(languageId, {
        client: new LspClient(config.command, config.args, REQUEST_TIMEOUT_MS),
        config,
        state: {
          languageId,
          status: 'error',
          error: errorMsg,
        },
        restartCount: 0,
        keepAliveTimer: null,
        lastActivity: Date.now(),
        intentionalStop: false,
      })

      return null
    }
  }

  /**
   * Get a client for a file path (routes by extension via registry).
   * Returns null if no server configured for the file's language.
   */
  async getClientForFile(filePath: string): Promise<LspClient | null> {
    const languageId = this.registry.getLanguageForFile(filePath)
    if (!languageId) {
      log.debug('LspServerManager: no language mapping for file', { filePath })
      return null
    }
    return this.ensureServer(languageId)
  }

  /**
   * Check if a language server binary is installed.
   * Resolution order:
   *   1. probeCommand from config (if provided)
   *   2. Local node_modules/.bin (bundled dependency)
   *   3. System PATH via `which` / `where`
   */
  async isServerInstalled(languageId: string): Promise<boolean> {
    const config = this.registry.getConfigForLanguage(languageId)
    if (!config) {
      return false
    }

    // 1. Custom probe command
    if (config.probeCommand) {
      try {
        await execAsync(config.probeCommand)
        return true
      } catch {
        return false
      }
    }

    // 2. Check local node_modules/.bin (bundled via optionalDependencies)
    const localBin = resolveLocalBin(config.command)
    if (localBin) {
      return true
    }

    // 3. System PATH via which/where
    const whichCmd = process.platform === 'win32' ? `where ${config.command}` : `which ${config.command}`

    try {
      await execAsync(whichCmd)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get status of all known language servers.
   */
  getStatus(): Map<string, LspServerState> {
    const resultValue = new Map<string, LspServerState>()

    // Include running/errored servers
    for (const [langId, managed] of this.servers) {
      resultValue.set(langId, { ...managed.state })
    }

    // Include known-but-not-started servers from registry
    for (const config of this.registry.getAllConfigs()) {
      if (!resultValue.has(config.languageId)) {
        resultValue.set(config.languageId, {
          languageId: config.languageId,
          status: 'stopped',
        })
      }
    }

    return resultValue
  }

  /**
   * Shutdown all running servers gracefully.
   */
  async shutdownAll(): Promise<void> {
    const stopPromises: Promise<void>[] = []

    for (const [languageId, managed] of this.servers) {
      if (managed.keepAliveTimer) {
        clearTimeout(managed.keepAliveTimer)
        managed.keepAliveTimer = null
      }

      managed.intentionalStop = true

      if (managed.state.status === 'ready') {
        log.info('LspServerManager: stopping server', { languageId })
        stopPromises.push(managed.client.stop())
      }
    }

    await Promise.allSettled(stopPromises)
    this.servers.clear()
  }

  /**
   * Stop a single language server.
   */
  async stopServer(languageId: string): Promise<void> {
    const managed = this.servers.get(languageId)
    if (!managed) {
      return
    }

    if (managed.keepAliveTimer) {
      clearTimeout(managed.keepAliveTimer)
      managed.keepAliveTimer = null
    }

    managed.intentionalStop = true

    if (managed.state.status === 'ready') {
      await managed.client.stop()
    }

    managed.state = {
      languageId,
      status: 'stopped',
    }

    this.servers.delete(languageId)
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  /**
   * Reset the keep-alive timer for a language (call on each request).
   */
  private resetKeepAlive(languageId: string): void {
    const managed = this.servers.get(languageId)
    if (!managed) {
      return
    }

    if (managed.keepAliveTimer) {
      clearTimeout(managed.keepAliveTimer)
    }

    managed.lastActivity = Date.now()
    managed.keepAliveTimer = setTimeout(() => {
      log.info('LspServerManager: keep-alive timeout, stopping server', {
        languageId,
      })
      void this.stopServer(languageId)
    }, this.keepAliveMs)
  }

  /**
   * Handle server crash: auto-restart up to MAX_RESTART_ATTEMPTS.
   */
  private async handleServerExit(languageId: string, code: number | null): Promise<void> {
    const managed = this.servers.get(languageId)
    if (!managed) {
      return
    }

    // If intentional stop, don't restart
    if (managed.intentionalStop) {
      managed.state = {
        languageId,
        status: 'stopped',
      }
      return
    }

    managed.state = {
      languageId,
      status: 'error',
      error: `Process exited with code ${code}`,
    }

    if (managed.restartCount >= MAX_RESTART_ATTEMPTS) {
      log.error('LspServerManager: max restart attempts reached', {
        languageId,
        restartCount: String(managed.restartCount),
      })
      return
    }

    managed.restartCount++
    const delay = 1000 * Math.pow(2, managed.restartCount - 1)

    log.warn('LspServerManager: server crashed, restarting', {
      languageId,
      restartCount: String(managed.restartCount),
      delayMs: String(delay),
      exitCode: String(code ?? 'null'),
    })

    await new Promise<void>((resolve) => setTimeout(resolve, delay))

    // Re-check state after delay — may have been intentionally stopped
    const current = this.servers.get(languageId)
    if (!current || current.intentionalStop) {
      return
    }

    try {
      const client = await this.startServer(managed.config)

      current.client = client
      current.state = {
        languageId,
        status: 'ready',
        pid: client.pid,
      }

      client.on('exit', (exitCode: number | null) => {
        void this.handleServerExit(languageId, exitCode)
      })

      this.resetKeepAlive(languageId)

      log.info('LspServerManager: server restarted successfully', {
        languageId,
        attempt: String(managed.restartCount),
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error('LspServerManager: restart failed', {
        languageId,
        error: errorMsg,
      })
      current.state = {
        languageId,
        status: 'error',
        error: errorMsg,
      }
    }
  }

  /**
   * Start a language server: spawn process, send initialize, wait for response.
   */
  private async startServer(config: LspServerConfig): Promise<LspClient> {
    const resolvedCommand = resolveLocalBin(config.command) ?? config.command
    const client = new LspClient(resolvedCommand, config.args, REQUEST_TIMEOUT_MS)
    await client.start()

    // Send initialize request
    const initParams: Record<string, unknown> = {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          definition: {},
          references: {},
          hover: { contentFormat: ['markdown', 'plaintext'] },
          rename: { prepareSupport: true },
          callHierarchy: {},
          typeHierarchy: {},
          publishDiagnostics: { relatedInformation: true },
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          formatting: { dynamicRegistration: false },
          rangeFormatting: { dynamicRegistration: false },
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [
                  'quickfix',
                  'refactor',
                  'refactor.extract',
                  'refactor.inline',
                  'refactor.rewrite',
                  'source',
                  'source.organizeImports',
                  'source.fixAll',
                ],
              },
            },
          },
        },
      },
    }

    if (config.initializationOptions) {
      initParams.initializationOptions = config.initializationOptions
    }

    await client.sendRequest('initialize', initParams)

    // Send initialized notification
    client.sendNotification('initialized', {})

    // Send workspace configuration if settings exist
    if (config.settings) {
      client.sendNotification('workspace/didChangeConfiguration', {
        settings: config.settings,
      })
    }

    return client
  }
}

// ── Helpers ──────────────────────────────────────────

/**
 * Resolve a command binary from local node_modules/.bin.
 * Walks up from __dirname to find the nearest node_modules/.bin/<command>.
 * Returns the absolute path if found, null otherwise.
 */
function resolveLocalBin(command: string): string | null {
  const ext = process.platform === 'win32' ? '.cmd' : ''
  // Start from this file's directory and walk upward
  let dir = path.dirname(new URL(import.meta.url).pathname)
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'node_modules', '.bin', `${command}${ext}`)
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}
