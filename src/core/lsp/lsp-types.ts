/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LSP Multi-Language Integration — Zod Schemas & Types
 *
 * Defines all schemas for Language Server Protocol integration:
 * server configuration, code locations, diagnostics, symbols,
 * edits, server state, and language detection.
 */

import { z } from 'zod/v4'

// ---------------------------------------------------------------------------
// 1. LspServerConfigSchema — Configuration for a language server
// ---------------------------------------------------------------------------

export const LspServerConfigSchema = z.object({
  languageId: z.string(),
  extensions: z.array(z.string()),
  command: z.string(),
  args: z.array(z.string()),
  configFiles: z.array(z.string()),
  probeCommand: z.string().optional(),
  initializationOptions: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
})

export type LspServerConfig = z.infer<typeof LspServerConfigSchema>

// ---------------------------------------------------------------------------
// 2. LspConfigOverrideSchema — User override for a server
// ---------------------------------------------------------------------------

export const LspConfigOverrideSchema = z.object({
  languageId: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  extensions: z.array(z.string()).optional(),
  initializationOptions: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
})

export type LspConfigOverride = z.infer<typeof LspConfigOverrideSchema>

// ---------------------------------------------------------------------------
// 3. LspLocationSchema — A code location
// ---------------------------------------------------------------------------

export const LspLocationSchema = z.object({
  file: z.string(),
  startLine: z.int().min(0),
  startCharacter: z.int().min(0),
  endLine: z.int().min(0),
  endCharacter: z.int().min(0),
})

export type LspLocation = z.infer<typeof LspLocationSchema>

// ---------------------------------------------------------------------------
// 4. LspHoverResultSchema
// ---------------------------------------------------------------------------

export const LspHoverResultSchema = z.object({
  signature: z.string(),
  documentation: z.string().optional(),
  language: z.string().optional(),
})

export type LspHoverResult = z.infer<typeof LspHoverResultSchema>

// ---------------------------------------------------------------------------
// 5. LspDiagnosticSeverity — const enum object
// ---------------------------------------------------------------------------

export const LspDiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const

export type LspDiagnosticSeverityValue = (typeof LspDiagnosticSeverity)[keyof typeof LspDiagnosticSeverity]

// ---------------------------------------------------------------------------
// 6. LspDiagnosticSchema
// ---------------------------------------------------------------------------

export const LspDiagnosticSchema = z.object({
  file: z.string(),
  startLine: z.int().min(0),
  startCharacter: z.int().min(0),
  endLine: z.int().min(0),
  endCharacter: z.int().min(0),
  severity: z.number().int().min(1).max(4),
  message: z.string(),
  code: z.string().optional(),
  source: z.string().optional(),
})

export type LspDiagnostic = z.infer<typeof LspDiagnosticSchema>

// ---------------------------------------------------------------------------
// 7. LspCallHierarchyItemSchema
// ---------------------------------------------------------------------------

export const LspCallHierarchyItemSchema = z.object({
  name: z.string(),
  kind: z.string(),
  file: z.string(),
  startLine: z.int().min(0),
  endLine: z.int().min(0),
})

export type LspCallHierarchyItem = z.infer<typeof LspCallHierarchyItemSchema>

// ---------------------------------------------------------------------------
// 8. LspDocumentSymbolSchema (recursive with optional children)
// ---------------------------------------------------------------------------

export type LspDocumentSymbol = {
  name: string
  kind: string
  file: string
  startLine: number
  endLine: number
  children?: LspDocumentSymbol[]
}

export const LspDocumentSymbolSchema: z.ZodType<LspDocumentSymbol> = z.object({
  name: z.string(),
  kind: z.string(),
  file: z.string(),
  startLine: z.int().min(0),
  endLine: z.int().min(0),
  children: z.lazy(() => z.array(LspDocumentSymbolSchema)).optional(),
})

// ---------------------------------------------------------------------------
// 9. LspTextEditSchema
// ---------------------------------------------------------------------------

export const LspTextEditSchema = z.object({
  file: z.string(),
  startLine: z.int().min(0),
  startCharacter: z.int().min(0),
  endLine: z.int().min(0),
  endCharacter: z.int().min(0),
  newText: z.string(),
})

export type LspTextEdit = z.infer<typeof LspTextEditSchema>

// ---------------------------------------------------------------------------
// 10. LspWorkspaceEditSchema
// ---------------------------------------------------------------------------

export const LspWorkspaceEditSchema = z.object({
  changes: z.array(LspTextEditSchema),
})

export type LspWorkspaceEdit = z.infer<typeof LspWorkspaceEditSchema>

// ---------------------------------------------------------------------------
// 11. LspServerStateSchema
// ---------------------------------------------------------------------------

export const LspServerStateSchema = z.object({
  languageId: z.string(),
  status: z.enum(['stopped', 'starting', 'ready', 'error']),
  pid: z.number().int().optional(),
  error: z.string().optional(),
})

export type LspServerState = z.infer<typeof LspServerStateSchema>

// ---------------------------------------------------------------------------
// 12. DetectedLanguageSchema
// ---------------------------------------------------------------------------

export const DetectedLanguageSchema = z.object({
  languageId: z.string(),
  confidence: z.number().min(0).max(1),
  detectedVia: z.enum(['file_extension', 'config_file', 'shebang']),
  fileCount: z.int().min(0),
  configFile: z.string().optional(),
})

export type DetectedLanguage = z.infer<typeof DetectedLanguageSchema>

// ---------------------------------------------------------------------------
// 13. LspCodeActionSchema — A code action returned by the server
// ---------------------------------------------------------------------------

export const LspCodeActionSchema = z.object({
  title: z.string(),
  kind: z.string().optional(),
  isPreferred: z.boolean().optional(),
  edit: LspWorkspaceEditSchema.optional(),
  diagnostics: z.array(LspDiagnosticSchema).optional(),
})

export type LspCodeAction = z.infer<typeof LspCodeActionSchema>

// ---------------------------------------------------------------------------
// 14. EditApplyResultSchema — Result of applying edits to disk
// ---------------------------------------------------------------------------

export const EditApplyResultSchema = z.object({
  applied: z.boolean(),
  filesModified: z.array(z.string()),
  totalEdits: z.number().int(),
  errors: z.array(z.string()),
  backups: z.map(z.string(), z.string()).optional(),
})

export type EditApplyResult = z.infer<typeof EditApplyResultSchema>
