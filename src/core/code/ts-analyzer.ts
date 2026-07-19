/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * TypeScript AST analyzer using ts.createSourceFile() (parse-only, no type checker).
 * Extracts symbols and relations from TypeScript files syntactically.
 * ~10-100x faster than ts.createProgram() with ~95% accuracy.
 *
 * Uses dynamic import for the "typescript" package so the module loads
 * gracefully even when typescript is not installed (e.g. production / global installs).
 */

import type ts from 'typescript'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from '../utils/logger.js'
import type { AnalyzedFile, CodeAnalyzer, CodeRelation, CodeSymbol } from './code-types.js'

const log = createLogger({ layer: 'core', source: 'ts-analyzer.ts' })

type PartialSymbol = Omit<CodeSymbol, 'id' | 'projectId' | 'indexedAt'>
type PartialRelation = Omit<CodeRelation, 'id' | 'projectId' | 'indexedAt'>

// ── Lazy TypeScript loader ──────────────────────────────

let tsModule: typeof ts | null = null
let loadAttempted = false

async function loadTypeScript(): Promise<typeof ts | null> {
  if (tsModule) return tsModule
  if (loadAttempted) return null
  loadAttempted = true
  try {
    const mod = await import('typescript')
    tsModule = mod.default ?? mod
    return tsModule
  } catch {
    log.warn('ts-analyzer:typescript-unavailable', {
      message: 'typescript not found — code analysis disabled',
    })
    return null
  }
}

/** Reset the lazy loader state (for testing purposes). */
export function resetTypeScriptLoader(): void {
  tsModule = null
  loadAttempted = false
}

/**
 * Check if the typescript package is available at runtime.
 * Used for diagnostics — returns false when typescript is not installed
 * (e.g., mcp-graph installed as production dependency without typescript).
 */
export async function isTypeScriptAvailable(): Promise<boolean> {
  const tsLib = await loadTypeScript()
  return tsLib !== null
}

/**
 * Analyze a single TypeScript file syntactically.
 * Returns extracted symbols and relations with paths relative to basePath.
 * Returns empty result if the typescript package is unavailable.
 */
export async function analyzeFile(filePath: string, basePath: string): Promise<AnalyzedFile> {
  const relativePath = path.relative(basePath, filePath)

  const tsLib = await loadTypeScript()
  if (!tsLib) {
    return { file: relativePath, symbols: [], relations: [] }
  }

  const content = readFileSync(filePath, 'utf-8')

  const sourceFile = tsLib.createSourceFile(
    relativePath,
    content,
    tsLib.ScriptTarget.Latest,
    true, // setParentNodes
    tsLib.ScriptKind.TS,
  )

  const symbols: PartialSymbol[] = []
  const relations: PartialRelation[] = []

  // Track imports for call resolution: localName → { modulePath, importedName }
  const importMap = new Map<string, { modulePath: string; importedName: string }>()

  // First pass: collect imports
  collectImports(tsLib, sourceFile, importMap)

  // Second pass: extract symbols and relations
  visitNode(tsLib, sourceFile, sourceFile, relativePath, symbols, relations, importMap, null)

  log.debug('ts-analyzer:file', {
    file: relativePath,
    symbols: symbols.length,
    relations: relations.length,
  })

  return { file: relativePath, symbols, relations }
}

// ── Import Collection ────────────────────────────────

