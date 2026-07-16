/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_17942a1f15a5 — Servidor de progresso mínimo (node:http, zero deps). Serve
 * a página vanilla em `/`, o snapshot em `/api/progress` e o tail de logs em
 * `/api/logs`. Porta custom com fallback para porta efêmera se ocupada.
 * Read-only: o usuário abre o navegador e acompanha; nada muta o grafo.
 */
import { createServer, type Server } from 'node:http'
import { createLogger, getLogBuffer } from '../utils/logger.js'
import { buildProgressSnapshot } from './progress-snapshot.js'
import { buildColonyHealthSnapshot } from './colony-health-snapshot.js'
import { buildEconomySnapshot } from './economy-snapshot.js'
import { buildGraphSnapshot, parseCsvParam, DEFAULT_LIMIT } from './graph-snapshot.js'
import { renderGraphView } from './views/graph-view.js'
import { renderProgressHtml } from './progress-html.js'
import { listSessionEventsSince } from '../session/session-event-store.js'
import { safeParseInt } from '../utils/parse-query.js'
import type { SqliteStore } from '../store/sqlite-store.js'

export interface ProgressServer {
  url: string
  port: number
  close: () => Promise<void>
}

export interface ProgressServerOptions {
  /** Porta preferida (default 4555). 0 = efêmera. */
  port?: number
  host?: string
  /** Quantidade de linhas de log no tail. */
  logTail?: number
  /** Chamado a cada request recebida — hook de atividade p/ idle-shutdown do caller. */
  onRequest?: () => void
}

const _log = createLogger({ layer: 'core', source: 'web/progress-server.ts' })

const DEFAULT_PORT = 4555

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(payload)
}

/** Sobe o servidor; resolve quando estiver ouvindo. Porta ocupada → efêmera. */
export function startProgressServer(store: SqliteStore, options: ProgressServerOptions = {}): Promise<ProgressServer> {
  const host = options.host ?? '127.0.0.1'
  const preferred = options.port ?? DEFAULT_PORT
  const logTail = options.logTail ?? 200

  const server: Server = createServer((req, res) => {
    options.onRequest?.()
    const url = req.url ?? '/'
    if (url === '/' || url.startsWith('/index')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      // Grafo tab is server-rendered from the dormant graph-view (layered layout,
      // zoom/pan, filters, click-to-detail) — fresh per request. Never let a graph
      // build error take down the page: fall back to the loading-state shell.
      let graphSection: string
      try {
        graphSection = renderGraphView(buildGraphSnapshot(store, {}))
      } catch {
        graphSection = ''
      }
      res.end(renderProgressHtml(graphSection))
      return
    }
    if (url.startsWith('/api/progress')) {
      json(res, 200, buildProgressSnapshot(store))
      return
    }
    if (url.startsWith('/api/logs')) {
      json(res, 200, { logs: getLogBuffer().slice(-logTail) })
      return
    }
    if (url.startsWith('/api/colony-health')) {
      json(res, 200, buildColonyHealthSnapshot(store.getStats()))
      return
    }
    if (url.startsWith('/api/economy')) {
      json(res, 200, buildEconomySnapshot(store))
      return
    }
    if (url.startsWith('/api/graph')) {
      const params = new URL(url, 'http://localhost').searchParams
      const limitResult = safeParseInt(params.get('limit') ?? undefined, { defaultValue: DEFAULT_LIMIT, min: 1 })
      json(res, 200, {
        ...buildGraphSnapshot(store, {
          status: parseCsvParam(params.get('status')),
          type: parseCsvParam(params.get('type')),
          limit: limitResult.value,
          rootId: params.get('rootId') ?? undefined,
        }),
        ...(limitResult.error ? { warning: limitResult.error } : {}),
      })
      return
    }
    if (url.startsWith('/api/session-events')) {
      const afterRaw = new URL(url, 'http://localhost').searchParams.get('after') ?? undefined
      const afterResult = safeParseInt(afterRaw, { defaultValue: 0, min: 0 })
      json(res, 200, {
        events: listSessionEventsSince(store.getDb(), afterResult.value),
        ...(afterResult.error ? { warning: afterResult.error } : {}),
      })
      return
    }
    json(res, 404, { error: 'not_found' })
  })

  return new Promise<ProgressServer>((resolve, reject) => {
    let triedEphemeral = false
    const onError = (err: NodeJS.ErrnoException): void => {
      if (err.code === 'EADDRINUSE' && !triedEphemeral) {
        triedEphemeral = true
        server.listen(0, host) // porta efêmera
        return
      }
      reject(err)
    }
    server.on('error', onError)
    server.once('listening', () => {
      server.removeListener('error', onError)
      server.on('error', () => {}) // ignora erros pós-listen (conexões abortadas)
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : preferred
      resolve({
        url: `http://${host}:${port}`,
        port,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res())
          }),
      })
    })
    server.listen(preferred, host)
  })
}
