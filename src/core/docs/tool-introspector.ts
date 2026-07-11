/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tool Introspector — static analysis of MCP tool registrations.
 * Parses source files to extract tool names, descriptions, and categories
 * without requiring runtime instantiation.
 */

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export interface ToolInfo {
  name: string
  description: string
  category: string
  deprecated: boolean
  sourceFile: string
}

// Regex to match server.tool("name", "description" pattern across 1-2 lines
const TOOL_REGEX = /server\.tool\(\s*\n?\s*"([^"]+)",\s*\n?\s*"([^"]+)"/g

// Category mappings inferred from index.ts comment blocks
const FILE_CATEGORY_MAP: Record<string, string> = {
  // Siebel CRM (consolidated)
  siebel: 'Siebel CRM',
  // Translation (consolidated)
  translate: 'Translation',
  // Knowledge (consolidated)
  knowledge: 'Knowledge',
  // DaVinci (consolidated)
  davinci: 'Translation',
  // Consolidated core
  node: 'Core',
  validate: 'Core',
  // LSP Code Intelligence
  'code-intelligence': 'Code Intelligence',
  // Deprecated
  'add-node': 'Deprecated',
  'update-node': 'Deprecated',
  'delete-node': 'Deprecated',
  'validate-task': 'Deprecated',
  'validate-ac': 'Deprecated',
  'list-skills': 'Deprecated',
}

function getCategoryForFile(fileName: string): string {
  const baseName = fileName.replace(/\.ts$/, '')
  return FILE_CATEGORY_MAP[baseName] ?? 'Core'
}

function isDeprecatedFile(fileName: string): boolean {
  const baseName = fileName.replace(/\.ts$/, '')
  return FILE_CATEGORY_MAP[baseName] === 'Deprecated'
}

/**
 * Introspect all MCP tools by parsing source files in the tools directory.
 */
export function introspectTools(toolsDir: string): ToolInfo[] {
  const files = readdirSync(toolsDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts')

  const tools: ToolInfo[] = []

  for (const file of files) {
    const filePath = path.join(toolsDir, file)
    const content = readFileSync(filePath, 'utf-8')
    const category = getCategoryForFile(file)
    const deprecated = isDeprecatedFile(file)

    // Reset regex lastIndex for each file
    TOOL_REGEX.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = TOOL_REGEX.exec(content)) !== null) {
      tools.push({
        name: match[1],
        description: match[2],
        category,
        deprecated,
        sourceFile: file,
      })
    }
  }

  // Sort: non-deprecated first, then alphabetically by name
  tools.sort((a, b) => {
    if (a.deprecated !== b.deprecated) return a.deprecated ? 1 : -1
    return a.name.localeCompare(b.name)
  })

  return tools
}
