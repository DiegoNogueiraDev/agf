/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 MemPalace Contributors (mempalace)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from mempalace (https://github.com/MemPalace/mempalace), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

import { estimateTokens } from '../context/token-estimator.js'

export interface L0IdentityData {
  projectName: string
  identity: string
  coreRules: string[]
  knowledgeAnchors: string[]
}

export interface L0IdentityResult {
  content: string
  tokenCount: number
  truncated: boolean
}

const L0_MAX_TOKENS = 100

export function buildL0Identity(data: L0IdentityData): L0IdentityResult {
  const lines: string[] = [`[L0] ${data.projectName}: ${data.identity}`]

  if (data.coreRules.length > 0) {
    lines.push(`[L0] Rules: ${data.coreRules.join('; ')}`)
  }

  if (data.knowledgeAnchors.length > 0) {
    lines.push(`[L0] Anchors: ${data.knowledgeAnchors.join('; ')}`)
  }

  let content = lines.join('\n')
  let tokens = estimateTokens(content)
  let truncated = false

  if (tokens > L0_MAX_TOKENS) {
    const sections = [
      { text: `[L0] ${data.projectName}: ${data.identity}`, priority: 3 },
      { text: data.coreRules.length > 0 ? `[L0] Rules: ${data.coreRules.join('; ')}` : '', priority: 2 },
      {
        text: data.knowledgeAnchors.length > 0 ? `[L0] Anchors: ${data.knowledgeAnchors.join('; ')}` : '',
        priority: 1,
      },
    ].filter((s) => s.text)

    sections.sort((a, b) => b.priority - a.priority)

    let rebuilt = ''
    for (const section of sections) {
      const candidate = rebuilt ? rebuilt + '\n' + section.text : section.text
      if (estimateTokens(candidate) <= L0_MAX_TOKENS) {
        rebuilt = candidate
      } else if (!rebuilt) {
        const ratio = L0_MAX_TOKENS / estimateTokens(section.text)
        const truncatedText = section.text.slice(0, Math.floor(section.text.length * ratio))
        rebuilt = truncatedText
      }
    }

    content = rebuilt || lines[0]
    tokens = estimateTokens(content)
    truncated = true
  }

  return { content, tokenCount: tokens, truncated }
}
