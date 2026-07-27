/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2025 opencode
 * Copyright © 2026 Diego Lima Nogueira de Paula (port and changes)
 *
 * Ported from opencode, MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * task-compact-cmd — Structured compaction template for /compact command.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')

/**
 * 6 compression priorities, ordered by importance (P1 = highest, preserve at all costs).
 */
export const COMPRESSION_PRIORITIES = [
  { priority: 1, rule: 'keep_errors', description: 'Preserve errors, stack traces, and failed assertions verbatim' },
  { priority: 2, rule: 'keep_acceptance_criteria', description: 'Never compress or omit acceptance criteria' },
  { priority: 3, rule: 'merge_similar', description: 'Collapse repeated edits to the same file into a summary' },
  { priority: 4, rule: 'remove_redundant', description: 'Skip default values, unchanged state, stale references' },
  { priority: 5, rule: 'condense_code', description: 'Replace full file contents with signatures + key diffs' },
  { priority: 6, rule: 'omit_resolved', description: 'Skip done tasks, resolved blockers, closed issues' },
] as const

/**
 * 4 operator rules for compact prompts.
 *  1. keep errors
 *  2. merge similar
 *  3. remove redundant
 *  4. condense long code
 */
export const COMPACT_RULES = {
  keep_errors: 'Preserve error messages, stack traces, and failure output exactly as-is — never truncate',
  merge_similar: 'Collapse repeated changes to the same file into a single entry with a merged summary',
  remove_redundant: 'Strip default values, unchanged state, stale references, and duplicate information',
  condense_code: 'Replace full file bodies with function signatures + changed lines only',
} as const

/** Legacy markdown template (kept for backward compatibility). */
export const COMPACT_TEMPLATE = `## Session Compact

### Goal
[What are we trying to achieve?]

### Progress
**Done:** [list completed items]
**In Progress:** [current work]
**Blocked:** [blockers]

### Key Decisions
- [decision 1]
- [decision 2]

### Next Steps
1. [immediate next action]
2. [follow-up action]

### Critical Context
[Information that must survive compaction]

### Relevant Files
- [file path] — [why relevant]`

/** XML compact prompt template, loaded from file at import time. */
let __xmlTemplate: string
try {
  __xmlTemplate = readFileSync(resolve(__dirname, 'compact-prompt.xml'), 'utf-8')
} catch {
  // fallback: embedded template
  __xmlTemplate = `<compact-prompt>
  <current_focus></current_focus>
  <environment></environment>
  <completed_tasks></completed_tasks>
  <active_issues></active_issues>
  <code_state></code_state>
  <important_context></important_context>
</compact-prompt>`
}

export const XML_COMPACT_TEMPLATE: string = __xmlTemplate

/**
 * Builds a compact prompt that asks the LLM to summarize using the legacy markdown template.
 */
export function buildCompactPrompt(context: string): string {
  return `${COMPACT_TEMPLATE}\n\n---\n\nSummarize the following context using the template above. Be concise:\n\n${context}`
}

/**
 * Builds a compact prompt using the structured XML template with compression rules.
 */
export function buildXmlCompactPrompt(context: string): string {
  const rules = COMPRESSION_PRIORITIES.map((p) => `${p.priority}. ${p.rule}: ${p.description}`).join('\n')
  return `${XML_COMPACT_TEMPLATE}\n\n---\n
Compression priorities (ordered by importance — P1 is highest, must be preserved):
${rules}

Operator rules:
- keep_errors: ${COMPACT_RULES.keep_errors}
- merge_similar: ${COMPACT_RULES.merge_similar}
- remove_redundant: ${COMPACT_RULES.remove_redundant}
- condense_code: ${COMPACT_RULES.condense_code}

Summarize the following context using the XML template above. Be concise and follow the compression priorities:\n\n${context}`
}

/**
 * XML-escape a string. Mirrors the pattern in src/core/utils/git-context.ts.
 */
export function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Builds a structured XML summary from task fields without an LLM call.
 * Suitable for deterministic context assembly.
 */
export interface XmlCompactFields {
  currentFocus?: { taskId: string; title: string; status: string }
  environment?: Record<string, string>
  completedTasks?: { id: string; title: string; result?: string }[]
  activeIssues?: { severity: string; description: string }[]
  codeState?: { path: string; summary: string; changes?: string }[]
  importantContext?: string[]
}

export function buildXmlCompactOutput(fields: XmlCompactFields): string {
  const lines: string[] = ['<compact-prompt>']

  if (fields.currentFocus) {
    const { taskId, title, status } = fields.currentFocus
    lines.push(`  <current_focus>${escXml(title)} (${escXml(taskId)}) [${escXml(status)}]</current_focus>`)
  }

  if (fields.environment) {
    lines.push('  <environment>')
    for (const [k, v] of Object.entries(fields.environment)) {
      lines.push(`    <var key="${escXml(k)}">${escXml(v)}</var>`)
    }
    lines.push('  </environment>')
  }

  if (fields.completedTasks && fields.completedTasks.length > 0) {
    lines.push('  <completed_tasks>')
    for (const task of fields.completedTasks) {
      const attrs = task.result
        ? ` id="${escXml(task.id)}" result="${escXml(task.result)}"`
        : ` id="${escXml(task.id)}"`
      lines.push(`    <task${attrs}>${escXml(task.title)}</task>`)
    }
    lines.push('  </completed_tasks>')
  }

  if (fields.activeIssues && fields.activeIssues.length > 0) {
    lines.push('  <active_issues>')
    for (const issue of fields.activeIssues) {
      lines.push(`    <issue severity="${escXml(issue.severity)}">${escXml(issue.description)}</issue>`)
    }
    lines.push('  </active_issues>')
  }

  if (fields.codeState && fields.codeState.length > 0) {
    lines.push('  <code_state>')
    for (const file of fields.codeState) {
      lines.push(`    <file path="${escXml(file.path)}">`)
      lines.push(`      <summary>${escXml(file.summary)}</summary>`)
      if (file.changes) lines.push(`      <changes>${escXml(file.changes)}</changes>`)
      lines.push('    </file>')
    }
    lines.push('  </code_state>')
  }

  if (fields.importantContext && fields.importantContext.length > 0) {
    lines.push('  <important_context>')
    for (const ctx of fields.importantContext) {
      lines.push(`    <item>${escXml(ctx)}</item>`)
    }
    lines.push('  </important_context>')
  }

  lines.push('</compact-prompt>')
  return lines.join('\n')
}
