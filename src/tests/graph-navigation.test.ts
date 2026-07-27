import { describe, it, expect, vi } from 'vitest'
import { GraphNavigationHandler } from '../tui/slash/graph-navigation.js'
import type { SkillExecutionContext } from '../tui/skill-handler-port.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

describe('GraphNavigationHandler', () => {
  const makeStore = () =>
    ({
      toGraphDocument: () => ({
        nodes: [
          { id: 'n1', type: 'task', title: 'Tarefa 1', status: 'in_progress', priority: 1 },
          { id: 'n2', type: 'task', title: 'Tarefa 2', status: 'backlog', priority: 2 },
        ],
        edges: [],
      }),
      getProjectSetting: vi.fn().mockReturnValue('IMPLEMENT'),
    }) as unknown as SqliteStore

  const makeCtx = (store: SqliteStore): SkillExecutionContext => ({
    store,
    dir: process.cwd(),
    testCmd: 'echo ok',
    ledger: { entries: vi.fn().mockReturnValue([]), totals: vi.fn().mockReturnValue({ total: 0, calls: 0 }) } as never,
    onProgress: vi.fn(),
  })

  it('executa modo dry-run por padrão e reporta 6 passos', async () => {
    const handler = new GraphNavigationHandler()
    const result = await handler.execute('', makeCtx(makeStore()))
    expect(result).toContain('graph-navigation')
    expect(result).toContain('Dry-run')
    expect(result).toContain('[1/6]')
    expect(result).toContain('[6/6]')
  })

  it('--auto aplica fixes', async () => {
    const handler = new GraphNavigationHandler()
    const result = await handler.execute('--auto', makeCtx(makeStore()))
    expect(result).toContain('graph-navigation')
    expect(result).not.toContain('Dry-run')
  })

  it('--dry-run reporta sem modificar', async () => {
    const handler = new GraphNavigationHandler()
    const result = await handler.execute('--dry-run', makeCtx(makeStore()))
    expect(result).toContain('Dry-run')
  })

  it('emite onProgress para cada passo', async () => {
    const handler = new GraphNavigationHandler()
    const ctx = makeCtx(makeStore())
    const onProgress = vi.fn()
    await handler.execute('', { ...ctx, onProgress })
    // Pelo menos 6 steps (um por passo da navegação)
    expect(onProgress).toHaveBeenCalledTimes(6)
  })

  it('inclui elapsed time no resumo', async () => {
    const handler = new GraphNavigationHandler()
    const result = await handler.execute('', makeCtx(makeStore()))
    expect(result).toMatch(/\d+ms|\d+s/)
  })

  it('step 1: Self-Healing reports issues detected and formatted warnings', async () => {
    const handler = new GraphNavigationHandler()
    const ctx = makeCtx(makeStore())
    ctx.store.toGraphDocument = () =>
      ({
        nodes: [
          { id: 'n1', type: 'task', title: 'Orphan task', status: 'ready', priority: 1 },
          { id: 'n2', type: 'task', title: 'Blocked task', status: 'blocked', priority: 2 },
          { id: 'n3', type: 'task', title: 'Done task', status: 'done', priority: 3 },
          { id: 'n4', type: 'epic', title: 'Epic', status: 'done', priority: 1 },
        ],
        edges: [{ from: 'n1', to: 'n2', relationType: 'blocks' }],
      }) as never
    const result = await handler.execute('', ctx)
    expect(result).toContain('[1/6] Self-Healing')
    expect(result).toContain('issues')
    expect(result).toContain('healed')
  })

  it('step 2: Self-Learning scans healing memories', async () => {
    const handler = new GraphNavigationHandler()
    const result = await handler.execute('', makeCtx(makeStore()))
    expect(result).toContain('[2/6] Self-Learning')
    expect(result).toMatch(/\[2\/6\] Self-Learning: \d+ pattern/)
  })

  it('step 3: Auto-Verify runs test command', async () => {
    const handler = new GraphNavigationHandler()
    const result = await handler.execute('', makeCtx(makeStore()))
    expect(result).toContain('[3/6] Auto-Verify')
    // echo ok should pass tests
    expect(result).toContain('tests pass')
  })

  it('step 3: Auto-Verify reports failure when test fails', async () => {
    const handler = new GraphNavigationHandler()
    const ctx = makeCtx(makeStore())
    ctx.testCmd = 'exit 1'
    const result = await handler.execute('', ctx)
    expect(result).toContain('[3/6] Auto-Verify')
    expect(result).not.toContain('tests pass')
  })

  it('step 4: Auto-Scaffold reports backlog and done counts', async () => {
    const handler = new GraphNavigationHandler()
    const store = makeStore()
    store.toGraphDocument = () =>
      ({
        nodes: [
          { id: 'n1', type: 'task', title: 't1', status: 'backlog', priority: 1 },
          { id: 'n2', type: 'task', title: 't2', status: 'backlog', priority: 2 },
          { id: 'n3', type: 'task', title: 't3', status: 'done', priority: 3 },
        ],
        edges: [],
      }) as never
    const result = await handler.execute('', makeCtx(store))
    expect(result).toContain('[4/6] Auto-Scaffold')
    expect(result).toContain('2 task(s) backlog')
    expect(result).toContain('1 task(s) done')
  })

  it('step 5: Auto-Boilerplate roda o coupler determinístico', async () => {
    const handler = new GraphNavigationHandler()
    const result = await handler.execute('', makeCtx(makeStore()))
    expect(result).toContain('[5/6] Auto-Boilerplate')
    // Coupler real: nodes do mock não têm scaffold spec → nenhum disponível.
    expect(result).toContain('scaffold')
  })

  it('step 6: Auto-Dogfooding validates own output', async () => {
    const handler = new GraphNavigationHandler()
    const result = await handler.execute('', makeCtx(makeStore()))
    expect(result).toContain('[6/6] Auto-Dogfooding')
    expect(result).toContain('self-assessment')
  })

  it('all 6 step markers appear in order', async () => {
    const handler = new GraphNavigationHandler()
    const result = await handler.execute('', makeCtx(makeStore()))
    const idx1 = result.indexOf('[1/6]')
    const idx2 = result.indexOf('[2/6]')
    const idx3 = result.indexOf('[3/6]')
    const idx4 = result.indexOf('[4/6]')
    const idx5 = result.indexOf('[5/6]')
    const idx6 = result.indexOf('[6/6]')
    expect(idx1).toBeGreaterThan(-1)
    expect(idx2).toBeGreaterThan(idx1)
    expect(idx3).toBeGreaterThan(idx2)
    expect(idx4).toBeGreaterThan(idx3)
    expect(idx5).toBeGreaterThan(idx4)
    expect(idx6).toBeGreaterThan(idx5)
  })
})
