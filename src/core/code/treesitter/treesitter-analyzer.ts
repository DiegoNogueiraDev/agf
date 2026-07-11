/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * TreeSitterAnalyzer — Multi-language code analyzer using web-tree-sitter.
 * Implements CodeAnalyzer interface. Extracts symbols, relations,
 * docstrings, visibility, and source snippets from any supported language.
 *
 * Uses LANGUAGE_REFERENCES for deterministic, rule-based extraction.
 * AI is never used here — pure AST parsing.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from '../../utils/logger.js'
import type { AnalyzedFile, CodeAnalyzer, CodeSymbol, CodeRelation } from '../code-types.js'
import { TreeSitterManager, resetTreeSitterLoader } from './treesitter-manager.js'
import { LANGUAGE_REFERENCES, SUPPORTED_LANGUAGES } from './reference-content.js'

export { resetTreeSitterLoader }

type PartialSymbol = Omit<CodeSymbol, 'id' | 'projectId' | 'indexedAt'>
type PartialRelation = Omit<CodeRelation, 'id' | 'projectId' | 'indexedAt'>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SyntaxNode = any

// ── Extension → language mapping ─────────────────────────

function buildExtensionMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const ref of Object.values(LANGUAGE_REFERENCES)) {
    for (const ext of ref.extensions) {
      map.set(ext, ref.languageId)
    }
  }
  return map
}

const EXTENSION_MAP = buildExtensionMap()

// ── Symbol extraction helpers ────────────────────────────

function getNodeName(node: SyntaxNode): string | null {
  // Try common field names for the symbol name
  const nameNode = node.childForFieldName?.('name')
  if (nameNode) return nameNode.text
  return null
}

function getSourceSnippet(node: SyntaxNode, maxLines: number = 20): string {
  const text: string = node.text
  const lines = text.split('\n')
  return lines.slice(0, maxLines).join('\n')
}

