/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prepareTask, finalizeTask } from '../../core/autonomy/task-prep.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import type { TaskRef } from '../../core/autonomy/task-prep.js'

// ── External dependency stubs ────────────────────────────────────────────────

vi.mock('../../core/context/repo-map.js', () => ({
  buildRepoMap: vi.fn().mockReturnValue({
    text: 'src/index.ts\nsrc/utils.ts',
    tokensEstimated: 40,
    fullEstimated: 200,
    included: 2,
    rankSource: 'pagerank',
    forageSavedTokens: 0,
  }),
}))
vi.mock('../../core/context/flow-compact.js', () => ({
  applyFlowToCompact: vi.fn().mockReturnValue(null),
  formatFlowContext: vi.fn().mockReturnValue(''),
}))
vi.mock('../../core/reuse/task-signature.js', () => ({
  computeTaskSignature: vi.fn().mockReturnValue('sig_abc123deadbeef'),
}))
vi.mock('../../core/reuse/resolve-reuse.js', () => ({
  resolveReuse: vi.fn().mockReturnValue({ kind: 'none' }),
}))
vi.mock('../../core/reuse/artifact-cache.js', () => ({
  recordArtifact: vi.fn(),
}))
vi.mock('../../core/store/episodic-outcomes-store.js', () => ({
  insertEpisodicOutcome: vi.fn(),
  buildApproachSummary: vi.fn().mockReturnValue('touched: []'),
}))
vi.mock('../../core/learning/record-task-learning.js', () => ({
  recordTaskLearning: vi.fn(),
}))
vi.mock('../../core/memory/memory-reader.js', () => ({
  rankMemoriesByActivation: vi.fn().mockResolvedValue({ kept: [], droppedTokens: 0 }),
}))
vi.mock('../../core/economy/ncd-dedup.js', () => ({
  dedupeByNCD: vi.fn().mockReturnValue({ droppedIndices: [] }),
}))
vi.mock('../../core/economy/neuro-forage.js', () => ({
  neuroForage: vi.fn().mockReturnValue({ takenIndices: [0], epsilonSwap: null }),
}))
vi.mock('../../core/economy/economy-levers-config.js', () => ({
  resolveEconomyLeversConfig: vi.fn().mockReturnValue({}),
  isLeverEnabled: vi.fn().mockReturnValue(false),
  getLeverParam: vi.fn().mockReturnValue(1),
}))
vi.mock('../../core/economy/pheromone-store.js', () => ({
  depositPheromone: vi.fn(),
  strongestPheromones: vi.fn().mockReturnValue([]),
}))
vi.mock('../../core/economy/economy-lever-ledger.js', () => ({
  recordLeverEvent: vi.fn(),
}))
vi.mock('../../core/context/zipf-calibration.js', () => ({
  getCalibratedCharsPerToken: vi.fn().mockReturnValue(4),
}))
vi.mock('../../core/code/code-store.js', () => ({
  CodeStore: class {
    getAllSymbols = vi.fn().mockReturnValue([])
    getAllRelations = vi.fn().mockReturnValue([])
  },
}))
vi.mock('../../core/utils/id.js', () => ({
  generateId: vi.fn().mockImplementation((prefix: string) => `${prefix}_test`),
}))

