/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations, configureDb } from '../core/store/migrations.js'
import { createEconomyMiddleware } from '../core/economy/economy-orchestrator.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { setLeverEnabled } from '../core/economy/economy-levers-config.js'
import { summarizeByLever } from '../core/economy/economy-lever-ledger.js'

describe('createEconomyMiddleware', () => {
  it('return identity function when ECONOMY flags not set', async () => {
    process.env.ECONOMY_COMPRESS = 'off'
    process.env.ECONOMY_CAVEMAN_INPUT = 'off'
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)

    const middleware = createEconomyMiddleware({ rootDir: process.cwd(), db })
    const body = { messages: [{ role: 'user', content: 'test' }] }
    const result = await middleware(body, async (req) => req)
    expect(result).toBe(body)
    db.close()
  })

  it('applies compression when ECONOMY_COMPRESS is on', async () => {
    process.env.ECONOMY_COMPRESS = 'on'
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)

    const diffLines: string[] = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,200 +1,200 @@',
    ]
    for (let i = 0; i < 200; i++)
      diffLines.push(i % 2 === 0 ? `+line ${i} content here for testing` : `-line ${i} content here for testing`)
    const diff = diffLines.join('\n')

    const body = { messages: [{ role: 'tool', content: diff, tool_call_id: 'c1' }] }
    const middleware = createEconomyMiddleware({ rootDir: process.cwd(), db })
    let capturedBody: typeof body | null = null
    const result = await middleware(body, async (req) => {
      capturedBody = req as typeof body
      return req as never
    })

    expect(capturedBody).not.toBeNull()
    if (capturedBody) {
      const content = capturedBody.messages[0].content as string
      expect(content.length).toBeLessThan(diff.length)
    }
    db.close()
  })

  it('keeps original body when no matching filter', async () => {
    process.env.ECONOMY_COMPRESS = 'on'
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)

    const body = { messages: [{ role: 'user', content: 'hello world' }] }
    const middleware = createEconomyMiddleware({ rootDir: process.cwd(), db })
    let passed = false
    await middleware(body, async (req) => {
      passed = true
      return req as never
    })
    expect(passed).toBe(true)
    db.close()
  })

  describe('info_bottleneck lever (opt-in)', () => {
    const NONEXISTENT_ROOT = '/nonexistent-agf-ib-root'
    // Must exceed the lossy-gate `nl` byte threshold (500) so the transform runs.
    const userText =
      'I think that this is basically a really very long sentence that should probably be compressed quite significantly via the caveman filter mode right here. '.repeat(
        5,
      )

    it('is OFF by default — no info_bottleneck adjudication is recorded', async () => {
      process.env.ECONOMY_COMPRESS = 'off'
      process.env.ECONOMY_CONTENT_ROUTER = 'off'
      process.env.ECONOMY_CAVEMAN_INPUT = 'on'
      const store = SqliteStore.open(':memory:')
      store.initProject('ib-off')
      const mw = createEconomyMiddleware({ rootDir: NONEXISTENT_ROOT, db: store.getDb() })
      await mw({ messages: [{ role: 'user', content: userText }] }, async (r) => r as never)
      const ib = summarizeByLever(store.getDb()).find((s) => s.lever === 'info_bottleneck')
      expect(ib).toBeUndefined()
      store.close()
    })

    it('records an info_bottleneck adjudication (with score) when enabled', async () => {
      process.env.ECONOMY_COMPRESS = 'off'
      process.env.ECONOMY_CONTENT_ROUTER = 'off'
      process.env.ECONOMY_CAVEMAN_INPUT = 'on'
      const store = SqliteStore.open(':memory:')
      store.initProject('ib-on')
      setLeverEnabled(store, 'info_bottleneck', true)
      const mw = createEconomyMiddleware({ rootDir: NONEXISTENT_ROOT, db: store.getDb() })
      const body = { messages: [{ role: 'user', content: userText }] }
      await mw(body, async (r) => r as never)
      const ib = summarizeByLever(store.getDb()).find((s) => s.lever === 'info_bottleneck')
      expect(ib).toBeDefined()
      // A high-recall caveman squeeze passes the break-even IB gate → kept.
      expect((body.messages[0].content as string).length).toBeLessThanOrEqual(userText.length)
      store.close()
    })
  })

  describe('context_diff lever (opt-in)', () => {
    const bigTool = 'TOOL OUTPUT: ' + 'lorem ipsum dolor sit amet '.repeat(20)

    it('is OFF by default — a re-sent tool message is left untouched', async () => {
      process.env.ECONOMY_COMPRESS = 'off'
      process.env.ECONOMY_CAVEMAN_INPUT = 'off'
      process.env.ECONOMY_CONTENT_ROUTER = 'off'
      const store = SqliteStore.open(':memory:')
      store.initProject('ctxdiff-off')
      const mw = createEconomyMiddleware({ rootDir: process.cwd(), db: store.getDb() })
      const mk = () => ({ messages: [{ role: 'tool', content: bigTool, tool_call_id: 'c1' }] })
      await mw(mk(), async (r) => r as never)
      const second = mk()
      await mw(second, async (r) => r as never)
      expect(second.messages[0].content).toBe(bigTool) // untouched
      store.close()
    })

    it('collapses a tool message already sent earlier this session when enabled', async () => {
      process.env.ECONOMY_COMPRESS = 'off'
      process.env.ECONOMY_CAVEMAN_INPUT = 'off'
      process.env.ECONOMY_CONTENT_ROUTER = 'off'
      const store = SqliteStore.open(':memory:')
      store.initProject('ctxdiff-on')
      setLeverEnabled(store, 'context_diff', true)
      const mw = createEconomyMiddleware({ rootDir: process.cwd(), db: store.getDb() })
      const mk = () => ({ messages: [{ role: 'tool', content: bigTool, tool_call_id: 'c1' }] })

      // First send: fresh → kept verbatim, recorded in the session prior.
      const first = mk()
      await mw(first, async (r) => r as never)
      expect(first.messages[0].content).toBe(bigTool)

      // Second send of the identical tool output → collapsed to the marker.
      const second = mk()
      await mw(second, async (r) => r as never)
      expect(second.messages[0].content).not.toBe(bigTool)
      expect((second.messages[0].content as string).length).toBeLessThan(bigTool.length)

      const summary = summarizeByLever(store.getDb())
      const cd = summary.find((s) => s.lever === 'context_diff')
      expect(cd).toBeDefined()
      expect(cd?.totalSaved).toBeGreaterThan(0)
      store.close()
    })
  })
})