function collectImports(
  tsLib: typeof ts,
  sourceFile: ts.SourceFile,
  importMap: Map<string, { modulePath: string; importedName: string }>,
): void {
  for (const stmt of sourceFile.statements) {
    if (!tsLib.isImportDeclaration(stmt)) continue
    if (!stmt.moduleSpecifier || !tsLib.isStringLiteral(stmt.moduleSpecifier)) continue

    const modulePath = stmt.moduleSpecifier.text
    const clause = stmt.importClause
    if (!clause) continue

    // Default import
    if (clause.name) {
      importMap.set(clause.name.text, { modulePath, importedName: 'default' })
    }

    // Named imports: import { a, b as c } from '...'
    if (clause.namedBindings && tsLib.isNamedImports(clause.namedBindings)) {
      for (const specifier of clause.namedBindings.elements) {
        const localName = specifier.name.text
        const importedName = specifier.propertyName?.text ?? localName
        importMap.set(localName, { modulePath, importedName })
      }
    }

    // Namespace import: import * as ns from '...'
    if (clause.namedBindings && tsLib.isNamespaceImport(clause.namedBindings)) {
      importMap.set(clause.namedBindings.name.text, { modulePath, importedName: '*' })
    }
  }
}

// ── AST Visitor ──────────────────────────────────────