function getPrecedingComment(node: SyntaxNode, languageId: string): string | null {
  const ref = LANGUAGE_REFERENCES[languageId]
  if (!ref) return null

  let sibling = node.previousNamedSibling
  const commentLines: string[] = []

  while (sibling) {
    const type: string = sibling.type
    if (type === 'comment' || type === 'line_comment' || type === 'block_comment') {
      const text: string = sibling.text
      if (ref.docstringPattern.commentRegex.test(text)) {
        commentLines.unshift(text)
        sibling = sibling.previousNamedSibling
        continue
      }
    }
    break
  }

  if (commentLines.length === 0) return null

  // Clean comment markers
  return commentLines
    .map((line) => line.replace(/^\/\/\/?\s?|^\/\*\*?\s?|\*\/\s?$|^\s*\*\s?|^#\s?|^---?\s?/gm, '').trim())
    .filter(Boolean)
    .join('\n')
}

function getPythonDocstring(node: SyntaxNode): string | null {
  // Python docstrings: first expression_statement > string in body block
  const body = node.childForFieldName?.('body')
  if (!body) return null

  const firstChild = body.firstNamedChild
  if (!firstChild) return null

  if (firstChild.type === 'expression_statement') {
    const stringNode = firstChild.firstNamedChild
    if (stringNode && stringNode.type === 'string') {
      const text: string = stringNode.text
      // Strip triple quotes
      return text.replace(/^["']{3}\s*|["']{3}\s*$/g, '').trim()
    }
  }
  return null
}

function detectVisibility(name: string, node: SyntaxNode, languageId: string): string {
  const ref = LANGUAGE_REFERENCES[languageId]
  if (!ref) return 'public'

  switch (ref.visibilityRules.exportDetection) {
    case 'underscore_prefix':
      if (name.startsWith('__') && !name.endsWith('__')) return 'private'
      if (name.startsWith('_')) return 'private'
      return 'public'

    case 'uppercase_first':
      return /^[A-Z]/.test(name) ? 'public' : 'package'

    case 'pub_keyword': {
      // Check for visibility_modifier child
      const visMod = node.children?.find((c: SyntaxNode) => c.type === 'visibility_modifier')
      if (visMod) {
        const text: string = visMod.text
        if (text === 'pub') return 'public'
        if (text.includes('crate')) return 'internal'
        if (text.includes('super')) return 'protected'
      }
      return 'private'
    }

    case 'modifier_keyword': {
      // Check for modifiers node or direct visibility_modifier
      const mods = node.children?.find(
        (c: SyntaxNode) => c.type === 'modifiers' || c.type === 'modifier' || c.type === 'visibility_modifier',
      )
      if (mods) {
        const text: string = mods.text
        if (text.includes('public')) return 'public'
        if (text.includes('private')) return 'private'
        if (text.includes('protected')) return 'protected'
        if (text.includes('internal')) return 'internal'
      }
      return ref.visibilityRules.defaultVisibility
    }

    case 'access_specifier':
    case 'static_keyword':
    case 'return_table':
    case 'visibility_section':
      return ref.visibilityRules.defaultVisibility

    default:
      return 'public'
  }
}

function detectExported(name: string, languageId: string, visibility: string): boolean {
  const ref = LANGUAGE_REFERENCES[languageId]
  if (!ref) return true

  switch (ref.visibilityRules.exportDetection) {
    case 'uppercase_first':
      return /^[A-Z]/.test(name)
    case 'underscore_prefix':
      return !name.startsWith('_')
    case 'pub_keyword':
      return visibility === 'public'
    case 'modifier_keyword':
      return visibility === 'public'
    default:
      return true
  }
}

// ── Main extraction ──────────────────────────────────────

interface ExtractionContext {
  languageId: string
  file: string
  symbols: PartialSymbol[]
  relations: PartialRelation[]
  content: string
  parentName: string | null
}

function extractSymbolsFromNode(node: SyntaxNode, ctx: ExtractionContext): void {
  const type: string = node.type
  const ref = LANGUAGE_REFERENCES[ctx.languageId]

  // ── Symbol extraction by node type ─────────────────
  let symbolKind: string | null = null

  // Map node types to symbol kinds using reference
  if (ref) {
    for (const [kind, nodeType] of Object.entries(ref.symbolNodeTypes)) {
      if (type === nodeType) {
        symbolKind = kind
        break
      }
    }
  }

  // Special handling for type_spec in Go (wraps struct_type, interface_type)
  if (ctx.languageId === 'go' && type === 'type_spec') {
    const typeChild = node.childForFieldName?.('type')
    if (typeChild) {
      if (typeChild.type === 'struct_type') symbolKind = 'struct'
      else if (typeChild.type === 'interface_type') symbolKind = 'interface'
      else symbolKind = 'type_alias'
    }
  }

  // Go: type_declaration wraps type_spec
  if (ctx.languageId === 'go' && type === 'type_declaration') {
    for (const child of node.namedChildren ?? []) {
      extractSymbolsFromNode(child, ctx)
    }
    return
  }

  // Python decorated_definition — extract the inner definition
  if (ctx.languageId === 'python' && type === 'decorated_definition') {
    const defNode = node.childForFieldName?.('definition')
    if (defNode) {
      extractSymbolsFromNode(defNode, ctx)
    }
    return
  }

  if (symbolKind) {
    const name = getNodeName(node)
    if (name) {
      const visibility = detectVisibility(name, node, ctx.languageId)
      const exported = detectExported(name, ctx.languageId, visibility)

      // Docstring extraction
      let docstring: string | null = null
      if (ctx.languageId === 'python') {
        docstring = getPythonDocstring(node)
      }
      if (!docstring) {
        docstring = getPrecedingComment(node, ctx.languageId)
      }

      const startLine = (node.startPosition?.row ?? 0) + 1
      const endLine = (node.endPosition?.row ?? 0) + 1

      // Determine if it's a method (function inside class)
      let resolvedKind = symbolKind
      if (symbolKind === 'function' && ctx.parentName) {
        resolvedKind = 'method'
      }

      // Per-language deep enrichment (V11 multi-lang code-graph).
      // Generic walker emits the cross-language baseline; language-specific
      // helpers add signal that doesn't survive a generic AST walk.
      let metadata: Record<string, unknown> | undefined
      if (ctx.languageId === 'python') {
        const py = enrichPythonSymbol(node as unknown as PySyntaxNodeLike, name)
        // Only attach metadata when there's something interesting — keeps
        // generic Python output clean (no metadata for plain functions
        // with no decorators / async / dunder / bases).
        if (py.decorators.length > 0 || py.isAsync || py.isDunder || py.baseClasses.length > 0) {
          metadata = { python: py }
        }
      } else if (ctx.languageId === 'go') {
        const go = enrichGoSymbol(node as unknown as GoSyntaxNodeLike)
        if (hasGoEnrichmentSignal(go)) {
          metadata = { go }
        }
      } else if (ctx.languageId === 'rust') {
        const rs = enrichRustSymbol(node as unknown as RsSyntaxNodeLike)
        if (hasRustEnrichmentSignal(rs)) {
          metadata = { rust: rs }
        }
      } else if (ctx.languageId === 'java') {
        const ja = enrichJavaSymbol(node as unknown as JavaSyntaxNodeLike)
        if (hasJavaEnrichmentSignal(ja)) {
          metadata = { java: ja }
        }
      } else if (ctx.languageId === 'kotlin') {
        const kt = enrichKotlinSymbol(node as unknown as KtSyntaxNodeLike)
        if (hasKotlinEnrichmentSignal(kt)) {
          metadata = { kotlin: kt }
        }
      } else if (ctx.languageId === 'csharp') {
        const cs = enrichCsharpSymbol(node as unknown as CsSyntaxNodeLike)
        if (hasCsharpEnrichmentSignal(cs)) {
          metadata = { csharp: cs }
        }
      }

      ctx.symbols.push({
        name,
        kind: resolvedKind as PartialSymbol['kind'],
        file: ctx.file,
        startLine,
        endLine,
        exported,
        language: ctx.languageId,
        docstring: docstring ?? undefined,
        sourceSnippet: getSourceSnippet(node),
        visibility,
        ...(metadata ? { metadata } : {}),
      })

      // Recurse into class/struct bodies for methods
      if (['class', 'struct'].includes(symbolKind)) {
        const body = node.childForFieldName?.('body')
        if (body) {
          for (const child of body.namedChildren ?? []) {
            extractSymbolsFromNode(child, { ...ctx, parentName: name })
          }
        }
        return
      }

      // Recurse into module/namespace bodies for nested declarations (classes,
      // functions, etc.) — these are top-level symbols, not methods of the
      // namespace, so parentName is NOT propagated (unlike class/struct above).
      if (symbolKind === 'module') {
        const body = node.childForFieldName?.('body')
        if (body) {
          for (const child of body.namedChildren ?? []) {
            extractSymbolsFromNode(child, ctx)
          }
        }
        return
      }

      // Recurse into function body for call detection
      const body = node.childForFieldName?.('body')
      if (body) {
        extractRelationsFromSubtree(body, ctx, name)
      }
      return
    }
  }

  // ── Relation extraction ────────────────────────────

  // Imports
  if (ref && ref.importNodeTypes.includes(type)) {
    const importTarget = extractImportTarget(node, ctx.languageId)
    if (importTarget) {
      ctx.relations.push({
        fromSymbol: ctx.file,
        toSymbol: importTarget,
        type: 'imports',
        file: ctx.file,
        line: (node.startPosition?.row ?? 0) + 1,
      })
    }
  }

  // Calls (function/method invocations)
  if (type === 'call' || type === 'call_expression' || type === 'method_invocation' || type === 'function_call') {
    const callTarget = extractCallTarget(node)
    if (callTarget) {
      ctx.relations.push({
        fromSymbol: ctx.parentName ?? ctx.file,
        toSymbol: callTarget,
        type: 'calls',
        file: ctx.file,
        line: (node.startPosition?.row ?? 0) + 1,
      })
    }
  }

  // ── Recurse into children ──────────────────────────
  for (const child of node.namedChildren ?? []) {
    extractSymbolsFromNode(child, ctx)
  }
}

/** Recursively extract only relations (calls) from a subtree — used for function bodies. */
function extractRelationsFromSubtree(node: SyntaxNode, ctx: ExtractionContext, scopeName: string): void {
  const type: string = node.type

  if (type === 'call' || type === 'call_expression' || type === 'method_invocation' || type === 'function_call') {
    const callTarget = extractCallTarget(node)
    if (callTarget) {
      ctx.relations.push({
        fromSymbol: scopeName,
        toSymbol: callTarget,
        type: 'calls',
        file: ctx.file,
        line: (node.startPosition?.row ?? 0) + 1,
      })
    }
  }

  for (const child of node.namedChildren ?? []) {
    extractRelationsFromSubtree(child, ctx, scopeName)
  }
}

function extractImportTarget(node: SyntaxNode, languageId: string): string | null {
  if (languageId === 'python') {
    // import os → module_name field or name
    const moduleName = node.childForFieldName?.('module_name')
    if (moduleName) return moduleName.text
    const nameNode = node.childForFieldName?.('name')
    if (nameNode) return nameNode.text
  }

  if (languageId === 'go') {
    // import_spec → path field
    for (const child of node.namedChildren ?? []) {
      if (child.type === 'import_spec') {
        const pathNode = child.childForFieldName?.('path')
        if (pathNode) return pathNode.text.replace(/"/g, '')
      }
    }
  }

  if (languageId === 'rust') {
    const arg = node.childForFieldName?.('argument')
    if (arg) return arg.text
  }

  if (languageId === 'java' || languageId === 'kotlin') {
    const nameNode = node.childForFieldName?.('name') ?? node.namedChildren?.[0]
    if (nameNode) return nameNode.text
  }

  // Generic fallback: first named child text
  const first = node.firstNamedChild
  if (first) return first.text
  return null
}

function extractCallTarget(node: SyntaxNode): string | null {
  const funcNode = node.childForFieldName?.('function')
  if (funcNode) {
    // Simple identifier: foo()
    if (funcNode.type === 'identifier') return funcNode.text
    // Attribute access: obj.method() — extract method name
    const attr = funcNode.childForFieldName?.('attribute')
    if (attr) return attr.text
    // Property: obj.method → field
    const field = funcNode.childForFieldName?.('field')
    if (field) return field.text
  }

  // Java: method_invocation has "name" field
  const nameNode = node.childForFieldName?.('name')
  if (nameNode && nameNode.type === 'identifier') return nameNode.text

  return null
}

// ── Per-language enrichment ───────────────────────────────
// Imported next to the call site in extractSymbolsFromNode. Each
// language module is structurally typed so it doesn't pull in the
// tree-sitter WASM runtime — pure helpers that just walk the AST.

import { enrichPythonSymbol, type PySyntaxNodeLike } from './python-enrichment.js'
import { enrichGoSymbol, hasGoEnrichmentSignal, type GoSyntaxNodeLike } from './go-enrichment.js'
import { enrichRustSymbol, hasRustEnrichmentSignal, type RsSyntaxNodeLike } from './rust-enrichment.js'
import { enrichJavaSymbol, hasJavaEnrichmentSignal, type JavaSyntaxNodeLike } from './java-enrichment.js'
import { enrichKotlinSymbol, hasKotlinEnrichmentSignal, type KtSyntaxNodeLike } from './kotlin-enrichment.js'
import { enrichCsharpSymbol, hasCsharpEnrichmentSignal, type CsSyntaxNodeLike } from './csharp-enrichment.js'

const log = createLogger({ layer: 'core', source: 'treesitter-analyzer.ts' })

// ── TreeSitterAnalyzer class ─────────────────────────────

export class TreeSitterAnalyzer implements CodeAnalyzer {
  private manager: TreeSitterManager

  readonly languages: string[]
  readonly extensions: string[]

  constructor() {
    this.manager = new TreeSitterManager()
    this.languages = [...SUPPORTED_LANGUAGES]
    this.extensions = [...new Set(Object.values(LANGUAGE_REFERENCES).flatMap((r) => r.extensions))]
  }

  /** Initialize the tree-sitter WASM runtime. Must be called before analyzeFile. */
  async initialize(): Promise<void> {
    await this.manager.initialize()
  }

  async analyzeFile(filePath: string, basePath: string): Promise<AnalyzedFile> {
    const relativePath = path.relative(basePath, filePath)
    const ext = path.extname(filePath)
    const languageId = EXTENSION_MAP.get(ext)

    if (!languageId) {
      return { file: relativePath, symbols: [], relations: [] }
    }

    const parser = await this.manager.getParser(languageId)
    if (!parser) {
      log.debug('treesitter-analyzer:no-parser', { languageId, file: relativePath })
      return { file: relativePath, symbols: [], relations: [] }
    }

    let content: string
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch {
      log.debug('treesitter-analyzer:read-error', { file: relativePath })
      return { file: relativePath, symbols: [], relations: [] }
    }

    const tree = parser.parse(content)
    if (!tree) {
      return { file: relativePath, symbols: [], relations: [] }
    }

    const ctx: ExtractionContext = {
      languageId,
      file: relativePath,
      symbols: [],
      relations: [],
      content,
      parentName: null,
    }

    // Walk the AST root
    for (const child of tree.rootNode.namedChildren ?? []) {
      extractSymbolsFromNode(child, ctx)
    }

    log.debug('treesitter-analyzer:analyzed', {
      file: relativePath,
      languageId,
      symbols: String(ctx.symbols.length),
      relations: String(ctx.relations.length),
    })

    return {
      file: relativePath,
      symbols: ctx.symbols,
      relations: ctx.relations,
    }
  }
}
