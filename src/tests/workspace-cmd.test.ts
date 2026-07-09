import { describe, it, expect, vi } from 'vitest'
import { workspaceCommand } from '../cli/commands/workspace-cmd.js'

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await workspaceCommand().parseAsync(args, { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('workspaceCommand (node_wire_35e298d7d9dc — workspace-state wire)', () => {
  it('snapshot --track records the tracked file count and lists the snapshot', async () => {
    const result = await run(['snapshot', 'before', '--track', 'a.ts,b.ts'])
    expect(result.ok).toBe(true)
    const data = result.data as { snapshot: { label: string; fileCount: number }; all: unknown[] }
    expect(data.snapshot.label).toBe('before')
    expect(data.snapshot.fileCount).toBe(2)
    expect(data.all).toHaveLength(1)
  })

  it('snapshot --restore restores the snapshot just created', async () => {
    const result = await run(['snapshot', 'x', '--restore'])
    expect(result.ok).toBe(true)
    const data = result.data as { restored: boolean }
    expect(data.restored).toBe(true)
  })

  it('snapshot --revert creates a reverting snapshot', async () => {
    const result = await run(['snapshot', 'x', '--revert'])
    expect(result.ok).toBe(true)
    const data = result.data as { reverted: { label: string } }
    expect(data.reverted.label).toBe('revert-x')
  })

  it('diff creates two snapshots and diffs them', async () => {
    const result = await run(['diff', 'a', 'b'])
    expect(result.ok).toBe(true)
    const data = result.data as {
      from: { id: string; label: string }
      to: { id: string; label: string }
      diff: { fromId: string; toId: string }
    }
    expect(data.from.label).toBe('a')
    expect(data.to.label).toBe('b')
    expect(data.diff.fromId).toBe(data.from.id)
    expect(data.diff.toId).toBe(data.to.id)
  })
})
