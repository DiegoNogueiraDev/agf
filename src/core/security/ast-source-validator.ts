/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import ts from 'typescript'

export interface SourceViolation {
  readonly kind: 'parse' | 'size' | 'identifier' | 'dynamic-import' | 'string-identifier' | 'property'
  readonly message: string
  readonly loc?: string
}

export interface SourceValidationResult {
  readonly ok: boolean
  readonly violations: readonly SourceViolation[]
}

export interface ValidateSourceOptions {
  readonly maxBytes?: number
  readonly extraBannedIdentifiers?: readonly string[]
  readonly extraBannedProperties?: readonly string[]
}

const BANNED_IDENTIFIERS = new Set<string>([
  'process',
  'require',
  'eval',
  'Function',
  'global',
  'globalThis',
  'Deno',
  'Bun',
  '__dirname',
  '__filename',
  'module',
  'exports',
  'WebAssembly',
  'SharedArrayBuffer',
])

const BANNED_PROPERTIES = new Set<string>(['__proto__', 'constructor', 'prototype'])

const BANNED_LITERAL_STRINGS = new Set<string>([
  'process',
  'require',
  'eval',
  'globalThis',
  'Function',
  'child_process',
  'fs',
  'net',
  'os',
  'vm',
])

/** validateSource —  */
export function validateSource(source: string, options: ValidateSourceOptions = {}): SourceValidationResult {
  const maxBytes = options.maxBytes ?? 16_384
  const violations: SourceViolation[] = []

  if (typeof source !== 'string') {
    return { ok: false, violations: [{ kind: 'parse', message: 'source is not a string' }] }
  }
  if (Buffer.byteLength(source, 'utf8') > maxBytes) {
    violations.push({ kind: 'size', message: `source exceeds ${maxBytes} bytes` })
    return { ok: false, violations }
  }

  const sf = ts.createSourceFile('helper.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)

  const parseDiags = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
  if (parseDiags.length > 0) {
    for (const dVar of parseDiags) {
      violations.push({
        kind: 'parse',
        message:
          typeof dVar.messageText === 'string'
            ? dVar.messageText
            : ts.flattenDiagnosticMessageText(dVar.messageText, '\n'),
      })
    }
    return { ok: false, violations }
  }

  const extraIds = new Set(options.extraBannedIdentifiers ?? [])
  const extraProps = new Set(options.extraBannedProperties ?? [])

  const locOf = (node: ts.Node): string => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    return `${line + 1}:${character + 1}`
  }

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const name = node.text
      if (BANNED_IDENTIFIERS.has(name) || extraIds.has(name)) {
        const parent = node.parent
        if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) {
          // reading `foo.process` as a field name is ok; only reject when it's the *object*.
        } else if (parent && ts.isPropertyAssignment(parent) && parent.name === node) {
          // `{ process: x }` field name — ok.
        } else if (
          parent &&
          (ts.isParameter(parent) || ts.isVariableDeclaration(parent) || ts.isBindingElement(parent)) &&
          parent.name === node
        ) {
          // user-defined local named `process` — allowed as a bind; its uses still resolve lexically.
        } else {
          violations.push({ kind: 'identifier', message: `banned identifier "${name}"`, loc: locOf(node) })
        }
      }
    }

    if (ts.isPropertyAccessExpression(node) || ts.isPropertyAssignment(node)) {
      const name = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : ts.isIdentifier(node.name)
          ? node.name.text
          : ''
      if (name && (BANNED_PROPERTIES.has(name) || extraProps.has(name))) {
        violations.push({ kind: 'property', message: `banned property "${name}"`, loc: locOf(node) })
      }
    }

    if (ts.isElementAccessExpression(node)) {
      const arg = node.argumentExpression
      if (arg && ts.isStringLiteralLike(arg)) {
        if (BANNED_LITERAL_STRINGS.has(arg.text) || BANNED_PROPERTIES.has(arg.text)) {
          violations.push({ kind: 'string-identifier', message: `bracket access to "${arg.text}"`, loc: locOf(node) })
        }
      }
      // detect string-concat bypass: x['pro'+'cess'], x['re'+'quire'], etc.
      if (arg && ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const joined = collectStringConcat(arg)
        if (
          joined !== null &&
          (BANNED_LITERAL_STRINGS.has(joined) || BANNED_IDENTIFIERS.has(joined) || BANNED_PROPERTIES.has(joined))
        ) {
          violations.push({
            kind: 'string-identifier',
            message: `obfuscated bracket access to "${joined}"`,
            loc: locOf(node),
          })
        }
      }
    }

    if (
      node.kind === ts.SyntaxKind.ImportKeyword &&
      node.parent &&
      ts.isCallExpression(node.parent) &&
      node.parent.expression === node
    ) {
      violations.push({ kind: 'dynamic-import', message: 'dynamic import() not allowed', loc: locOf(node) })
    }

    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      violations.push({ kind: 'dynamic-import', message: 'import.meta not allowed', loc: locOf(node) })
    }

    ts.forEachChild(node, visit)
  }

  visit(sf)
  return { ok: violations.length === 0, violations }
}

function collectStringConcat(node: ts.Expression): string | null {
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const lVar = collectStringConcat(node.left)
    const rVar = collectStringConcat(node.right)
    if (lVar !== null && rVar !== null) return lVar + rVar
  }
  return null
}
