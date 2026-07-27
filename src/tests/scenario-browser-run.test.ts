/**
 * scenario-browser-run.test.ts — the wire between the scenario chain and the gate.
 *
 * Every piece this exercises already existed and was tested; what never existed
 * was a production caller joining them. These tests pin the two things the wiring
 * itself has to get right, because neither piece can enforce them alone:
 *
 *  1. It must REFUSE to drive a browser at a target backed by the live graph. The
 *     dashboard is not read-only (it can create edges and delete agents), so a
 *     scenario proving a surface could destroy real work — and any reinforcement
 *     loop would then repeat that destruction on every run.
 *  2. Infrastructure that is missing must never be recorded as a delivery that
 *     BROKE. "The daemon is down" and "the feature is broken" are different facts,
 *     and conflating them teaches the operator to ignore the gate.
 *
 * BrowserActions is a port, so the whole run is exercised with an in-memory
 * implementation — a real driver is not needed to prove the wiring.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { resolveScenarioTarget, runBrowserScenario } from '../core/observability/scenario-browser-run.js'
import { surfaceProofState } from '../core/observability/scenario-verdict-store.js'
import type { BrowserActions } from '../plugins/browser/actions/index.js'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
})

/** Minimal in-memory port: every action succeeds, screenshot yields evidence. */
function workingActions(over: Partial<BrowserActions> = {}): BrowserActions {
  const ok = async () => ({ ok: true as const })
  return {
    navigate: async () => ({ ok: true as const, url: 'http://localhost:9999/' }),
    click: ok,
    type: ok,
    pressKey: ok,
    // `data` is what the executor reads as evidence (ScreenshotResult carries data, not path).
    screenshot: async () => ({ ok: true as const, data: 'base64-pixels' }),
    jsEval: async () => ({ ok: true as const, value: null }),
    pageInfo: async () => ({ ok: true as const, url: 'http://localhost:9999/', title: 'agf' }),
    getCookies: async () => ({ ok: true as const, cookies: [] }),
    setCookie: ok,
    clearCookies: ok,
    getAuthState: async () => ({ ok: true as const, authenticated: false }),
    networkLog: async () => ({ ok: true as const, entries: [] }),
    consoleMessages: async () => ({ ok: true as const, messages: [] }),
    ...over,
  } as BrowserActions
}

describe('resolveScenarioTarget — never drive a browser at the live graph', () => {
  const project = '/repo/agf'

  it('accepts a graph directory outside the project', () => {
    const r = resolveScenarioTarget({ projectDir: project, graphDir: '/tmp/throwaway' })
    expect(r.ok).toBe(true)
  })

  it('REFUSES the project directory itself', () => {
    const r = resolveScenarioTarget({ projectDir: project, graphDir: project })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('UNSAFE_TARGET')
  })

  it('REFUSES a path inside the project — the live graph lives under it', () => {
    const r = resolveScenarioTarget({ projectDir: project, graphDir: `${project}/workflow-graph` })
    expect(r.ok).toBe(false)
  })

  it('is not fooled by a relative path that resolves back into the project', () => {
    // `/repo/agf/tmp/..` is the project. Comparing the strings would pass it.
    const r = resolveScenarioTarget({ projectDir: project, graphDir: `${project}/tmp/..` })
    expect(r.ok).toBe(false)
  })

  it('REFUSES when no graph directory was named at all', () => {
    // The unrecognized case must block, not fall back to "probably fine".
    const r = resolveScenarioTarget({ projectDir: project, graphDir: undefined })
    expect(r.ok).toBe(false)
  })
})

describe('runBrowserScenario — the missing production caller', () => {
  const disposable = (): string => mkdtempSync(path.join(tmpdir(), 'agf-target-'))

  it('records a passed verdict the surface gate can read', async () => {
    const dir = disposable()
    const r = await runBrowserScenario({
      db,
      nodeId: 'node_surface',
      nl: 'navegue para http://localhost:9999/\ntirar screenshot',
      actions: workingActions(),
      projectDir: '/repo/agf',
      graphDir: dir,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.verdict.verdict).toBe('passed')
    expect(surfaceProofState(db, 'node_surface')).toBe('passed')
    rmSync(dir, { recursive: true, force: true })
  })

  it('records failed when a step genuinely fails', async () => {
    const dir = disposable()
    const actions = workingActions({ click: async () => ({ ok: false as const, error: 'not found' }) })
    await runBrowserScenario({
      db,
      nodeId: 'node_bad',
      nl: 'navegue para http://localhost:9999/\nclique em #run\ntirar screenshot',
      actions,
      projectDir: '/repo/agf',
      graphDir: dir,
    })
    expect(surfaceProofState(db, 'node_bad')).toBe('failed')
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses an unsafe target BEFORE touching the browser', async () => {
    let touched = 0
    const actions = workingActions({
      navigate: async () => {
        touched++
        return { ok: true as const, url: 'x' }
      },
    })
    const r = await runBrowserScenario({
      db,
      nodeId: 'node_x',
      nl: 'navegue para http://localhost:9999/',
      actions,
      projectDir: '/repo/agf',
      graphDir: '/repo/agf',
    })
    expect(r.ok).toBe(false)
    expect(touched).toBe(0)
    expect(surfaceProofState(db, 'node_x')).toBe('missing')
  })

  it('does NOT record failed when the driver itself is unreachable', async () => {
    // Infra absence is not a broken delivery. Recording `failed` here would make
    // a dead daemon look exactly like a regression.
    const dir = disposable()
    const actions = workingActions({
      navigate: async () => {
        throw new Error('cdp_ws_unreachable')
      },
    })
    const r = await runBrowserScenario({
      db,
      nodeId: 'node_infra',
      nl: 'navegue para http://localhost:9999/',
      actions,
      projectDir: '/repo/agf',
      graphDir: dir,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('DRIVER_UNREACHABLE')
    expect(surfaceProofState(db, 'node_infra')).not.toBe('failed')
    rmSync(dir, { recursive: true, force: true })
  })
})
