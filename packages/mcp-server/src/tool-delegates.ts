/**
 * Tool Delegates — thin dispatch from MCP tool calls to store queries.
 *
 * ZERO business logic. Each handler is a pure translation:
 *   MCP args → store query → text output.
 *
 * Lifecycle/DoD/context/flow logic lives in `src/core/**`.
 * The bridge only reads/writes nodes via the store adapter.
 */

import type { GraphStore } from './store.js'

type Args = Record<string, unknown>

export interface AssemblerAdapter {
  assemble(query: string, options?: { tier?: string; phase?: string; compress?: boolean }): string
}

export interface ToolCacheAdapter {
  get(toolName: string, args: unknown): string | undefined
  set(toolName: string, args: unknown, result: string): void
}

export interface CodeIntelAdapter {
  execute(args: Record<string, unknown>): Promise<string>
}

const MUTATING_TOOLS = new Set(['add_node', 'update_status', 'start_task', 'finish_task', 'update_node'])

export async function delegateTool(
  name: string,
  args: Args,
  s: GraphStore,
  assembler?: AssemblerAdapter,
  toolCache?: ToolCacheAdapter,
  codeIntel?: CodeIntelAdapter,
): Promise<string> {
  // Route code_intelligence.* tools
  if (name.startsWith('code_intelligence.')) {
    if (!codeIntel) return `Code intelligence unavailable. Install LSP servers for: ${name}`
    return codeIntel.execute({ mode: name.slice('code_intelligence.'.length), ...args })
  }

  // Check cache for read-only tools
  if (toolCache && !MUTATING_TOOLS.has(name)) {
    const cached = toolCache.get(name, args)
    if (cached !== undefined) return cached
  }

  let result: string
  switch (name) {
    case 'add_node':
      result = handleAddNode(args, s)
      break
    case 'update_status':
      result = handleUpdateStatus(args, s)
      break
    case 'start_task':
      result = handleStartTask(args, s)
      break
    case 'finish_task':
      result = handleFinishTask(args, s)
      break
    case 'analyze':
      result = handleAnalyze(args, s)
      break
    case 'context':
      result = handleContext(args, s, assembler)
      break
    case 'list_nodes':
      result = handleListNodes(args, s)
      break
    case 'get_node':
      result = handleGetNode(args, s)
      break
    case 'update_node':
      result = handleUpdateNode(args, s)
      break
    case 'snapshot':
      result = handleSnapshot(s)
      break
    default:
      result = `Unknown tool: ${name}`
  }

  // Cache result for read-only tools
  if (toolCache && !MUTATING_TOOLS.has(name)) {
    toolCache.set(name, args, result)
  }

  return result
}

// ── Handlers ────────────────────────────────────────────

function handleAddNode(args: Args, s: GraphStore): string {
  const node = s.addNode({
    type: args.type as string,
    title: args.title as string,
    description: args.description as string | undefined,
    priority: args.priority as number | undefined,
    parentId: args.parentId as string | undefined,
    acceptanceCriteria: args.acceptanceCriteria as string[] | undefined,
    tags: args.tags as string[] | undefined,
    xpSize: args.xpSize as string | undefined,
  })
  return `Node created: ${node.id}\nType: ${node.type}\nTitle: ${node.title}\nStatus: ${node.status}`
}

function handleUpdateStatus(args: Args, s: GraphStore): string {
  const updated = s.updateNodeStatus(args.nodeId as string, args.status as string)
  if (!updated) return `Node "${args.nodeId}" not found.`
  return `Status updated: ${updated.id} → ${updated.status}\nTitle: ${updated.title}`
}

function handleStartTask(args: Args, s: GraphStore): string {
  let node
  if (args.nodeId) {
    node = s.getNodeById(args.nodeId as string)
    if (!node) return `Node "${args.nodeId}" not found.`
  } else {
    node = s.findNextTask()
    if (!node) return 'No available tasks in backlog.'
  }

  s.updateNodeStatus(node.id, 'in_progress')
  const children = s.getChildNodes(node.id)
  const ac = node.acceptanceCriteria ?? []

  return [
    `Task started: ${node.id}`,
    `Title: ${node.title}`,
    `Type: ${node.type}`,
    `Priority: ${node.priority}`,
    `XP Size: ${node.xpSize ?? 'not set'}`,
    `Acceptance Criteria (${ac.length}):`,
    ...ac.map((c, i) => `  ${i + 1}. ${c}`),
    `Children: ${children.length} nodes`,
    '',
    'TDD: Write failing test → minimal impl → refactor.',
    `Use 'finish_task' with nodeId="${node.id}" when done.`,
  ].join('\n')
}

