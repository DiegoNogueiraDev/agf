/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Converts parser extraction results into graph nodes and edges.
 */

import type { GraphNode, GraphEdge, NodeType, NodeStatus, XpSize } from '../graph/graph-types.js'
import { GraphNodeSchema } from '../../schemas/node.schema.js'
import type { ExtractionResult } from '../parser/extract.js'
import type { ClassifiedBlock } from '../parser/classify.js'
import { synthesizeAc } from './synthesize-ac.js'
import { isStructuralHeading } from '../parser/classify.js'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'prd-to-graph.ts' })

interface ConversionResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: {
    nodesCreated: number
    edgesCreated: number
    blockedTasks: number
    inferredDeps: number
  }
}

function mapBlockTypeToNodeType(blockType: string): NodeType | null {
  const valid: NodeType[] = [
    'epic',
    'task',
    'subtask',
    'requirement',
    'constraint',
    'milestone',
    'acceptance_criteria',
    'risk',
    'decision',
  ]
  if (valid.includes(blockType as NodeType)) return blockType as NodeType
  return null
}

function defaultPriorityForType(type: NodeType): 1 | 2 | 3 | 4 | 5 {
  switch (type) {
    case 'epic':
      return 2
    case 'requirement':
      return 2
    case 'constraint':
      return 1
    case 'task':
      return 3
    case 'subtask':
      return 3
    case 'risk':
      return 2
    case 'acceptance_criteria':
      return 4
    default:
      return 3
  }
}

// Bug #101: make bold markers optional — consistent with PRIORITY_PATTERN (Bug #100 fix)
const SIZE_PATTERN = /(?:\*\*)?(?:Size|Tamanho)\s*:\s*(?:\*\*)?\s*(XS|S|M|L|XL)\b/i

function extractXpSize(description: string | undefined): XpSize | undefined {
  if (!description) return undefined
  const match = description.match(SIZE_PATTERN)
  if (!match) return undefined
  return match[1].toUpperCase() as XpSize
}

// Bug #100: support both bold markdown (**Priority:**) and plain text (Priority:)
const PRIORITY_PATTERN =
  /(?:\*\*)?(?:Priority|Prioridade)\s*:\s*(?:\*\*)?\s*(high|medium|low|critical|alta|cr[ií]tica|m[eé]dia|baixa|[1-5])\b/i

function extractPriority(description: string | undefined): 1 | 2 | 3 | 4 | 5 | undefined {
  if (!description) return undefined
  const match = description.match(PRIORITY_PATTERN)
  if (!match) return undefined
  const valValue = match[1].toLowerCase()
  if (
    valValue === 'high' ||
    valValue === 'alta' ||
    valValue === 'critical' ||
    valValue === 'crítica' ||
    valValue === 'critica' ||
    valValue === '1'
  )
    return 1
  if (valValue === '2') return 2
  if (valValue === 'medium' || valValue === 'média' || valValue === 'media' || valValue === '3') return 3
  if (valValue === '4') return 4
  if (valValue === 'low' || valValue === 'baixa' || valValue === '5') return 5
  return undefined
}

// Bug #101: make bold markers optional — consistent with PRIORITY_PATTERN (Bug #100 fix)
const TAGS_PATTERN = /(?:\*\*)?(?:Tags?)\s*:\s*(?:\*\*)?\s*(.+)/i