function visitNode(
  tsLib: typeof ts,
  node: ts.Node,
  sourceFile: ts.SourceFile,
  file: string,
  symbols: PartialSymbol[],
  relations: PartialRelation[],
  importMap: Map<string, { modulePath: string; importedName: string }>,
  currentClass: string | null,
): void {
  // Function declarations
  if (tsLib.isFunctionDeclaration(node) && node.name) {
    const name = node.name.text
    const { line: startLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())
    const { line: endLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getEnd())

    symbols.push({
      name,
      kind: 'function',
      file,
      startLine: startLine + 1,
      endLine: endLine + 1,
      exported: hasExportModifier(tsLib, node),
      signature: extractSignature(tsLib, node, sourceFile),
    })

    // Scan function body for calls
    if (node.body) {
      collectCalls(tsLib, node.body, sourceFile, file, name, relations, importMap)
    }
  }

  // Class declarations
  if (tsLib.isClassDeclaration(node) && node.name) {
    const className = node.name.text
    const { line: startLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())
    const { line: endLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getEnd())

    symbols.push({
      name: className,
      kind: 'class',
      file,
      startLine: startLine + 1,
      endLine: endLine + 1,
      exported: hasExportModifier(tsLib, node),
    })

    // Heritage clauses: extends / implements
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        const relType = clause.token === tsLib.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements'
        for (const typeExpr of clause.types) {
          const baseName = typeExpr.expression.getText(sourceFile)
          relations.push({
            fromSymbol: className,
            toSymbol: baseName,
            type: relType as PartialRelation['type'],
            file,
            line: tsLib.getLineAndCharacterOfPosition(sourceFile, typeExpr.getStart()).line + 1,
          })
        }
      }
    }

    // Visit class members
    for (const member of node.members) {
      if (tsLib.isMethodDeclaration(member) && member.name) {
        const methodName = member.name.getText(sourceFile)
        const { line: mStartLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, member.getStart())
        const { line: mEndLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, member.getEnd())

        symbols.push({
          name: methodName,
          kind: 'method',
          file,
          startLine: mStartLine + 1,
          endLine: mEndLine + 1,
          exported: false,
          signature: extractSignature(tsLib, member, sourceFile),
        })

        relations.push({
          fromSymbol: methodName,
          toSymbol: className,
          type: 'belongs_to',
          file,
          line: mStartLine + 1,
        })

        // Scan method body for calls
        if (member.body) {
          collectCalls(tsLib, member.body, sourceFile, file, methodName, relations, importMap)
        }
      }

      if (tsLib.isConstructorDeclaration(member) && member.body) {
        const { line: cStartLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, member.getStart())
        const { line: cEndLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, member.getEnd())

        symbols.push({
          name: 'constructor',
          kind: 'method',
          file,
          startLine: cStartLine + 1,
          endLine: cEndLine + 1,
          exported: false,
        })

        relations.push({
          fromSymbol: 'constructor',
          toSymbol: className,
          type: 'belongs_to',
          file,
          line: cStartLine + 1,
        })

        collectCalls(tsLib, member.body, sourceFile, file, 'constructor', relations, importMap)
      }
    }

    return // Don't recurse into class children again
  }

  // Interface declarations
  if (tsLib.isInterfaceDeclaration(node)) {
    const name = node.name.text
    const { line: startLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())
    const { line: endLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getEnd())

    symbols.push({
      name,
      kind: 'interface',
      file,
      startLine: startLine + 1,
      endLine: endLine + 1,
      exported: hasExportModifier(tsLib, node),
    })
  }

  // Type alias declarations
  if (tsLib.isTypeAliasDeclaration(node)) {
    const name = node.name.text
    const { line: startLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())
    const { line: endLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getEnd())

    symbols.push({
      name,
      kind: 'type_alias',
      file,
      startLine: startLine + 1,
      endLine: endLine + 1,
      exported: hasExportModifier(tsLib, node),
    })
  }

  // Enum declarations
  if (tsLib.isEnumDeclaration(node)) {
    const name = node.name.text
    const { line: startLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())
    const { line: endLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getEnd())

    symbols.push({
      name,
      kind: 'enum',
      file,
      startLine: startLine + 1,
      endLine: endLine + 1,
      exported: hasExportModifier(tsLib, node),
    })
  }

  // Variable statements (arrow functions + exported variables)
  if (tsLib.isVariableStatement(node)) {
    const isExported = hasExportModifier(tsLib, node)
    for (const decl of node.declarationList.declarations) {
      if (!tsLib.isIdentifier(decl.name)) continue

      const name = decl.name.text
      const { line: startLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())
      const { line: endLine } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getEnd())

      const isArrowOrFn =
        decl.initializer && (tsLib.isArrowFunction(decl.initializer) || tsLib.isFunctionExpression(decl.initializer))

      if (isArrowOrFn) {
        // Arrow functions / function expressions → kind "function"
        symbols.push({
          name,
          kind: 'function',
          file,
          startLine: startLine + 1,
          endLine: endLine + 1,
          exported: isExported,
        })

        // Scan body for calls
        const fnNode = decl.initializer as ts.ArrowFunction | ts.FunctionExpression
        if (fnNode.body) {
          collectCalls(tsLib, fnNode.body, sourceFile, file, name, relations, importMap)
        }
      } else if (isExported) {
        // Non-function exported variables → kind "variable"
        symbols.push({
          name,
          kind: 'variable',
          file,
          startLine: startLine + 1,
          endLine: endLine + 1,
          exported: true,
        })
      }
    }
  }

  // Export declarations → re-exports from barrel files
  if (tsLib.isExportDeclaration(node)) {
    const { line } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())
    const modulePath =
      node.moduleSpecifier && tsLib.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null

    if (node.exportClause && tsLib.isNamedExports(node.exportClause)) {
      // Named re-exports: export { foo, bar as baz } from './mod' OR export { foo }
      for (const specifier of node.exportClause.elements) {
        const exportedName = specifier.name.text
        const originalName = specifier.propertyName?.text ?? exportedName

        symbols.push({
          name: exportedName,
          kind: 'variable',
          file,
          startLine: line + 1,
          endLine: line + 1,
          exported: true,
          metadata: modulePath ? { isReExport: true, reExportFrom: modulePath, originalName } : undefined,
        })

        const metadata: Record<string, unknown> = {}
        if (modulePath) {
          metadata.reExportFrom = modulePath
        }
        if (originalName !== exportedName) {
          metadata.originalName = originalName
        }

        relations.push({
          fromSymbol: file,
          toSymbol: originalName,
          type: 'exports',
          file,
          line: line + 1,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        })
      }
    } else if (!node.exportClause && modulePath) {
      // Star re-export: export * from './mod'
      relations.push({
        fromSymbol: file,
        toSymbol: '*',
        type: 'exports',
        file,
        line: line + 1,
        metadata: { reExportFrom: modulePath },
      })
    }
  }

  // Import declarations → import relations (file-level, from each imported name to the file)
  if (tsLib.isImportDeclaration(node) && node.moduleSpecifier && tsLib.isStringLiteral(node.moduleSpecifier)) {
    const modulePath = node.moduleSpecifier.text
    const clause = node.importClause
    if (clause) {
      const { line } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())

      if (clause.namedBindings && tsLib.isNamedImports(clause.namedBindings)) {
        for (const specifier of clause.namedBindings.elements) {
          const importedName = specifier.propertyName?.text ?? specifier.name.text
          relations.push({
            fromSymbol: file,
            toSymbol: importedName,
            type: 'imports',
            file,
            line: line + 1,
            metadata: { modulePath },
          })
        }
      }

      if (clause.name) {
        relations.push({
          fromSymbol: file,
          toSymbol: clause.name.text,
          type: 'imports',
          file,
          line: line + 1,
          metadata: { modulePath },
        })
      }
    }
  }

  // Recurse into children (except class which is handled above)
  if (!tsLib.isClassDeclaration(node)) {
    tsLib.forEachChild(node, (child) => {
      visitNode(tsLib, child, sourceFile, file, symbols, relations, importMap, currentClass)
    })
  }
}