function handleFinishTask(args: Args, s: GraphStore): string {
  const node = s.getNodeById(args.nodeId as string)
  if (!node) return `Node "${args.nodeId}" not found.`

  const checks: { name: string; passed: boolean; detail: string }[] = []

  const hasAc = (node.acceptanceCriteria?.length ?? 0) > 0
  checks.push({
    name: 'has_acceptance_criteria',
    passed: hasAc,
    detail: hasAc ? `${node.acceptanceCriteria!.length} AC items` : 'No AC defined',
  })

  const hasDesc = (node.description?.length ?? 0) > 0
  checks.push({ name: 'has_description', passed: hasDesc, detail: hasDesc ? 'Description present' : 'No description' })

  const wasInProgress = node.status === 'in_progress'
  checks.push({
    name: 'status_flow_valid',
    passed: wasInProgress || node.status === 'backlog',
    detail: `Current status: ${node.status}`,
  })

  const testFiles = (args.testFiles as string[] | undefined) ?? []
  const hasTestFiles = testFiles.length > 0
  checks.push({
    name: 'has_test_files',
    passed: hasTestFiles,
    detail: hasTestFiles ? `${testFiles.length} files` : 'No test files provided',
  })

  const passed = checks.filter((c) => c.passed).length
  const ready = checks.every((c) => c.passed || c.name === 'has_test_files')

  if (!ready) {
    return [
      `DoD FAILED for ${node.id} (${node.title})`,
      `Passed: ${passed}/${checks.length}`,
      ...checks.map((c) => `  ${c.passed ? '✓' : '✗'} ${c.name}: ${c.detail}`),
    ].join('\n')
  }

  s.updateNodeStatus(node.id, 'done')

  let epicMsg = ''
  if (node.parentId) {
    const siblings = s.getChildNodes(node.parentId)
    const allDone = siblings.every((sib) => sib.status === 'done' || sib.id === node.id)
    if (allDone) {
      const parent = s.getNodeById(node.parentId)
      epicMsg = `\n\nEpic promotion: All ${siblings.length} children done. Parent "${parent?.title}" (${node.parentId}) ready for promotion.`
    }
  }

  return [
    `Task completed: ${node.id} (${node.title})`,
    `Rationale: ${args.rationale ?? 'N/A'}`,
    `Test files: ${testFiles.join(', ') || 'none'}`,
    `DoD: ${passed}/${checks.length} passed`,
    ...checks.map((c) => `  ${c.passed ? '✓' : '✗'} ${c.name}: ${c.detail}`),
    epicMsg,
  ].join('\n')
}

function handleAnalyze(args: Args, s: GraphStore): string {
  const mode = args.mode as string
  switch (mode) {
    case 'stats': {
      const byType = s.countByType()
      const byStatus = s.countByStatus()
      return [
        'Graph Statistics:',
        '',
        'By type:',
        ...Object.entries(byType).map(([t, c]) => `  ${t}: ${c}`),
        '',
        'By status:',
        ...Object.entries(byStatus).map(([st, c]) => `  ${st}: ${c}`),
      ].join('\n')
    }
    case 'status': {
      if (!args.nodeId) return 'nodeId required for status analysis.'
      const n = s.getNodeById(args.nodeId as string)
      if (!n) return `Node "${args.nodeId}" not found.`
      return [
        `Node: ${n.id}`,
        `Type: ${n.type}`,
        `Title: ${n.title}`,
        `Status: ${n.status}`,
        `Priority: ${n.priority}`,
        `XP Size: ${n.xpSize ?? 'N/A'}`,
        `AC: ${n.acceptanceCriteria?.length ?? 0} items`,
        `Tags: ${n.tags?.join(', ') ?? 'none'}`,
      ].join('\n')
    }
    case 'blockers': {
      const edges = s.getEdges()
      const blocked = edges.filter((e) => e.relationType === 'depends_on')
      if (blocked.length === 0) return 'No dependency edges found.'
      return [`Dependencies (${blocked.length}):`, ...blocked.map((e) => `  ${e.from} → depends_on → ${e.to}`)].join(
        '\n',
      )
    }
    case 'structure': {
      const epics = s.getNodesByType('epic')
      const lines = [`Graph Structure (${epics.length} epics):`]
      for (const epic of epics) {
        const tasks = s.getChildNodes(epic.id)
        const doneCount = tasks.filter((t) => t.status === 'done').length
        lines.push(`  ${epic.title} [${doneCount}/${tasks.length} done]`)
        for (const t of tasks.slice(0, 10)) {
          lines.push(`    ${t.status === 'done' ? '✓' : '○'} ${t.title} (${t.id})`)
        }
        if (tasks.length > 10) lines.push(`    ... +${tasks.length - 10} more tasks`)
      }
      return lines.join('\n')
    }
    case 'full': {
      const stats = handleAnalyze({ mode: 'stats' }, s)
      const structure = handleAnalyze({ mode: 'structure' }, s)
      const blockers = handleAnalyze({ mode: 'blockers' }, s)
      return [stats, '', '---', '', structure, '', '---', '', blockers].join('\n')
    }
    default:
      return `Unknown analysis mode: ${mode}. Available: stats, status, blockers, structure, full`
  }
}

