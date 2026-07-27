/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * app-factory — builds + starts the Express app that serves the web dashboard:
 * the built Vite SPA (static) plus the REST API under /api/v1. This is the HTTP
 * surface `agf dashboard` boots.
 *
 * Static dir resolves relative to this module so it works both under tsx (dev →
 * src/web/dashboard/dist) and after bun build (prod → dist/web/dashboard/dist,
 * populated by the copy-dashboard script). SPA fallback serves index.html for
 * any non-API, non-asset path so a hard refresh never 404s.
 *
 * Composes with: api/router.ts (the /api/v1 mount), cli/commands/dashboard-cmd.ts.
 */

import express, { type Express } from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import type { Server } from 'node:http'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import { createApiRouter } from './router.js'
import { hasEmbeddedSpa, createEmbeddedSpaRouter } from './embedded-spa.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

/** Absolute path to the built SPA (../web/dashboard/dist relative to this module). */
export function resolveDashboardDist(): string {
  return path.resolve(moduleDir, '..', 'web', 'dashboard', 'dist')
}

/** Build the Express app: /api/v1 + static SPA + SPA fallback. */
export function createDashboardApp(store: SqliteStore): Express {
  const app = express()
  const distDir = resolveDashboardDist()
  const indexHtml = path.join(distDir, 'index.html')

  app.use('/api/v1', createApiRouter({ store }))

  // Serve the full Graph+Economy SPA, preferring the on-disk dist (source/npm
  // install), then the SPA compiled into the standalone bun binary (embedded-spa),
  // and only then the minimal lite page. Never a raw Express 404.
  if (existsSync(distDir)) {
    app.use(express.static(distDir))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(indexHtml))
  } else if (hasEmbeddedSpa()) {
    app.use(createEmbeddedSpaRouter())
  } else {
    app.get(/^(?!\/api\/).*/, (_req, res) => res.type('html').send(FALLBACK_HTML))
  }

  return app
}

/**
 * Minimal built-in dashboard for the standalone binary (no embedded SPA): it
 * fetches the live local API and shows the headline graph + economy numbers, so
 * `agf dashboard` is useful from a binary instead of a 404. Full visual UI ships
 * with the source/npm install.
 */
const FALLBACK_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agf · local dashboard</title>
<style>
:root{--bg:#3a3122;--fg:#f0ead9;--muted:#a89d85;--amber:#e7a44b;--green:#86b86a;--edge:#5c5240}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:2rem}
h1{font-size:1.3rem;margin:0 0 .25rem}.sub{color:var(--muted);font-size:.85rem;margin-bottom:1.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;max-width:760px}
.card{border:1px solid var(--edge);border-radius:12px;padding:1rem;background:rgba(231,164,75,.05)}
.card .k{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.card .v{font-size:1.6rem;font-weight:600;margin-top:.2rem}
.note{color:var(--muted);font-size:.8rem;margin-top:1.75rem;max-width:760px}
a{color:var(--amber)}
</style></head><body>
<h1>agf · local dashboard</h1>
<div class="sub">standalone binary · live data from this project's graph</div>
<div class="grid" id="g">loading…</div>
<p class="note">This is the built-in lite view. The full visual UI (Graph + Economy) ships with the
source/npm install (<code>agf dashboard</code>).
API live at <code>/api/v1</code>.</p>
<script>
function card(k,v){return '<div class="card"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>'}
Promise.all([
  fetch('/api/v1/stats').then(r=>r.json()).catch(()=>({})),
  fetch('/api/v1/economy').then(r=>r.json()).catch(()=>({}))
]).then(([s,e])=>{
  var done=(s.byStatus&&s.byStatus.done)||0, total=s.totalNodes||0;
  var d=e.delegate, t=(e.totals||{});
  document.getElementById('g').innerHTML=[
    card('Nodes', total.toLocaleString()),
    card('Done', done.toLocaleString()+' / '+total.toLocaleString()),
    card('Saved ($)', '$'+(t.savedUsd||0).toFixed(4)),
    card('Delegate', d?d.savedPct+'%':'—'),
    card('Tokens saved', (t.saved||0).toLocaleString()),
    card('Spent ($)', '$'+(t.costUsd||0).toFixed(4))
  ].join('')
}).catch(function(){document.getElementById('g').textContent='API unavailable.'})
</script></body></html>`

export interface StartDashboardOptions {
  port: number
  host?: string
}

export interface DashboardServerHandle {
  url: string
  server: Server
}

/** Start the dashboard HTTP server and resolve once it is listening. */
export function startDashboardServer(store: SqliteStore, opts: StartDashboardOptions): Promise<DashboardServerHandle> {
  const host = opts.host ?? '127.0.0.1'
  const app = createDashboardApp(store)
  return new Promise((resolve, reject) => {
    const server = app.listen(opts.port, host, () => {
      // Derive the URL from the actual bound address so port 0 (ephemeral, used
      // by tests) resolves to the real assigned port.
      const addr = server.address()
      const boundPort = typeof addr === 'object' && addr ? addr.port : opts.port
      resolve({ url: `http://${host}:${boundPort}`, server })
    })
    server.on('error', reject)
  })
}
