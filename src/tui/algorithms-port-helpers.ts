/*!
 * Shared helper types for algorithms-port sub-modules.
 * Extracted from algorithms-port.ts (SRP / 800-line limit).
 */

import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

export interface AlgorithmHelpers {
  getNodes(): { nodes: GraphNode[]; edges: GraphEdge[] }
  listResult(title: string, lines: string[]): string
  getTaskIds(): string[]
}