function handleContext(args: Args, s: GraphStore, assembler?: AssemblerAdapter): string {
  const action = args.action as string
  const nodeId = args.nodeId as string | undefined

  // For node context, use assemble adapter when available
  if (action === 'node' && nodeId && assembler) {
    try {
      return assembler.assemble(nodeId, {
        tier: (args.tier as string) ?? 'standard',
        phase: args.phase as string | undefined,
        compress: (args.compress as boolean) ?? true,
      })
    } catch (err) {
      return `Context assembly error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  switch (action) {
    case 'summary': {
      let prefix = ''
      if (assembler) {
        try {
          prefix = assembler.assemble('') + '\n\n---\n\n'
        } catch (err: unknown) {
          console.warn(`[context] assembler failed, falling back: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      if (!prefix) {
        const stats = handleAnalyze({ mode: 'stats' }, s)
        const nextTask = s.findNextTask()
        prefix = [
          stats,
          '',
          nextTask
            ? `Next task: ${nextTask.id} — ${nextTask.title} [${nextTask.type}/${nextTask.status}]`
            : 'No tasks in backlog.',
        ].join('\n')
      }
      return prefix
    }
    case 'node': {
      if (!args.nodeId) return 'nodeId required for node context.'
      return handleAnalyze({ mode: 'status', nodeId: args.nodeId }, s)
    }
    case 'children': {
      if (!args.nodeId) return 'nodeId required for children context.'
      const kids = s.getChildNodes(args.nodeId as string)
      if (kids.length === 0) return `No children for node "${args.nodeId}".`
      return [
        `Children of ${args.nodeId} (${kids.length}):`,
        ...kids.map((c) => `  ${c.id} [${c.type}/${c.status}] ${c.title}`),
      ].join('\n')
    }
    case 'backlog': {
      const tasks = s.getNodesByStatus('backlog')
      if (tasks.length === 0) return 'No tasks in backlog.'
      return [
        `Backlog (${tasks.length} tasks):`,
        ...tasks.map((t) => `  ${t.id} [${t.priority}] ${t.title} (${t.xpSize ?? '?'})`),
      ].join('\n')
    }
    default:
      return `Unknown context action: ${action}. Available: summary, node, children, backlog`
  }
}

function handleListNodes(args: Args, s: GraphStore): string {
  let nodes
  if (args.parentId) {
    nodes = s.getChildNodes(args.parentId as string)
  } else if (args.type && args.status) {
    nodes = s.getNodesByType(args.type as string).filter((n) => n.status === args.status)
  } else if (args.type) {
    nodes = s.getNodesByType(args.type as string)
  } else if (args.status) {
    nodes = s.getNodesByStatus(args.status as string)
  } else {
    nodes = s.getAllNodes()
  }
  if (nodes.length === 0) return 'No nodes found.'
  return [
    `Nodes (${nodes.length}):`,
    ...nodes.map((n: any) => `  ${n.id} [${n.type}/${n.status}] ${n.title} pr:${n.priority}`),
  ].join('\n')
}

function handleGetNode(args: Args, s: GraphStore): string {
  return handleAnalyze({ mode: 'status', nodeId: args.nodeId }, s)
}

function handleUpdateNode(args: Args, s: GraphStore): string {
  const updated = s.updateNode(args.nodeId as string, {
    title: args.title as string | undefined,
    description: args.description as string | undefined,
    priority: args.priority as number | undefined,
    acceptanceCriteria: args.acceptanceCriteria as string[] | undefined,
    tags: args.tags as string[] | undefined,
    xpSize: args.xpSize as string | undefined,
    parentId: args.parentId as string | undefined,
  })
  if (!updated) return `Node "${args.nodeId}" not found.`
  return `Node updated: ${updated.id} — ${updated.title}`
}

function handleSnapshot(s: GraphStore): string {
  return handleAnalyze({ mode: 'full' }, s)
}
