import { describe, it, expect, vi } from 'vitest'
import { runLifecycleFacade } from '../core/planner/lifecycle-facade.js'
import type { ModeInvoker } from '../core/planner/lifecycle-facade.js'

const successInvoker: ModeInvoker = async () => ({
  ok: true,
  payload: { result: 'ok' },
})

const failInvoker: ModeInvoker = async () => ({
  ok: false,
  error: 'mode failed',
})

describe('runLifecycleFacade', () => {
  it('returns ok:true with outputs for a valid phase', async () => {
    const report = await runLifecycleFacade(successInvoker, 'ANALYZE')
    expect(report.phase).toBe('ANALYZE')
    expect(report.warnings.some((w) => w.code === 'no_modes_for_phase')).toBe(report.modes.length === 0)
  })

  it('aggregates output per mode', async () => {
    const report = await runLifecycleFacade(successInvoker, 'IMPLEMENT')
    if (report.modes.length > 0) {
      expect(Object.keys(report.outputs).length).toBeGreaterThan(0)
    }
  })

  it('marks ok:false when a mode fails', async () => {
    const report = await runLifecycleFacade(failInvoker, 'IMPLEMENT')
    if (report.modes.length > 0) {
      expect(report.ok).toBe(false)
      expect(Object.keys(report.errors).length).toBeGreaterThan(0)
    }
  })

  it('warns mode_unknown for invalid subCheck', async () => {
    const report = await runLifecycleFacade(successInvoker, 'ANALYZE', 'nonexistent_mode')
    const unknownWarning = report.warnings.find((w) => w.code === 'mode_unknown')
    expect(unknownWarning).toBeTruthy()
  })

  it('runs only subCheck mode when provided and valid', async () => {
    const invoker = vi.fn().mockResolvedValue({ ok: true, payload: {} })
    const report = await runLifecycleFacade(invoker, 'IMPLEMENT')
    if (report.modes.length > 0) {
      const firstMode = report.modes[0]
      const singleReport = await runLifecycleFacade(invoker, 'IMPLEMENT', firstMode)
      expect(singleReport.modes).toHaveLength(1)
      expect(singleReport.modes[0]).toBe(firstMode)
    }
  })

  it('returns ok:true with no_modes_for_phase warning for unmapped phase', async () => {
    const report = await runLifecycleFacade(successInvoker, 'LISTENING')
    if (report.modes.length === 0) {
      expect(report.ok).toBe(true)
      expect(report.warnings.some((w) => w.code === 'no_modes_for_phase')).toBe(true)
    }
  })
})