function extractTags(description: string | undefined): string[] | undefined {
  if (!description) return undefined
  const match = description.match(TAGS_PATTERN)
  if (!match) return undefined
  const tags = match[1]
    .split(/,/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return tags.length > 0 ? tags : undefined
}

/**
 * import-prd left every task with priority:3/tags:[] when the PRD had no
 * explicit Priority/Tags markers — silently breaking WSJF ordering and
 * costing a full manual pass of `node update --tags/--priority` per leaf.
 * Fallback (only applied when no explicit marker matched): an imperative
 * title prefix signals MoSCoW urgency directly; anything else still gets
 * 'should'/priority 2 rather than staying blank.
 */
const MUST_TITLE_PREFIX = /^(IMPLEMENT|WIRE):/i
const SHOULD_TITLE_PREFIX = /^(FIX|DOCS):/i

function inferMoscowFallback(title: string): { tags: string[]; priority: 1 | 2 } {
  if (MUST_TITLE_PREFIX.test(title)) return { tags: ['must'], priority: 1 }
  if (SHOULD_TITLE_PREFIX.test(title)) return { tags: ['should'], priority: 2 }
  return { tags: ['should'], priority: 2 }
}

/** A parent epic's description reads as carrying a measurable Key Result. */
const KEY_RESULT_PATTERN = /key\s*result\s*:/i

function createNodeFromBlock(
  block: ClassifiedBlock,
  sourceFile: string,
  parentId: string | null = null,
): GraphNode | null {
  const nodeType = mapBlockTypeToNodeType(block.type)
  if (!nodeType) return null

  const timestamp = now()
  const xpSize = extractXpSize(block.description)
  const node: GraphNode = {
    id: generateId('node'),
    type: nodeType,
    title: block.title,
    description: block.description || undefined,
    status: 'backlog' as NodeStatus,
    priority: defaultPriorityForType(nodeType),
    parentId,
    sourceRef: {
      file: sourceFile,
      startLine: block.startLine,
      endLine: block.endLine,
      confidence: block.confidence,
    },
    metadata: {
      inferred: block.confidence < 0.7,
      origin: 'imported',
      // §EPIC-23.SprintA — flag PRD scaffolding so downstream filters
      // (auto-ready, sprint-health) don't treat it as implementable work.
      ...(isStructuralHeading(block.title) && (nodeType === 'task' || nodeType === 'subtask' || nodeType === 'epic')
        ? { implementable: false }
        : {}),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  if (xpSize) {
    node.xpSize = xpSize
  }
  // Carry hoisted AC bullets onto implementable nodes only (task/subtask).
  // Requirement/epic/etc. keep AC undefined — they are not forced to satisfy
  // the testable-AC Definition of Done.
  if (nodeType === 'task' || nodeType === 'subtask') {
    if (block.acceptanceCriteria && block.acceptanceCriteria.length > 0) {
      node.acceptanceCriteria = block.acceptanceCriteria
    } else {
      // Fallback: synthesize at least one testable AC from the title so no task
      // is born AC-less (which causes DoD #1/#2 failures and ac_coverage_break gaps).
      const synthesized = synthesizeAc(block.title)
      if (synthesized.length > 0) {
        node.acceptanceCriteria = synthesized
      }
    }
  }
  const extractedPriority = extractPriority(block.description)
  const extractedTags = extractTags(block.description)
  if (extractedPriority) {
    node.priority = extractedPriority
  }
  if (extractedTags) {
    node.tags = extractedTags
  }
  if ((nodeType === 'task' || nodeType === 'subtask') && !extractedPriority && !extractedTags) {
    const fallback = inferMoscowFallback(node.title)
    node.tags = fallback.tags
    node.priority = fallback.priority
  }
  return node
}

function createEdge(
  from: string,
  to: string,
  relationType: GraphEdge['relationType'],
  reason?: string,
  inferred: boolean = false,
  confidence: number = 1,
): GraphEdge {
  return {
    id: generateId('edge'),
    from,
    to,
    relationType,
    reason,
    metadata: { inferred, confidence },
    createdAt: now(),
  }
}

/**
 * Detect simple sequential dependencies between tasks.
 * If tasks appear in a numbered list, each depends on the previous.
 */
function inferSequentialDeps(taskNodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = []
  for (let i = 1; i < taskNodes.length; i++) {
    edges.push(
      createEdge(
        taskNodes[i].id,
        taskNodes[i - 1].id,
        'depends_on',
        `Sequential order: "${taskNodes[i].title}" after "${taskNodes[i - 1].title}"`,
        true,
        0.6,
      ),
    )
  }
  return edges
}

/**
 * Detect keyword-based dependencies in descriptions.
 */
function inferKeywordDeps(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = []
  const depKeywords = [
    /antes de/i,
    /após/i,
    /depois de/i,
    /depende de/i,
    /somente depois/i,
    /before/i,
    /after/i,
    /depends on/i,
  ]

  // Build title index for O(n) lookup instead of O(n²)
  const titleIndex = new Map<string, GraphNode>()
  for (const node of nodes) {
    titleIndex.set(node.title.toLowerCase(), node)
  }

  for (const node of nodes) {
    if (!node.description) continue
    const descLower = node.description.toLowerCase()
    if (!depKeywords.some((p) => p.test(descLower))) continue

    // Check if description contains any other node's title
    for (const [titleLower, other] of titleIndex) {
      if (node.id === other.id) continue
      if (titleLower.length < 3) continue // skip very short titles to avoid false matches
      if (descLower.includes(titleLower)) {
        edges.push(createEdge(node.id, other.id, 'depends_on', `Keyword inference from description`, true, 0.5))
      }
    }
  }
  return edges
}

function findNodeByRef(nodes: GraphNode[], ref: string, excludeId: string): GraphNode | undefined {
  const refLower = ref.toLowerCase().trim()
  if (!refLower || refLower === 'none' || refLower === 'n/a' || refLower === 'nenhum') return undefined

  // Strategy 1: Exact title match
  const exact = nodes.find((n) => n.id !== excludeId && n.title.toLowerCase().trim() === refLower)
  if (exact) return exact

  // Strategy 2: Task number pattern — "Task 1.1" matches "Task 1.1: Description"
  const taskNumMatch = refLower.match(/^task\s+([\d.]+)/i)
  if (taskNumMatch) {
    const taskNum = taskNumMatch[1]
    const byNum = nodes.find((n) => {
      if (n.id === excludeId) return false
      const mVar = n.title.match(/^task\s+([\d.]+)/i)
      return mVar ? mVar[1] === taskNum : false
    })
    if (byNum) return byNum
  }

  // Strategy 3: Title starts with reference
  const startsWith = nodes.find((n) => n.id !== excludeId && n.title.toLowerCase().trim().startsWith(refLower))
  if (startsWith) return startsWith

  return undefined
}

/** Convert parsed PRD extraction results into graph nodes and edges. */
export function convertToGraph(extraction: ExtractionResult, sourceFile: string): ConversionResult {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Pass 1: Create nodes from top-level blocks (maps block index → node)
  const blockNodeMap: Map<number, GraphNode> = new Map()
  for (let bi = 0; bi < extraction.blocks.length; bi++) {
    const block = extraction.blocks[bi]
    const node = createNodeFromBlock(block, sourceFile)
    if (!node) {
      log.warn('prd-to-graph:skipped-block', {
        blockIndex: bi,
        blockType: block.type,
        title: block.title?.slice(0, 80),
        reason: 'unmappable block type',
      })
      continue
    }

    // Validate node with Zod schema — skip malformed nodes instead of crashing downstream
    const parsed = GraphNodeSchema.safeParse(node)
    if (!parsed.success) {
      log.warn('prd-to-graph:invalid-node', {
        blockIndex: bi,
        title: block.title?.slice(0, 50),
        errors: parsed.error.issues.map((i) => i.message),
      })
      continue
    }

    nodes.push(node)
    blockNodeMap.set(bi, node)

    // Pass 2: Create child nodes from block items
    const childTaskNodes: GraphNode[] = []
    for (const itemValue of block.items) {
      // AUDIT-004: items that don't map to a node type ("unknown") were silently
      // dropped — unlike top-level blocks, which are logged. Warn and fall back
      // to the parent section's type so the content survives the import.
      let itemType = mapBlockTypeToNodeType(itemValue.type)
      if (!itemType) {
        log.warn('prd-to-graph:item-fallback-to-parent-type', {
          blockIndex: bi,
          itemType: itemValue.type,
          parentType: node.type,
          text: itemValue.text?.slice(0, 80),
        })
        itemType = node.type
      }

      // AC items on a task/subtask go into the ac[] field, not a child node.
      // This eliminates double-representation and phantom acceptance_criteria nodes.
      if (itemType === 'acceptance_criteria' && (node.type === 'task' || node.type === 'subtask')) {
        node.acceptanceCriteria = [...(node.acceptanceCriteria ?? []), itemValue.text]
        continue
      }

      const timestamp = now()
      const childNode: GraphNode = {
        id: generateId('node'),
        type: itemType,
        title: itemValue.text,
        status: 'backlog',
        priority: defaultPriorityForType(itemType),
        parentId: node.id,
        sourceRef: {
          file: sourceFile,
          startLine: itemValue.line,
          endLine: itemValue.line,
          confidence: itemValue.confidence,
        },
        metadata: {
          inferred: itemValue.confidence < 0.7,
          origin: 'imported',
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      if (itemType === 'task' || itemType === 'subtask') {
        const fallback = inferMoscowFallback(childNode.title)
        childNode.tags = fallback.tags
        childNode.priority = fallback.priority
      }

      nodes.push(childNode)

      // Parent-child edges (bidirectional)
      edges.push(createEdge(node.id, childNode.id, 'parent_of', undefined, false, 1))
      edges.push(createEdge(childNode.id, node.id, 'child_of', undefined, false, 1))

      if (itemType === 'task' || itemType === 'subtask') {
        childTaskNodes.push(childNode)
      }
    }

    // Infer sequential dependencies among sibling tasks
    if (childTaskNodes.length > 1) {
      edges.push(...inferSequentialDeps(childTaskNodes))
    }
  }

  // Pass 1.5: Heading hierarchy — assign parent based on heading level
  // Use a stack to track the current parent at each heading depth
  const levelStack: { level: number; node: GraphNode }[] = []

  for (let bi = 0; bi < extraction.blocks.length; bi++) {
    const block = extraction.blocks[bi]
    const node = blockNodeMap.get(bi)
    if (!node) continue

    // AUDIT-006: level-0 blocks (markdown tables, untitled preamble) carry no
    // heading depth. If pushed onto the stack they are never popped by a later
    // level>=1 heading and wrongly become its parent. Skip them entirely.
    if (block.level === 0) continue

    // Pop stack while top has level >= current (siblings or deeper = not parent)
    while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= block.level) {
      levelStack.pop()
    }

    // If stack not empty, the top is the parent — but validate type hierarchy (Bug #008)
    if (levelStack.length > 0) {
      const parent = levelStack[levelStack.length - 1].node
      // Prevent invalid parent-child type relationships:
      // epics should not be children of requirements/tasks/subtasks
      const TYPE_RANK: Record<string, number> = {
        epic: 5,
        milestone: 4,
        requirement: 3,
        constraint: 3,
        decision: 3,
        risk: 3,
        task: 2,
        subtask: 1,
        acceptance_criteria: 0,
      }
      const parentRank = TYPE_RANK[parent.type] ?? 2
      const childRank = TYPE_RANK[node.type] ?? 2
      // E5-T04: heading hierarchy takes priority — override Pass 1 parentId
      // if heading-based parent has valid type rank relationship
      if (parentRank >= childRank) {
        node.parentId = parent.id
        edges.push(createEdge(parent.id, node.id, 'parent_of', 'Heading hierarchy', false, 1))
        edges.push(createEdge(node.id, parent.id, 'child_of', 'Heading hierarchy', false, 1))
      }
    }

    levelStack.push({ level: block.level, node })
  }

  // Pass 1.6: an epic with a measurable Key Result in its description promotes
  // all its direct children to must/priority-1 — a strong planning signal
  // that should win over the generic 'should' fallback (never downgrades an
  // already-'must' child, and never regresses an explicit priority marker).
  for (const node of nodes) {
    if (node.type !== 'task' && node.type !== 'subtask') continue
    const parent = node.parentId ? nodes.find((p) => p.id === node.parentId) : undefined
    if (!parent || parent.type !== 'epic' || !parent.description) continue
    if (!KEY_RESULT_PATTERN.test(parent.description)) continue

    node.tags = [...new Set([...(node.tags ?? []), 'must'])]
    node.priority = 1
  }

  // Pass 2.5: Fold acceptance_criteria nodes into their task/subtask parent's
  // acceptanceCriteria field and remove them from the graph. This eliminates the
  // double-representation where AC appeared both as a node and in ac[].
  const acNodeIds = new Set<string>()
  for (const n of nodes) {
    if (n.type !== 'acceptance_criteria') continue
    const parent = n.parentId ? nodes.find((p) => p.id === n.parentId) : undefined
    if (parent && (parent.type === 'task' || parent.type === 'subtask')) {
      parent.acceptanceCriteria = [...(parent.acceptanceCriteria ?? []), n.title]
      acNodeIds.add(n.id)
    }
  }
  if (acNodeIds.size > 0) {
    // Remove the folded nodes and their edges
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (acNodeIds.has(nodes[i].id)) nodes.splice(i, 1)
    }
    for (let i = edges.length - 1; i >= 0; i--) {
      if (acNodeIds.has(edges[i].from) || acNodeIds.has(edges[i].to)) edges.splice(i, 1)
    }
  }

  // Pass 3: Link constraints to tasks as blockers (scoped to same parent)
  const constraintNodes = nodes.filter((n) => n.type === 'constraint')
  const taskNodes = nodes.filter((n) => n.type === 'task' || n.type === 'subtask')

  for (const constraint of constraintNodes) {
    const scopedTasks = constraint.parentId ? taskNodes.filter((t) => t.parentId === constraint.parentId) : taskNodes

    for (const task of scopedTasks) {
      edges.push(createEdge(constraint.id, task.id, 'related_to', 'Constraint applies to task', true, 0.4))
    }
  }

  // Pass 4: Link acceptance criteria to nearest previous epic/task
  const acNodes = nodes.filter((n) => n.type === 'acceptance_criteria')
  for (const ac of acNodes) {
    if (ac.parentId) continue // already linked via heading hierarchy

    // Find the nearest previous epic or task in block order
    const acBlockIndex = [...blockNodeMap.entries()].find(([, n]) => n.id === ac.id)?.[0]
    if (acBlockIndex !== undefined) {
      let nearestParent: GraphNode | null = null
      for (let i = acBlockIndex - 1; i >= 0; i--) {
        const candidate = blockNodeMap.get(i)
        if (candidate && (candidate.type === 'epic' || candidate.type === 'task')) {
          nearestParent = candidate
          break
        }
      }
      if (nearestParent) {
        edges.push(createEdge(ac.id, nearestParent.id, 'implements', 'Acceptance criteria for epic', true, 0.6))
      }
    }
  }

  // Pass 4.5: Parse explicit **Depends on:** / **Depende de:** references
  const DEPENDS_PATTERN = /\*\*(?:Depends?\s+on|Depende\s+de)\s*:\s*\*\*\s*(.+)/i
  for (const node of nodes) {
    if (!node.description) continue
    const match = node.description.match(DEPENDS_PATTERN)
    if (!match) continue

    const depRefs = match[1]
      .split(/,\s*| e | and /)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const ref of depRefs) {
      const target = findNodeByRef(nodes, ref, node.id)
      if (target) {
        edges.push(createEdge(node.id, target.id, 'depends_on', `Explicit depends_on: "${ref}"`, false, 0.85))
      }
    }
  }

  // Pass 5: Keyword-based dependency inference across all task nodes
  const allTaskNodes = nodes.filter((n) => n.type === 'task')
  edges.push(...inferKeywordDeps(allTaskNodes))

  // Count blocked tasks (tasks that have incoming depends_on edges to non-done nodes)
  const dependentNodeIds = new Set(edges.filter((e) => e.relationType === 'depends_on').map((e) => e.from))
  const blockedTasks = dependentNodeIds.size

  const inferredDeps = edges.filter((e) => e.metadata?.inferred).length

  log.debug('Graph conversion complete', {
    nodesCreated: nodes.length,
    edgesCreated: edges.length,
    blockedTasks,
    inferredDeps,
  })

  return {
    nodes,
    edges,
    stats: {
      nodesCreated: nodes.length,
      edgesCreated: edges.length,
      blockedTasks,
      inferredDeps,
    },
  }
}
