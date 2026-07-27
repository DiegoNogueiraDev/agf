/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Stage 4: Entity extraction.
 * Combine normalize → segment → classify to produce structured extraction results.
 */

import { normalize } from './normalize.js'
import { segment } from './segment.js'
import { extractTableSections } from './segment.js'
import { classifySection, classifyText, classifyTableRows } from './classify.js'
import type { ClassifiedBlock, ClassifiedItem, BlockType } from './classify.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'extract.ts' })

export interface ExtractionResult {
  blocks: ClassifiedBlock[]
  summary: {
    totalSections: number
    epics: number
    tasks: number
    subtasks: number
    requirements: number
    constraints: number
    acceptanceCriteria: number
    risks: number
    unknown: number
  }
}

function countByType(blocks: ClassifiedBlock[], items: ClassifiedItem[], type: BlockType): number {
  const blockCount = blocks.filter((b) => b.type === type).length
  const itemCount = items.filter((i) => i.type === type).length
  return blockCount + itemCount
}

/** Section-title regex for an Acceptance Criteria block ('AC', 'Critérios de Aceite', 'Given-When-Then'). */
const AC_SECTION_TITLE =
  /^\s*(acceptance\s+criteria|crit[eé]rios?\s+de\s+aceite|ac|given[\s-]*when[\s-]*then)\s*:?\s*$/i

/** Strip a leading checkbox marker and surrounding whitespace from a bullet. */
function cleanBullet(text: string): string {
  return text.replace(/^\[[ x]\]\s*/i, '').trim()
}

/** True when a block is an Acceptance Criteria section (by classified type or by its title). */
function isAcceptanceSection(block: ClassifiedBlock): boolean {
  return block.type === 'acceptance_criteria' || AC_SECTION_TITLE.test(block.title.trim())
}

/** Append AC bullets to a task/epic block's acceptanceCriteria, creating the array lazily. */
function appendAcceptanceCriteria(owner: ClassifiedBlock, bullets: string[]): void {
  const fresh = bullets.map(cleanBullet).filter(Boolean)
  if (fresh.length === 0) return
  owner.acceptanceCriteria = [...(owner.acceptanceCriteria ?? []), ...fresh]
}

/**
 * Fold AC bullets into their owning task/epic block. An AC section following a task
 * (or an inline AC item already marked inside the task body) is hoisted into the
 * task's `acceptanceCriteria[]` instead of being left as an ownerless node. AC
 * sections before any task are ignored (no owner). Mutates blocks in place.
 */
function foldAcceptanceCriteria(blocks: ClassifiedBlock[]): void {
  let owner: ClassifiedBlock | null = null
  for (const block of blocks) {
    // An AC section is checked before owner assignment, since a bare "AC" heading
    // may have been typed as a task by the level-based fallback.
    if (owner && isAcceptanceSection(block)) {
      appendAcceptanceCriteria(
        owner,
        block.items.map((i) => i.text),
      )
      continue
    }
    if (block.type === 'task' || block.type === 'epic') {
      owner = block
      const inlineAc = block.items.filter((i) => i.type === 'acceptance_criteria').map((i) => i.text)
      appendAcceptanceCriteria(block, inlineAc)
    }
  }
}

/** Parse raw PRD text into classified entities (epics, tasks, risks, AC, etc.). */
export function extractEntities(rawText: string): ExtractionResult {
  log.info(`Extracting entities from ${rawText.length} chars`)
  const normalized = normalize(rawText)
  const rawSections = segment(normalized)
  const sections = extractTableSections(rawSections)
  log.info(
    `Segmented into ${sections.length} sections (${rawSections.length} raw + ${sections.length - rawSections.length} tables)`,
  )

  const blocks: ClassifiedBlock[] = sections.map((sec) => {
    // Classify table sections using table-specific heuristics
    if (sec.title === '[table]') {
      const tableClassification = classifyTableRows(sec.body)
      return {
        type: tableClassification.type,
        title: sec.title,
        description: sec.body,
        items: [],
        startLine: sec.startLine,
        endLine: sec.endLine,
        confidence: tableClassification.confidence,
        level: sec.level,
      }
    }
    return classifySection(sec.title, sec.body, sec.level, sec.startLine, sec.endLine)
  })

  // Detect items following bold AC labels (e.g., **Critérios de aceite:**)
  const acLabelPattern = /\*\*(?:crit[eé]rios?\s+de\s+aceite|acceptance\s+criteria|definition\s+of\s+done)\s*:?\s*\*\*/i
  for (const block of blocks) {
    if (block.type === 'task' || block.type === 'epic') {
      const bodyLines = block.description.split('\n')
      let inAcSection = false
      for (const line of bodyLines) {
        if (acLabelPattern.test(line)) {
          inAcSection = true
          continue
        }
        // Exit AC section on next bold label or heading
        if (inAcSection && /^\*\*[^*]+\*\*/.test(line) && !acLabelPattern.test(line)) {
          inAcSection = false
        }
        if (inAcSection) {
          const bulletMatch = line.match(/^\s*[-*]\s+(?:\[[ x]\]\s)?(.+)$/i)
          if (bulletMatch) {
            const bulletText = bulletMatch[1].trim()
            const matchingItem = block.items.find((item) => {
              const normalized = item.text.replace(/^\[[ x]\]\s*/i, '').trim()
              return normalized === bulletText || item.text === bulletText
            })
            if (matchingItem) {
              matchingItem.type = 'acceptance_criteria'
              matchingItem.confidence = 0.85
            }
          }
        }
      }
    }
  }

  // Promote items inside task-sections to subtask if they're generic or tasks
  for (const block of blocks) {
    if (block.type === 'task' || block.type === 'epic') {
      for (const itemValue of block.items) {
        if (itemValue.type === 'acceptance_criteria' || itemValue.type === 'constraint') {
          continue // Already classified with higher confidence — don't demote
        }
        if (itemValue.type === 'unknown' || itemValue.type === 'task') {
          // Items inside a task/epic section are subtasks
          if (block.type === 'task') {
            itemValue.type = 'subtask'
            itemValue.confidence = Math.max(itemValue.confidence, 0.6)
          }
        }
      }
    }
  }

  // Also classify numbered items inside sections that look like task lists
  // (e.g., "Entregas" sections with numbered action items)
  for (const block of blocks) {
    if (block.type === 'unknown') {
      for (const itemValue of block.items) {
        if (itemValue.type === 'unknown') {
          const reclassified = classifyText(itemValue.text)
          if (reclassified.type !== 'unknown') {
            itemValue.type = reclassified.type
            itemValue.confidence = reclassified.confidence
          }
        }
      }
    }
  }

  // Hoist AC bullets into their owning task/epic (no ownerless acceptance_criteria nodes).
  foldAcceptanceCriteria(blocks)

  const allItems = blocks.flatMap((b) => b.items)

  log.info(`Extraction complete: ${blocks.length} blocks, ${allItems.length} items`)

  return {
    blocks,
    summary: {
      totalSections: blocks.length,
      epics: countByType(blocks, allItems, 'epic'),
      tasks: countByType(blocks, allItems, 'task'),
      subtasks: countByType(blocks, allItems, 'subtask'),
      requirements: countByType(blocks, allItems, 'requirement'),
      constraints: countByType(blocks, allItems, 'constraint'),
      acceptanceCriteria: countByType(blocks, allItems, 'acceptance_criteria'),
      risks: countByType(blocks, allItems, 'risk'),
      unknown: countByType(blocks, allItems, 'unknown'),
    },
  }
}
