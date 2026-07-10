/**
 * exec-cmd.test.ts — safe pipeline + chain subcommand coverage.
 * Mocks runAgf so no real CLI subprocess runs; tests the pipeline logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execCommand } from '../cli/commands/exec-cmd.js'

// Mock runAgf — controls what each pipeline step "returns"
vi.mock('../core/compose/agf-runner.js', () => ({
  runAgf: vi.fn(),
}))
// Mock recordInManifest — verify it's called on success
vi.mock('../core/hooks/session-manifest.js', () => ({
  recordInManifest: vi.fn(),
}))
// Mock spawnSync used for git diff in manifest recording
vi.mock('node:child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:child_process')>()
  return { ...orig, spawnSync: vi.fn().mockReturnValue({ stdout: 'src/foo.ts\nsrc/bar.ts\n' }) }
})
// Mock openStoreOrFail (used only in chain --track)
vi.mock('../cli/open-store.js', () => ({
  openStoreOrFail: vi.fn().mockReturnValue({ getDb: vi.fn(), getProject: vi.fn(), close: vi.fn() }),
}))
// Mock the tool-routing gate — controls whether each exec-safe step resolves
// to its expected command before runAgf is dispatched (REQ-LCR-001).
vi.mock('../core/rag-in/retrieve.js', () => ({
  retrieveCommand: vi.fn(),
}))
vi.mock('../core/rag-in/builtin-corpus.js', () => ({
  buildLiveCorpus: vi.fn().mockReturnValue([]),
}))

import { runAgf } from '../core/compose/agf-runner.js'
import { recordInManifest } from '../core/hooks/session-manifest.js'
import { retrieveCommand } from '../core/rag-in/retrieve.js'

const mockRunAgf = vi.mocked(runAgf)
const mockRecordInManifest = vi.mocked(recordInManifest)
const mockRetrieveCommand = vi.mocked(retrieveCommand)

/** Default: every step resolves to its own expected command with full confidence. */
function stubRoutingResolvesCorrectly() {
  mockRetrieveCommand.mockImplementation((intent: string) => {
    const expectedCommand = intent.includes('brief')
      ? 'agf brief'
      : intent.includes('start')
        ? 'agf start'
        : intent.includes('blast')
          ? 'agf test'
          : intent.includes('definition of done')
            ? 'agf check'
            : 'agf done'
    return {
      decision: 'retrieved',
      query: intent,
      confidence: 1,
      top: {
        command: expectedCommand,
        intent,
        family: 'harness',
        tool: expectedCommand,
        flags_explained: '',
        danger: false,
        source: 'test',
      },
      candidates: [],
      fallback: null,
    }
  })
}

function okEnvelope(data: unknown = {}) {
  return { envelope: { ok: true, data, meta: { command: 'test', ms: 1 } } }
}
function failEnvelope(code: string, error: string) {
  return { envelope: { ok: false, code, error, status: 'fail' } }
}

/** Run the `exec safe <taskId>` subcommand programmatically and capture stdout. */
async function runSafe(
  taskId: string,
  opts: { skipTest?: boolean; retries?: number } = {},
): Promise<{ written: string }> {
  const chunks: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  }

  const cmd = execCommand()
  const args = ['safe', taskId]
  if (opts.skipTest) args.push('--skip-test')
  if (opts.retries !== undefined) args.push('--retries', String(opts.retries))

  try {
    await cmd.parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = origWrite
  }

  return { written: chunks.join('') }
}

