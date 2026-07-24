/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Data Integrity Analyzer — validates data table nodes.
 *
 * Checks:
 * - Metadata has columns (array)
 * - If rowsPreview exists, validates basic integrity:
 *   - Probability columns sum to approximately 1.0
 *   - Cost values > 0
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'data-integrity.ts' })

export interface DataIntegrityReport {
  tables: Array<{ nodeId: string; title: string; valid: boolean; issues: string[] }>
  totalTables: number
  validCount: number
  /**
   * Set to `true` when the graph has zero `data_table` nodes — signals the
   * caller that schema validation cannot run until tables are registered.
   * Absent (undefined) when at least one `data_table` node exists.
   */
  registrationRequired?: boolean
  /** Human-readable guidance paired with `registrationRequired`. */
  message?: string
}

interface RowPreview {
  [key: string]: unknown
}

function getColumns(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function getRowsPreview(value: unknown): RowPreview[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is RowPreview => typeof v === 'object' && v !== null)
}

const PROBABILITY_EPSILON = 0.05

/** analyzeDataIntegrity —  */
export function analyzeDataIntegrity(doc: GraphDocument): DataIntegrityReport {
  const tableNodes = doc.nodes.filter((n) => n.type === 'data_table')

  if (tableNodes.length === 0) {
    return {
      tables: [],
      totalTables: 0,
      validCount: 0,
      registrationRequired: true,
      message:
        "0 data_table nodes found — add nodes of type 'data_table' with 'columns' in metadata to enable schema validation",
    }
  }

  const tables: DataIntegrityReport['tables'] = []
  let validCount = 0

  for (const node of tableNodes) {
    const issues: string[] = []
    const columns = getColumns(node.metadata?.columns)

    if (!node.metadata?.columns) {
      issues.push("Missing 'columns' in metadata")
    } else if (columns.length === 0) {
      issues.push("'columns' is empty")
    }

    // Validate rowsPreview if present
    const rows = getRowsPreview(node.metadata?.rowsPreview)
    if (rows.length > 0 && columns.length > 0) {
      // Find probability columns (name contains "probability", "prob", "chance", "weight")
      const probColumns = columns.filter((c) => /prob|chance|weight/i.test(c))
      for (const probCol of probColumns) {
        const values = rows.map((r) => r[probCol]).filter((v): v is number => typeof v === 'number')

        if (values.length > 0) {
          const sum = values.reduce((a, b) => a + b, 0)
          if (Math.abs(sum - 1.0) > PROBABILITY_EPSILON) {
            issues.push(`Probability column '${probCol}' sums to ${sum.toFixed(3)}, expected ~1.0`)
          }
        }
      }

      // Find cost columns (name contains "cost", "price", "value")
      const costColumns = columns.filter((c) => /cost|price|value/i.test(c))
      for (const costCol of costColumns) {
        const values = rows.map((r) => r[costCol]).filter((v): v is number => typeof v === 'number')

        for (const valValue of values) {
          if (valValue <= 0) {
            issues.push(`Cost column '${costCol}' has non-positive value: ${valValue}`)
            break // Report once per column
          }
        }
      }
    }

    const valid = issues.length === 0
    if (valid) validCount++

    tables.push({ nodeId: node.id, title: node.title, valid, issues })
  }

  log.debug('analyzer:data-integrity', {
    totalTables: tableNodes.length,
    validCount,
  })

  return {
    tables,
    totalTables: tableNodes.length,
    validCount,
  }
}
