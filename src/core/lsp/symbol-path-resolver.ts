import type { LspDocumentSymbol } from './lsp-types.js'

export interface SymbolLocation {
  file: string
  startLine: number
  startCharacter: number
  endLine: number
  endCharacter: number
}

export interface FoundSymbol {
  name: string
  kind: string
  location: SymbolLocation
  children?: FoundSymbol[]
}

/**
 * Find a symbol by name path in a file's symbol tree.
 * Path format: "ClassName/methodName" or just "functionName".
 */
export function findSymbolByPath(
  symbols: LspDocumentSymbol[],
  namePath: string,
  filePath: string,
): FoundSymbol | undefined {
  const parts = namePath.split('/').filter(Boolean)
  return findInTree(symbols, parts, 0, filePath)
}

function findInTree(
  symbols: LspDocumentSymbol[],
  pathParts: string[],
  depth: number,
  filePath: string,
): FoundSymbol | undefined {
  const isLastLevel = depth === pathParts.length - 1
  const target = pathParts[depth]

  for (const sym of symbols) {
    // Match current level
    if (sym.name === target || sym.name.includes(target)) {
      if (isLastLevel) {
        return toFoundSymbol(sym, filePath)
      }
      // Descend into children for multi-level paths
      if (sym.children) {
        const found = findInTree(sym.children, pathParts, depth + 1, filePath)
        if (found) return found
      }
    }
  }

  // If this is a single-level search and no direct match at top level,
  // search all descendants recursively
  if (depth === 0 && pathParts.length === 1) {
    for (const sym of symbols) {
      if (sym.children) {
        const found = findInTree(sym.children, pathParts, depth, filePath)
        if (found) return found
      }
    }
  }

  return undefined
}

function toFoundSymbol(sym: LspDocumentSymbol, filePath: string): FoundSymbol {
  return {
    name: sym.name,
    kind: sym.kind,
    location: {
      file: filePath,
      startLine: sym.startLine,
      endLine: sym.endLine,
      startCharacter: 0,
      endCharacter: 0,
    },
    children: sym.children?.map((c) => ({
      name: c.name,
      kind: c.kind,
      location: { file: filePath, startLine: c.startLine, endLine: c.endLine, startCharacter: 0, endCharacter: 0 },
    })),
  }
}

/**
 * Replace the body of a symbol, keeping its signature.
 * Reads file, finds symbol range, replaces body between start+1 and end-1.
 */
export function replaceSymbolBody(content: string, symbol: FoundSymbol, newBody: string): string {
  const lines = content.split('\n')
  const sigLine = symbol.location.startLine
  const endLine = symbol.location.endLine

  // Keep the signature line and closing brace
  const before = lines.slice(0, sigLine + 1).join('\n')
  const after = lines.slice(endLine).join('\n')
  return `${before}\n${newBody}\n${after}`
}

/**
 * Insert code after a symbol's closing brace.
 */
export function insertAfterSymbol(content: string, symbol: FoundSymbol, code: string): string {
  const lines = content.split('\n')
  const insertAt = symbol.location.endLine + 1
  const before = lines.slice(0, insertAt).join('\n')
  const after = lines.slice(insertAt).join('\n')
  return `${before}\n${code}\n${after}`
}

/**
 * Insert code before a symbol's definition.
 */
export function insertBeforeSymbol(content: string, symbol: FoundSymbol, code: string): string {
  const lines = content.split('\n')
  const insertAt = symbol.location.startLine
  const before = lines.slice(0, insertAt).join('\n')
  const after = lines.slice(insertAt).join('\n')
  return `${before}\n${code}\n${after}`
}

/**
 * Delete a symbol entirely (signature, body, and trailing blank lines).
 */
export function safeDeleteSymbol(content: string, symbol: FoundSymbol): string {
  const lines = content.split('\n')
  const startLine = symbol.location.startLine
  const endLine = Math.min(symbol.location.endLine + 1, lines.length - 1)
  const before = lines.slice(0, startLine).join('\n')
  const after = lines.slice(endLine).join('\n')
  return `${before}\n${after}`.trimEnd()
}
