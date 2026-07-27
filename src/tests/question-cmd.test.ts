import { describe, it, expect, vi } from 'vitest'
import { questionCommand } from '../cli/commands/question-cmd.js'

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await questionCommand().parseAsync(args, { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('questionCommand (node_wire_4b45dc56ab2a — human-gate wire)', () => {
  it('ask returns a pending question and includes it in the full list', async () => {
    const result = await run(['ask', 'Deploy to prod?'])
    expect(result.ok).toBe(true)
    const data = result.data as { question: { text: string; status: string }; all: unknown[] }
    expect(data.question.text).toBe('Deploy to prod?')
    expect(data.question.status).toBe('pending')
    expect(data.all).toHaveLength(1)
  })

  it('ask --reply answers the question in the same call', async () => {
    const result = await run(['ask', 'Proceed?', '--reply', 'yes'])
    expect(result.ok).toBe(true)
    const data = result.data as { question: { status: string; answer: string } }
    expect(data.question.status).toBe('answered')
    expect(data.question.answer).toBe('yes')
  })

  it('ask --reject rejects the question with a reason', async () => {
    const result = await run(['ask', 'Delete prod db?', '--reject', 'unsafe'])
    expect(result.ok).toBe(true)
    const data = result.data as { question: { status: string; reason: string } }
    expect(data.question.status).toBe('rejected')
    expect(data.question.reason).toBe('unsafe')
  })
})
