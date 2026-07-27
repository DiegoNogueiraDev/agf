/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export { detectProjectLanguages } from './language-detector.js'
export { LspBridge } from './lsp-bridge.js'
export { LspCache } from './lsp-cache.js'
export { LspClient } from './lsp-client.js'
export { LSP_NPM_PACKAGES, LSP_SYSTEM_PACKAGES, checkLspDep, installLspDeps } from './lsp-deps-installer.js'
export type { LspDepStatus, LspDepResult } from './lsp-deps-installer.js'
export { LspDiagnosticsCollector } from './lsp-diagnostics.js'
export type { DiagnosticsSummary } from './lsp-diagnostics.js'
export { LspEditApplier } from './lsp-edit-applier.js'
export { LspServerManager } from './lsp-server-manager.js'
export {
  LspServerConfigSchema,
  LspConfigOverrideSchema,
  LspLocationSchema,
  LspHoverResultSchema,
  LspDiagnosticSeverity,
  LspDiagnosticSchema,
  LspCallHierarchyItemSchema,
  LspDocumentSymbolSchema,
  LspTextEditSchema,
  LspWorkspaceEditSchema,
  LspServerStateSchema,
  DetectedLanguageSchema,
  LspCodeActionSchema,
  EditApplyResultSchema,
} from './lsp-types.js'
export type {
  LspServerConfig,
  LspConfigOverride,
  LspLocation,
  LspHoverResult,
  LspDiagnosticSeverityValue,
  LspDiagnostic,
  LspCallHierarchyItem,
  LspDocumentSymbol,
  LspTextEdit,
  LspWorkspaceEdit,
  LspServerState,
  DetectedLanguage,
  LspCodeAction,
  EditApplyResult,
} from './lsp-types.js'
export { ServerRegistry } from './server-registry.js'
