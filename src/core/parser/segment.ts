/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Stage 2: Segmentation.
 * Split normalized text into structural blocks by headings.
 */

export interface Section {
  level: number // heading depth: 1 = #, 2 = ##, 3 = ###
  title: string
  body: string
  startLine: number
  endLine: number
}

/** segment —  */
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'parser/segment.ts' })

export function segment(text: string): Section[] {
  const lines = text.split('\n')
  const sections: Section[] = []
  let current: Section | null = null
  let bodyLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

    if (headingMatch) {
      // Close previous section
      if (current) {
        current.body = bodyLines.join('\n').trim()
        current.endLine = i
        sections.push(current)
      }

      const level = headingMatch[1].length
      const title = headingMatch[2].trim()

      current = {
        level,
        title,
        body: '',
        startLine: i + 1, // 1-indexed
        endLine: i + 1,
      }
      bodyLines = []
    } else {
      bodyLines.push(line)
    }
  }

  // Close last section
  if (current) {
    current.body = bodyLines.join('\n').trim()
    current.endLine = lines.length
    sections.push(current)
  }

  // If no headings found, treat entire text as a single section
  if (sections.length === 0 && text.trim()) {
    sections.push({
      level: 0,
      title: 'Untitled',
      body: text.trim(),
      startLine: 1,
      endLine: lines.length,
    })
  }

  return sections
}

const TABLE_ROW_PATTERN = /^\|.+\|$/
const TABLE_SEP_PATTERN = /^\|\s*[-:]+[-| :]*\|$/

/**
 * Post-process sections to extract embedded markdown tables into separate sections.
 * Each table block (header + separator + data rows) becomes a Section with title "[table]" and level 0.
 */
export function extractTableSections(sections: Section[]): Section[] {
  const resultValue: Section[] = []

  for (const section of sections) {
    const lines = section.body.split('\n')
    const nonTableLines: string[] = []
    const tables: string[][] = []
    let currentTable: string[] = []
    let inTable = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (!inTable) {
        // Detect table start: current line matches row pattern AND next line is separator
        if (TABLE_ROW_PATTERN.test(line) && i + 1 < lines.length && TABLE_SEP_PATTERN.test(lines[i + 1])) {
          inTable = true
          currentTable = [line]
        } else {
          nonTableLines.push(line)
        }
      } else {
        // Inside a table: keep collecting rows that match the pipe pattern
        if (TABLE_ROW_PATTERN.test(line)) {
          currentTable.push(line)
        } else {
          // Table ended
          tables.push(currentTable)
          currentTable = []
          inTable = false
          nonTableLines.push(line)
        }
      }
    }

    // Close any remaining table
    if (inTable && currentTable.length > 0) {
      tables.push(currentTable)
    }

    if (tables.length === 0) {
      resultValue.push(section)
    } else {
      // Push original section with table lines removed
      const cleanBody = nonTableLines.join('\n').trim()
      if (cleanBody || section.title !== '[table]') {
        resultValue.push({
          ...section,
          body: cleanBody,
        })
      }

      // Push each table as a separate section
      for (const tableLines of tables) {
        resultValue.push({
          level: 0,
          title: '[table]',
          body: tableLines.join('\n'),
          startLine: section.startLine,
          endLine: section.endLine,
        })
      }
    }
  }

  return resultValue
}
