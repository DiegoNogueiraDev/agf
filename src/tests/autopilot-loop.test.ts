import { describe, it, expect } from 'vitest'
import { runAutopilot, type AutopilotGraphPort, type AutopilotStep } from '../core/autonomy/autopilot-loop.js'

/**
 * Porta fake em memória: tasks com flag `dodReady` indicando se passam no DoD
 * depois de marcadas in_progress. Rastreia transições para asserts de WIP.
 */
function makeFakePort(
  tasks: Array<{ id: string; title: string; dodReady: boolean }>,
): AutopilotGraphPort & { inProgressCount: number; statuses: Map<string, string> } {
  const statuses = new Map<string, string>(tasks.map((t) => [t.id, 'backlog']))
  let inProgressCount = 0
  let maxConcurrent = 0
  return {
    statuses,
    get inProgressCount() {
      return maxConcurrent
    },
    nextTask() {
      const t = tasks.find((x) => statuses.get(x.id) === 'backlog')
      return t ? { id: t.id, title: t.title } : null
    },
    markInProgress(id) {
      statuses.set(id, 'in_progress')
      inProgressCount++
      maxConcurrent = Math.max(maxConcurrent, inProgressCount)
    },
    checkDone(id) {
      const t = tasks.find((x) => x.id === id)
      const ready = t?.dodReady === true && statuses.get(id) === 'in_progress'
      return { ready, failedRequired: ready ? [] : ['status_flow_valid'] }
    },
    markDone(id) {
      statuses.set(id, 'done')
      inProgressCount--
    },
  }
}

describe('loop autônomo com guardrails (next → in_progress → DoD → done|escalate)', () => {
  it('onStep é chamado para cada step, na ordem (live updates da TUI)', async () => {
    const port = makeFakePort([
      { id: 't1', title: 'A', dodReady: true },
      { id: 't2', title: 'B', dodReady: true },
    ])
    const seen: AutopilotStep[] = []
    const result = await runAutopilot(port, { maxIterations: 10, onStep: (s) => seen.push(s) })
    // onStep recebe exatamente os mesmos steps do resultado, na mesma ordem
    expect(seen).toEqual(result.steps)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0].action).toBe('in_progress')
  })

  it('completa todas as tasks prontas e para por falta de tasks', async () => {
    const port = makeFakePort([
      { id: 't1', title: 'A', dodReady: true },
      { id: 't2', title: 'B', dodReady: true },
    ])
    const result = await runAutopilot(port, { maxIterations: 10 })
    expect(result.completed).toBe(2)
    expect(result.escalated).toBe(0)
    expect(result.stopped).toBe('no_more_tasks')
    expect(port.statuses.get('t1')).toBe('done')
  })

  it('escala e PARA quando uma task não passa no DoD', async () => {
    const port = makeFakePort([
      { id: 't1', title: 'A', dodReady: true },
      { id: 't2', title: 'B', dodReady: false },
      { id: 't3', title: 'C', dodReady: true },
    ])
    const result = await runAutopilot(port, { maxIterations: 10 })
    expect(result.completed).toBe(1) // só t1
    expect(result.escalated).toBe(1) // t2
    expect(result.stopped).toBe('escalation')
    expect(port.statuses.get('t3')).toBe('backlog') // nunca chegou em t3
  })

  it('respeita WIP=1 (nunca mais de uma task in_progress)', async () => {
    const port = makeFakePort([
      { id: 't1', title: 'A', dodReady: true },
      { id: 't2', title: 'B', dodReady: true },
    ])
    await runAutopilot(port, { maxIterations: 10 })
    expect(port.inProgressCount).toBe(1)
  })

  it('o budget (cost-runaway guard) interrompe o loop', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      title: `T${i}`,
      dodReady: true,
    }))
    const result = await runAutopilot(makeFakePort(many), { maxIterations: 3 })
    expect(result.completed).toBe(3)
    expect(result.stopped).toBe('budget_exhausted')
  })

  it('escala quando o passo de implementação (hook) falha', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A', dodReady: true }])
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => false, // simula TDD que não ficou verde
    })
    expect(result.completed).toBe(0)
    expect(result.escalated).toBe(1)
    expect(result.stopped).toBe('escalation')
  })

  it("signal já abortado → não processa nenhuma task (stopped='aborted')", async () => {
    const port = makeFakePort([
      { id: 't1', title: 'A', dodReady: true },
      { id: 't2', title: 'B', dodReady: true },
    ])
    const result = await runAutopilot(port, { maxIterations: 10, signal: { aborted: true } })
    expect(result.completed).toBe(0)
    expect(result.stopped).toBe('aborted')
    expect(port.statuses.get('t1')).toBe('backlog') // nada foi tocado
  })

  it("aborta após a 1ª task → para na próxima checagem (completed=1, stopped='aborted')", async () => {
    const port = makeFakePort([
      { id: 't1', title: 'A', dodReady: true },
      { id: 't2', title: 'B', dodReady: true },
      { id: 't3', title: 'C', dodReady: true },
    ])
    const signal = { aborted: false }
    const result = await runAutopilot(port, {
      maxIterations: 10,
      signal,
      onStep: (s) => {
        if (s.action === 'done') signal.aborted = true // aborta após a 1ª done
      },
    })
    expect(result.completed).toBe(1)
    expect(result.stopped).toBe('aborted')
  })

  it('sem signal → comportamento idêntico ao atual (não-regressão)', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A', dodReady: true }])
    const result = await runAutopilot(port, { maxIterations: 10 })
    expect(result.stopped).toBe('no_more_tasks')
    expect(result.completed).toBe(1)
  })
})
