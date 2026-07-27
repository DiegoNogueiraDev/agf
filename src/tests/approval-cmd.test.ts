import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { approvalCommand } from '../cli/commands/approval-cmd.js'

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await approvalCommand().parseAsync(args, { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('approvalCommand (node_wire_016312cb8f14 — approval-token wire)', () => {
  it('check creates, grants, verifies and consumes a token', async () => {
    const result = await run(['check', 'bash-exec', 'rm -rf /tmp/work', 'orchestrator', 'executor'])
    expect(result.ok).toBe(true)
    const data = result.data as {
      token: { status: string }
      verified: boolean
      consumed: boolean
      reuseBlocked: boolean
    }
    expect(data.token.status).toBe('consumed')
    expect(data.verified).toBe(true)
    expect(data.consumed).toBe(true)
    expect(data.reuseBlocked).toBe(true)
  })

  it('check --revoke revokes instead of consuming', async () => {
    const result = await run(['check', 'direct-push', 'push', 'owner', 'bot', '--revoke'])
    expect(result.ok).toBe(true)
    const data = result.data as { token: { status: string } }
    expect(data.token.status).toBe('revoked')
  })
})

describe('approvalCommand wait (node_wire_ac858808e43f — signal-file-watcher wire)', () => {
  it('wait resolves immediately when the signal file is already approved', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'agf-approval-wait-'))
    try {
      writeFileSync(path.join(dir, 'task-approved.json'), JSON.stringify({ approved: true }))
      const result = await run(['wait', 'task-approved', '--dir', dir, '--timeout-ms', '1000', '--interval-ms', '10'])
      expect(result.ok).toBe(true)
      const data = result.data as { taskId: string; approved: boolean }
      expect(data.taskId).toBe('task-approved')
      expect(data.approved).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('wait fails with APPROVAL_TIMEOUT when no signal file arrives in time', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'agf-approval-wait-'))
    try {
      const result = await run(['wait', 'task-missing', '--dir', dir, '--timeout-ms', '50', '--interval-ms', '10'])
      expect(result.ok).toBe(false)
      expect(result.code).toBe('APPROVAL_TIMEOUT')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