describe('exec safe — pipeline logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubRoutingResolvesCorrectly()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('all steps pass → output ok:true with gates listed', async () => {
    // brief → start → blast → check → done — all succeed
    mockRunAgf.mockResolvedValue(okEnvelope())

    const { written } = await runSafe('task-001')
    const json = JSON.parse(written)

    expect(json.ok).toBe(true)
    expect(json.data.taskId).toBe('task-001')
    expect(json.data.passed).toBe(true)
    expect(json.data.gates).toContain('brief')
    expect(json.data.gates).toContain('done')
  })

  it('fail-fast on second step → output ok:false with failedStep', async () => {
    mockRunAgf
      .mockResolvedValueOnce(okEnvelope()) // brief ok
      .mockResolvedValueOnce(failEnvelope('ERR', 'start returned error')) // start fails

    const { written } = await runSafe('task-002')
    const json = JSON.parse(written)

    expect(json.ok).toBe(false)
    expect(json.data.failedStep).toBe('start')
    expect(json.data.taskId).toBe('task-002')
  })

  it('--skip-test omits blast step from the pipeline', async () => {
    mockRunAgf.mockResolvedValue(okEnvelope())

    const { written } = await runSafe('task-003', { skipTest: true })
    const json = JSON.parse(written)

    expect(json.ok).toBe(true)
    expect(json.data.gates).not.toContain('blast')
    expect(json.data.gates).toContain('brief')
    expect(json.data.gates).toContain('done')
  })

  it('retries on transient failure then succeeds', async () => {
    // First call (brief): throws once, succeeds on retry
    mockRunAgf.mockRejectedValueOnce(new Error('transient network error')).mockResolvedValue(okEnvelope())

    const { written } = await runSafe('task-004', { retries: 2 })
    const json = JSON.parse(written)

    expect(json.ok).toBe(true)
    expect(json.data.passed).toBe(true)
  })

  it('records manifest on successful pipeline', async () => {
    mockRunAgf.mockResolvedValue(okEnvelope())

    await runSafe('task-005')

    expect(mockRecordInManifest).toHaveBeenCalledOnce()
    const args = mockRecordInManifest.mock.calls[0]
    expect(args[0]).toContain('task-005')
  })

  it('does NOT record manifest when pipeline fails', async () => {
    mockRunAgf.mockResolvedValueOnce(failEnvelope('ERR', 'brief failed'))

    await runSafe('task-006')

    expect(mockRecordInManifest).not.toHaveBeenCalled()
  })

  it('resolves each step via retrieveCommand before dispatch (REQ-LCR-001)', async () => {
    mockRunAgf.mockResolvedValue(okEnvelope())

    const { written } = await runSafe('task-007')
    const json = JSON.parse(written)

    expect(json.ok).toBe(true)
    // brief, start, blast, check, done — one routing check per gate
    expect(mockRetrieveCommand).toHaveBeenCalledTimes(5)
    expect(mockRunAgf).toHaveBeenCalledTimes(5)
  })

  it('fails fast with TOOL_ROUTING_MISS when a step resolves to the wrong command', async () => {
    mockRunAgf.mockResolvedValue(okEnvelope())
    // "start" resolves to an unrelated command instead of "agf start"
    mockRetrieveCommand.mockImplementation((intent: string) => ({
      decision: 'retrieved',
      query: intent,
      confidence: 1,
      top: {
        command: intent.includes('brief') ? 'agf brief' : 'agf pipeline pipeline next-context-start',
        intent,
        family: 'harness',
        tool: 'agf',
        flags_explained: '',
        danger: false,
        source: 'test',
      },
      candidates: [],
      fallback: null,
    }))

    const { written } = await runSafe('task-008')
    const json = JSON.parse(written)

    expect(json.ok).toBe(false)
    expect(json.code).toBe('TOOL_ROUTING_MISS')
    expect(json.data.failedStep).toBe('start')
    // brief's gate passed and ran; start's gate failed before runAgf('start', ...) dispatched
    expect(mockRunAgf).toHaveBeenCalledTimes(1)
    expect(mockRunAgf).toHaveBeenCalledWith('brief', expect.anything(), expect.anything())
  })
})

describe('execCommand — structure', () => {
  it('returns a Command with name "exec"', () => {
    expect(execCommand().name()).toBe('exec')
  })

  it('has subcommands including safe and chain', () => {
    const names = execCommand().commands.map((c) => c.name())
    expect(names).toContain('safe')
    expect(names).toContain('chain')
  })
})

describe('exec pipe — output envelope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('meta.command stays "exec.pipe"; the invoked sub-command goes in meta.mode', async () => {
    mockRunAgf.mockResolvedValue(okEnvelope({ foo: 'bar' }))

    const chunks: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: unknown) => {
      chunks.push(String(chunk))
      return true
    }
    try {
      await execCommand().parseAsync(['pipe', 'next', '--dir', '.'], { from: 'user' })
    } finally {
      process.stdout.write = origWrite
    }

    const envelope = JSON.parse(chunks.join('').trim())
    expect(envelope.meta.command).toBe('exec.pipe')
    expect(envelope.meta.mode).toBe('next ')
  })
})
