/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * lsp-normalizers — pure functions that convert raw LSP protocol responses
 * into the agf domain types (LspLocation, LspHoverResult, etc.).
 *
 * WHY: normalization was scattered across LspBridge private methods. Extracting
 * them here makes each conversion independently testable and keeps the bridge
 * as a thin facade. All functions are pure — no I/O, no class state.
 *
 * Composing: lsp-bridge.ts delegates to these; lsp-types.ts owns the output types.
 */

import path from 'node:path'
import type {
  LspLocation,
  LspHoverResult,
  LspTextEdit,
  LspWorkspaceEdit,
  LspCallHierarchyItem,
  LspDocumentSymbol,
} from './lsp-types.js'

// ---------------------------------------------------------------------------
// Raw LSP protocol types (from the wire, before normalization)
// ---------------------------------------------------------------------------

export interface RawLspLocation {
  uri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export interface RawLspHoverResult {
  contents: string | { kind: string; value: string } | Array<string | { kind: string; value: string }>
}

export interface RawLspWorkspaceEdit {
  changes?: Record<
    string,
    Array<{
      range: { start: { line: number; character: number }; end: { line: number; character: number } }
      newText: string
    }>
  >
  documentChanges?: Array<{
    textDocument: { uri: string }
    edits: Array<{
      range: { start: { line: number; character: number }; end: { line: number; character: number } }
      newText: string
    }>
  }>
}

export interface RawCallHierarchyItem {
  name: string
  kind: number
  uri: string
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
}

export interface RawIncomingCall {
  from: RawCallHierarchyItem
}

export interface RawOutgoingCall {
  to: RawCallHierarchyItem
}

export interface RawDocumentSymbol {
  name: string
  kind: number
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  children?: RawDocumentSymbol[]
}

// ---------------------------------------------------------------------------
// Symbol kind mapping (LSP spec numbers → readable strings)
// ---------------------------------------------------------------------------

export const SYMBOL_KIND_MAP: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
}

// ---------------------------------------------------------------------------
// URI helpers
// ---------------------------------------------------------------------------

export function fromFileUri(uri: string, basePath: string): string {
  const raw = uri.replace(/^file:\/\//, '')
  const absPath = decodeURIComponent(raw)
  return path.relative(basePath, absPath).replaceAll('\\', '/')
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export function normalizeLocation(raw: RawLspLocation, basePath: string): LspLocation {
  if (!raw) return { file: '', startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 }
  return {
    file: fromFileUri(raw?.uri ?? '', basePath),
    startLine: (raw?.range?.start?.line ?? 0) + 1,
    startCharacter: raw?.range?.start?.character ?? 0,
    endLine: (raw?.range?.end?.line ?? 0) + 1,
    endCharacter: raw?.range?.end?.character ?? 0,
  }
}

export function normalizeHover(raw: RawLspHoverResult): LspHoverResult {
  if (!raw) return { signature: '' }
  const contents = raw?.contents

  if (typeof contents === 'string') return { signature: contents }

  if (Array.isArray(contents)) {
    const parts = contents.map((c) => (typeof c === 'string' ? c : c.value))
    return {
      signature: parts[0] ?? '',
      documentation: parts.slice(1).join('\n') || undefined,
      language: typeof contents[0] === 'object' ? contents[0].kind : undefined,
    }
  }

  return { signature: contents.value, language: contents.kind === 'markdown' ? 'markdown' : undefined }
}

export function normalizeWorkspaceEdit(raw: RawLspWorkspaceEdit, basePath: string): LspWorkspaceEdit {
  if (!raw) return { changes: [] }
  const changes: LspTextEdit[] = []

  if (raw?.changes) {
    for (const [uri, edits] of Object.entries(raw?.changes ?? {})) {
      if (!uri) continue
      const file = fromFileUri(uri, basePath)
      for (const edit of edits ?? []) {
        if (!edit?.range) continue
        changes.push({
          file,
          startLine: (edit?.range?.start?.line ?? 0) + 1,
          startCharacter: edit?.range?.start?.character ?? 0,
          endLine: (edit?.range?.end?.line ?? 0) + 1,
          endCharacter: edit?.range?.end?.character ?? 0,
          newText: edit?.newText ?? '',
        })
      }
    }
  }

  if (raw?.documentChanges) {
    for (const docChange of raw?.documentChanges ?? []) {
      if (!docChange?.textDocument?.uri) continue
      const file = fromFileUri(docChange?.textDocument?.uri ?? '', basePath)
      for (const edit of docChange?.edits ?? []) {
        if (!edit?.range) continue
        changes.push({
          file,
          startLine: (edit?.range?.start?.line ?? 0) + 1,
          startCharacter: edit?.range?.start?.character ?? 0,
          endLine: (edit?.range?.end?.line ?? 0) + 1,
          endCharacter: edit?.range?.end?.character ?? 0,
          newText: edit?.newText ?? '',
        })
      }
    }
  }

  return { changes }
}

export function normalizeCallHierarchyItem(raw: RawCallHierarchyItem, basePath: string): LspCallHierarchyItem {
  if (!raw) return { name: '', kind: 'Unknown', file: '', startLine: 0, endLine: 0 }
  return {
    name: raw?.name ?? '',
    kind: SYMBOL_KIND_MAP[raw?.kind] ?? `Unknown(${raw?.kind ?? 0})`,
    file: fromFileUri(raw?.uri ?? '', basePath),
    startLine: (raw?.range?.start?.line ?? 0) + 1,
    endLine: (raw?.range?.end?.line ?? 0) + 1,
  }
}

export function normalizeDocumentSymbol(file: string, raw: RawDocumentSymbol): LspDocumentSymbol {
  if (!raw) return { name: '', kind: 'Unknown', file: file ?? '', startLine: 0, endLine: 0 }
  const result: LspDocumentSymbol = {
    name: raw?.name ?? '',
    kind: SYMBOL_KIND_MAP[raw?.kind] ?? `Unknown(${raw?.kind ?? 0})`,
    file: file ?? '',
    startLine: (raw?.range?.start?.line ?? 0) + 1,
    endLine: (raw?.range?.end?.line ?? 0) + 1,
  }
  if (raw?.children && (raw?.children?.length ?? 0) > 0) {
    result.children = raw?.children?.map((child) => normalizeDocumentSymbol(file, child)) ?? []
  }
  return result
}
