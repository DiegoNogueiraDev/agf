/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for embedded-spa: the standalone bun binary has no filesystem SPA dist,
 * so it serves the React SPA from a base64 map compiled into the binary. This
 * verifies asset bytes, content types, and the client-route SPA fallback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import { contentTypeFor, hasEmbeddedSpa, createEmbeddedSpaRouter } from '../api/embedded-spa.js'

const INDEX = Buffer.from('<!doctype html><div id="root"></div>').toString('base64')
const JS = Buffer.from('console.log(1)').toString('base64')
const DATA: Record<string, string> = {
  '/index.html': INDEX,
  '/assets/app-abc.js': JS,
}

describe('contentTypeFor', () => {
  it('maps known extensions', () => {
    expect(contentTypeFor('/index.html')).toContain('text/html')
    expect(contentTypeFor('/assets/x.js')).toContain('text/javascript')
    expect(contentTypeFor('/assets/x.css')).toContain('text/css')
    expect(contentTypeFor('/favicon.svg')).toContain('image/svg')
  })
  it('falls back to octet-stream for unknown extensions', () => {
    expect(contentTypeFor('/blob.xyz')).toBe('application/octet-stream')
  })
})

describe('hasEmbeddedSpa', () => {
  it('is false for an empty map (npm/source install)', () => {
    expect(hasEmbeddedSpa({})).toBe(false)
  })
  it('is true when assets are embedded (bun binary)', () => {
    expect(hasEmbeddedSpa(DATA)).toBe(true)
  })
})

describe('createEmbeddedSpaRouter', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    const app = express()
    app.use(createEmbeddedSpaRouter(DATA))
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        base = `http://127.0.0.1:${port}`
        resolve()
      })
    })
  })

  afterAll(() => {
    server?.close()
  })

  it('serves index.html at the root with html content type', async () => {
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('<div id="root">')
  })

  it('serves a hashed asset with its bytes and content type', async () => {
    const res = await fetch(`${base}/assets/app-abc.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/javascript')
    expect(await res.text()).toBe('console.log(1)')
  })

  it('falls back to index.html for a client-side route (no extension)', async () => {
    const res = await fetch(`${base}/economy`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('<div id="root">')
  })

  it('does not hijack /api paths (passes through to next handler → 404 here)', async () => {
    const res = await fetch(`${base}/api/v1/graph`)
    expect(res.status).toBe(404)
  })

  it('404s for an unknown asset with an extension (no silent index fallback)', async () => {
    const res = await fetch(`${base}/assets/missing-xyz.js`)
    expect(res.status).toBe(404)
  })
})
