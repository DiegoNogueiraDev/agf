import { describe, it, expect } from 'vitest'
import { Runner } from '../core/autonomy/runner-fsm.js'

describe('Runner FSM — single-actor state machine', () => {
  it('garante no maximo uma execucao por vez', async () => {
    const runner = new Runner<string>()
    let active = 0
    let maxActive = 0
    const result1 = runner.run(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 50))
      active--
      return 'a'
    })
    const result2 = runner.run(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
      return 'b'
    })
    const results = await Promise.all([result1, result2])
    expect(maxActive).toBe(1)
    expect(results).toEqual(['a', 'b'])
  })

  it('run() retorna o resultado da funcao', async () => {
    const runner = new Runner<number>()
    const result = await runner.run(async () => 42)
    expect(result).toBe(42)
  })

  it('cancel() rejeita execucoes enfileiradas mas permite completar atual', async () => {
    const runner = new Runner<string>()
    const result1 = runner.run(async () => {
      await new Promise((r) => setTimeout(r, 50))
      return 'first'
    })
    // pequena pausa para garantir que result1 começou antes de enfileirar result2
    await new Promise((r) => setTimeout(r, 10))
    const result2 = runner.run(async () => 'second')
    await new Promise((r) => setTimeout(r, 5))
    // attach rejection handler BEFORE cancel para evitar unhandled rejection
    const result2Caught = result2.catch((e: Error) => e)
    runner.cancel()
    await expect(result1).resolves.toBe('first')
    const err = await result2Caught
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('cancelled')
  })

  it('run() apos cancel funciona (reset de estado)', async () => {
    const runner = new Runner<string>()
    runner.run(async () => {
      await new Promise((r) => setTimeout(r, 50))
      return 'pending'
    })
    runner.cancel()
    const result = await runner.run(async () => 'ok')
    expect(result).toBe('ok')
  })

  it('getState() reflete estado atual', () => {
    const runner = new Runner<string>()
    expect(runner.getState()).toBe('idle')
    runner.run(async () => 'x')
    expect(runner.getState()).toBe('running')
  })
})
