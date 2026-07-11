/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode, RelationType } from '../graph/graph-types.js'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'template-engine.ts' })

export interface TaskTemplate {
  name: string
  description?: string
  nodeDefinitions: Array<{
    type: 'task' | 'subtask'
    titleTemplate: string
    description?: string
    xpSize?: string
    acceptanceCriteria?: string[]
    tags?: string[]
  }>
  edgeDefinitions?: Array<{
    fromIndex: number
    toIndex: number
    relationType: string
  }>
}

export interface TemplateInstantiationResult {
  nodesCreated: string[]
  edgesCreated: string[]
  errors: string[]
}

/**
 * Instantiate a template: create nodes and edges with variable substitution.
 */
export function instantiateTemplate(
  store: SqliteStore,
  template: TaskTemplate,
  variables: Record<string, string>,
  parentId?: string,
): TemplateInstantiationResult {
  if (!template || !template.nodeDefinitions || template.nodeDefinitions.length === 0) {
    throw new McpGraphError('Template must have at least one node definition')
  }
  const nodesCreated: string[] = []
  const edgesCreated: string[] = []
  const errors: string[] = []
  const timestamp = now()
  const nodeIdMap: string[] = []

  for (let i = 0; i < template.nodeDefinitions.length; i++) {
    const def = template.nodeDefinitions[i]
    const title = substituteVariables(def.titleTemplate, variables)
    const nodeId = generateId('node')

    const node: GraphNode = {
      id: nodeId,
      type: def.type as GraphNode['type'],
      title,
      description: def.description ? substituteVariables(def.description, variables) : undefined,
      status: 'backlog',
      priority: 3,
      xpSize: def.xpSize as GraphNode['xpSize'],
      tags: def.tags,
      acceptanceCriteria: def.acceptanceCriteria?.map((ac) => substituteVariables(ac, variables)),
      parentId: parentId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    try {
      store.insertNode(node)
      nodesCreated.push(nodeId)
      nodeIdMap.push(nodeId)

      if (parentId) {
        const parentEdgeId = generateId('edge')
        store.insertEdge({
          id: parentEdgeId,
          from: parentId,
          to: nodeId,
          relationType: 'parent_of' as RelationType,
          createdAt: timestamp,
        })
        store.insertEdge({
          id: generateId('edge'),
          from: nodeId,
          to: parentId,
          relationType: 'child_of' as RelationType,
          createdAt: timestamp,
        })
        edgesCreated.push(parentEdgeId)
      }
    } catch (err) {
      errors.push(`Node ${i}: ${String(err)}`)
      nodeIdMap.push('')
    }
  }

  if (template.edgeDefinitions) {
    for (const edgeDef of template.edgeDefinitions) {
      const fromId = nodeIdMap[edgeDef.fromIndex]
      const toId = nodeIdMap[edgeDef.toIndex]
      if (!fromId || !toId) continue

      const edgeId = generateId('edge')
      try {
        store.insertEdge({
          id: edgeId,
          from: fromId,
          to: toId,
          relationType: edgeDef.relationType as RelationType,
          createdAt: timestamp,
        })
        edgesCreated.push(edgeId)
      } catch (err) {
        errors.push(`Edge ${edgeDef.fromIndex}→${edgeDef.toIndex}: ${String(err)}`)
      }
    }
  }

  log.info('template-engine:instantiate', {
    template: template.name,
    nodes: nodesCreated.length,
    edges: edgesCreated.length,
  })

  return { nodesCreated, edgesCreated, errors }
}

function substituteVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`)
}

/**
 * List all templates stored in the graph (milestone nodes with metadata.templateDefinition).
 */
export function listTemplates(store: SqliteStore): Array<{ nodeId: string; name: string; description?: string }> {
  const doc = store.toGraphDocument()
  return doc.nodes
    .filter((n) => n.type === 'milestone' && (n.metadata as Record<string, unknown>)?.templateDefinition)
    .map((n) => ({
      nodeId: n.id,
      name: n.title,
      description: n.description,
    }))
}