// Import mocked functions for assertions.
const { insertEpisodicOutcome } = await import('../../core/store/episodic-outcomes-store.js')
const { recordArtifact } = await import('../../core/reuse/artifact-cache.js')
const { recordTaskLearning } = await import('../../core/learning/record-task-learning.js')
const { buildRepoMap } = await import('../../core/context/repo-map.js')

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeStore(overrides: Partial<SqliteStore> = {}): SqliteStore {
  const mockDb = {} as ReturnType<SqliteStore['getDb']>
  return {
    getProject: vi.fn().mockReturnValue({ id: 'proj_1', name: 'Test Project', createdAt: '2026-01-01' }),
    getDb: vi.fn().mockReturnValue(mockDb),
    getNodeById: vi.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as SqliteStore
}

function makeNode(id = 'node_task1', title = 'Implement feature X'): TaskRef {
  return { id, title }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('prepareTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-apply stable defaults after clearAllMocks resets them.
    vi.mocked(buildRepoMap).mockReturnValue({
      text: 'src/index.ts\nsrc/utils.ts',
      tokensEstimated: 40,
      fullEstimated: 200,
      included: 2,
      rankSource: 'pagerank',
      forageSavedTokens: 0,
    } as ReturnType<typeof buildRepoMap>)
  })

  // AC2: repo-map is budgeted (PageRank-ranked, within token budget)
  it('returns repoMap text when symbols are provided (AC2)', async () => {
    const symbols = [
      { id: 's1', name: 'createUser', kind: 'function', filePath: 'src/user.ts', projectId: 'proj_1', score: 1.0 },
      { id: 's2', name: 'deleteUser', kind: 'function', filePath: 'src/user.ts', projectId: 'proj_1', score: 0.8 },
    ]
    const store = makeStore()
    const node = makeNode()

    const prep = await prepareTask(store, node, {
      repoSymbols: symbols as Parameters<typeof buildRepoMap>[0]['symbols'],
    })

    expect(prep.repoMap).toBeDefined()
    expect(prep.repoMap).toContain('src/index.ts')
    expect(buildRepoMap).toHaveBeenCalledWith(
      expect.objectContaining({ symbols }),
      expect.objectContaining({ tokenBudget: 1000 }),
    )
  })

  it('returns undefined repoMap when no symbols are provided and no code store symbols', async () => {
    const store = makeStore()
    const node = makeNode()

    const prep = await prepareTask(store, node)

    // When CodeStore returns [] symbols, buildRepoMap is not called and repoMap is undefined.
    expect(prep.repoMap).toBeUndefined()
  })

  // Signature is always computed (deterministic from node title + AC + type + tags)
  it('always returns a non-empty signature', async () => {
    const store = makeStore()
    const node = makeNode()

    const prep = await prepareTask(store, node)

    expect(prep.signature).toBe('sig_abc123deadbeef')
  })

  // Memory-inject path skipped when no projectDir
  it('returns empty priorMemories when projectDir is not provided', async () => {
    const store = makeStore()

    const prep = await prepareTask(store, makeNode())

    expect(prep.priorMemories).toEqual([])
  })

  it('returns priorMemories from memory reader when projectDir is provided', async () => {
    const { rankMemoriesByActivation } = await import('../../core/memory/memory-reader.js')
    vi.mocked(rankMemoriesByActivation).mockResolvedValueOnce({
      kept: [{ score: 0.9, snippet: 'Prior lesson: always add tests first', file: 'memory/lesson1.md' }],
      droppedTokens: 50,
    })

    const store = makeStore()
    const prep = await prepareTask(store, makeNode(), { projectDir: '/tmp/project' })

    expect(prep.priorMemories).toHaveLength(1)
    expect(prep.priorMemories[0].snippet).toContain('Prior lesson')
  })

  // Returns expected shape regardless of store state
  it('returns a TaskPreparation with all required fields', async () => {
    const store = makeStore()

    const prep = await prepareTask(store, makeNode())

    expect(prep).toMatchObject({
      signature: expect.any(String),
      reuse: { kind: 'none' },
      priorMemories: expect.any(Array),
      pheromoneTrails: expect.any(Array),
    })
  })

  // ledger receives savings when repo-map compresses below fullEstimated
  it('records repo-map savings in the ledger when fullEstimated > tokensEstimated', async () => {
    const symbols = [{ id: 's1', name: 'fn', kind: 'function', filePath: 'src/a.ts', projectId: 'proj_1', score: 1.0 }]
    const ledgerRecords: Array<{ nodeId: string; lever: string; savedTokens: number }> = []
    const { TokenLedger } = await import('../../core/autonomy/token-ledger.js')
    const ledger = new TokenLedger()
    vi.spyOn(ledger, 'record').mockImplementation((...args) => {
      ledgerRecords.push({
        nodeId: args[0],
        lever: (args[1] as { lever: string }).lever,
        savedTokens: (args[1] as { savedTokens: number }).savedTokens,
      })
    })

    await prepareTask(makeStore(), makeNode(), {
      repoSymbols: symbols as Parameters<typeof buildRepoMap>[0]['symbols'],
      ledger,
    })

    const repoSaving = ledgerRecords.find((r) => r.lever === 'repo_map')
    expect(repoSaving).toBeDefined()
    expect(repoSaving!.savedTokens).toBe(160) // fullEstimated(200) - tokensEstimated(40) = 160
  })
})