// ── Call Collection ──────────────────────────────────

function collectCalls(
  tsLib: typeof ts,
  body: ts.Node,
  sourceFile: ts.SourceFile,
  file: string,
  callerName: string,
  relations: PartialRelation[],
  importMap: Map<string, { modulePath: string; importedName: string }>,
): void {
  const seen = new Set<string>()

  function walk(node: ts.Node): void {
    if (tsLib.isCallExpression(node)) {
      const calleeName = extractCalleeName(tsLib, node.expression, sourceFile)
      if (calleeName && calleeName !== callerName && !seen.has(calleeName)) {
        seen.add(calleeName)
        const { line } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())

        // Resolve through import map if available
        const importEntry = importMap.get(calleeName)
        const resolvedName = importEntry
          ? importEntry.importedName === '*'
            ? calleeName
            : importEntry.importedName
          : calleeName

        relations.push({
          fromSymbol: callerName,
          toSymbol: resolvedName,
          type: 'calls',
          file,
          line: line + 1,
        })
      }
    }

    if (tsLib.isNewExpression(node)) {
      const calleeName = extractCalleeName(tsLib, node.expression, sourceFile)
      if (calleeName && !seen.has(calleeName)) {
        seen.add(calleeName)
        const { line } = tsLib.getLineAndCharacterOfPosition(sourceFile, node.getStart())
        relations.push({
          fromSymbol: callerName,
          toSymbol: calleeName,
          type: 'calls',
          file,
          line: line + 1,
        })
      }
    }

    tsLib.forEachChild(node, walk)
  }

  walk(body)
}

// ── Helpers ──────────────────────────────────────────

function hasExportModifier(tsLib: typeof ts, node: ts.Node): boolean {
  if (!tsLib.canHaveModifiers(node)) return false
  const modifiers = tsLib.getModifiers(node)
  return modifiers?.some((m) => m.kind === tsLib.SyntaxKind.ExportKeyword) ?? false
}

function extractCalleeName(tsLib: typeof ts, expr: ts.Expression, _sourceFile: ts.SourceFile): string | null {
  // Simple identifier: foo()
  if (tsLib.isIdentifier(expr)) {
    return expr.text
  }

  // Property access: obj.method() → extract method name
  if (tsLib.isPropertyAccessExpression(expr)) {
    return expr.name.text
  }

  return null
}

function extractSignature(
  tsLib: typeof ts,
  node: ts.FunctionDeclaration | ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (!node.parameters || node.parameters.length === 0) return undefined

  const params = node.parameters.map((p) => p.getText(sourceFile)).join(', ')

  const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : ''
  return `(${params})${returnType}`
}

// ── TsAnalyzer class — wraps existing functions as CodeAnalyzer ──

export class TsAnalyzer implements CodeAnalyzer {
  readonly languages = ['typescript', 'javascript']
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']

  async analyzeFile(filePath: string, basePath: string): Promise<AnalyzedFile> {
    return analyzeFile(filePath, basePath)
  }
}
