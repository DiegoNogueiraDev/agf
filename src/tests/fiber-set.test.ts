import { describe, it, expect, vi } from 'vitest'
import { FiberSet } from '../core/autonomy/fiber-set.js'

describe('FiberSet — execucao paralela de tools', () => {
  it('executa todas as tools em paralelo', async () => {
    const fs = new FiberSet()
    let completed = 0
    fs.run(async () => {
      await new Promise((r) => setTimeout(r, 50))
      completed++
      return 'a'
    })
    fs.run(async () => {
      completed++
      return 'b'
    })
    const results = await fs.join()
    expect(completed).toBe(2)
    expect(results).toContain('a')
    expect(results).toContain('b')
  })

  it('erro em uma tool nao quebra as outras', async () => {
    const fs = new FiberSet()
    fs.run(async () => {
      throw new Error('fail')
    })
    fs.run(async () => 'ok')
    const results = await fs.join()
    expect(results).toHaveLength(2)
    expect(results[0]).toBeInstanceOf(Error)
    expect(results[1]).toBe('ok')
  })

  it('join() em fiber vazio retorna array vazio', async () => {
    const fs = new FiberSet()
    const results = await fs.join()
    expect(results).toEqual([])
  })

  it('clear() remove fibers pendentes', async () => {
    const fs = new FiberSet()
    const spy = vi.fn()
    fs.run(spy)
    fs.clear()
    await fs.join()
    expect(spy).not.toHaveBeenCalled()
  })

  it('node_754422b1419d: a fiber added while join() is pending is never lost — it is picked up by the next join()', async () => {
    const fs = new FiberSet()
    fs.run(async () => {
      await new Promise((r) => setTimeout(r, 20))
      return 'first-batch'
    })
    const joinPromise = fs.join() // snapshot + clear happen synchronously here, before any await

    // Adding a fiber while the above join() is still pending must land in the
    // fresh (post-clear) array, not be silently dropped.
    fs.run(async () => 'added-during-pending-join')

    const firstResults = await joinPromise
    expect(firstResults).toEqual(['first-batch'])

    const secondResults = await fs.join()
    expect(secondResults).toEqual(['added-during-pending-join'])
  })
})