describe('finalizeTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records episodic outcome on success', () => {
    const store = makeStore()

    finalizeTask(store, makeNode(), { success: true, signature: 'sig_x' })

    expect(insertEpisodicOutcome).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nodeId: 'node_task1', outcome: 'success' }),
    )
  })

  it('records episodic outcome as failure', () => {
    const store = makeStore()

    finalizeTask(store, makeNode(), { success: false, signature: 'sig_x' })

    expect(insertEpisodicOutcome).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'failure' }),
    )
  })

  it('records artifact cache when success=true and edits are present', () => {
    const store = makeStore()
    const edits = [{ path: 'src/a.ts', oldString: 'old', newString: 'new' }]

    finalizeTask(store, makeNode(), { success: true, signature: 'sig_x', appliedEdits: edits })

    expect(recordArtifact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nodeId: 'node_task1', signature: 'sig_x' }),
    )
  })

  it('does NOT record artifact cache when success=false', () => {
    const store = makeStore()
    const edits = [{ path: 'src/a.ts', oldString: 'old', newString: 'new' }]

    finalizeTask(store, makeNode(), { success: false, signature: 'sig_x', appliedEdits: edits })

    expect(recordArtifact).not.toHaveBeenCalled()
  })

  it('does NOT record artifact when edits are empty', () => {
    const store = makeStore()

    finalizeTask(store, makeNode(), { success: true, signature: 'sig_x', appliedEdits: [] })

    expect(recordArtifact).not.toHaveBeenCalled()
  })

  it('records learning signal on every finalize', () => {
    const store = makeStore()

    finalizeTask(store, makeNode(), { success: true, signature: 'sig_x' })

    expect(recordTaskLearning).toHaveBeenCalledWith(store, expect.objectContaining({ nodeId: 'node_task1' }))
  })

  it('passes acPassed=false to learning when success=false and no acPassed override', () => {
    const store = makeStore()

    finalizeTask(store, makeNode(), { success: false, signature: 'sig_x' })

    expect(recordTaskLearning).toHaveBeenCalledWith(store, expect.objectContaining({ acPassed: false }))
  })

  it('uses acPassed override regardless of success', () => {
    const store = makeStore()

    finalizeTask(store, makeNode(), { success: false, signature: 'sig_x', acPassed: true })

    expect(recordTaskLearning).toHaveBeenCalledWith(store, expect.objectContaining({ acPassed: true }))
  })

  // Best-effort: telemetry errors must not propagate
  it('does not throw when insertEpisodicOutcome fails', () => {
    vi.mocked(insertEpisodicOutcome).mockImplementationOnce(() => {
      throw new Error('DB error')
    })
    const store = makeStore()

    expect(() => finalizeTask(store, makeNode(), { success: true, signature: 'sig_x' })).not.toThrow()
  })

  it('does not throw when recordArtifact fails', () => {
    vi.mocked(recordArtifact).mockImplementationOnce(() => {
      throw new Error('cache full')
    })
    const store = makeStore()

    expect(() =>
      finalizeTask(store, makeNode(), {
        success: true,
        signature: 'sig_x',
        appliedEdits: [{ path: 'a.ts', oldString: '', newString: '// x' }],
      }),
    ).not.toThrow()
  })
})
