/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../../core/utils/logger.js'
import { CdpConnection, type CdpConnectionConfig, type CdpEvent } from './cdp-connection.js'

const log = createLogger({ layer: 'core', source: 'plugins/browser/cdp-daemon.ts' })

export type DaemonStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface CdpDaemonConfig {
  connection: CdpConnectionConfig
}

export interface CdpDaemonStartResult {
  ok: boolean
  alreadyRunning?: boolean
  error?: string
}

export interface CdpDaemonSendResult {
  ok: boolean
  result?: unknown
  error?: string
}

export class CdpDaemon {
  private conn: CdpConnection | null = null
  private _status: DaemonStatus = 'idle'
  private readonly config: CdpDaemonConfig

  constructor(config: CdpDaemonConfig) {
    this.config = config
  }

  status(): DaemonStatus {
    return this._status
  }

  onEvent(handler: (event: CdpEvent) => void): void {
    this.conn?.on('event', handler)
  }

  async start(): Promise<CdpDaemonStartResult> {
    if (this._status === 'connected' && this.conn?.isConnected()) {
      return { ok: true, alreadyRunning: true }
    }

    this._status = 'connecting'
    this.conn = new CdpConnection(this.config.connection)

    try {
      await this.conn.connect()
      this._status = 'connected'
      log.info('CDP daemon started')
      return { ok: true }
    } catch (err) {
      this._status = 'error'
      log.warn('CDP daemon failed to start', { error: err instanceof Error ? err.message : String(err) })
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async send(method: string, params?: Record<string, unknown>): Promise<CdpDaemonSendResult> {
    if (!this.conn?.isConnected()) {
      return { ok: false, error: 'CDP daemon is not connected' }
    }
    try {
      const result = await this.conn.send(method, params)
      return { ok: true, result }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  close(): void {
    this.conn?.close()
    this.conn = null
    this._status = 'idle'
  }
}
