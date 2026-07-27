/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf lsp` — CLI surface for src/core/lsp/lsp-bridge.ts and lsp-edit-applier.ts.
 *
 * Exposes LspBridge.getLanguageStatus() directly so a driving agent can see
 * which language servers are configured/running without reaching into the
 * LSP subsystem's internal collaborators. Also exposes LspEditApplier so a
 * precomputed LspWorkspaceEdit (e.g. from a rename or code action performed
 * elsewhere) can be applied to disk without a running language server. Also
 * exposes findSymbolByPath so a precomputed document-symbol tree (e.g. from
 * `textDocument/documentSymbol`) can be searched by name path without a
 * running language server.
 */

import { Command } from 'commander'
import { LspBridge } from '../../core/lsp/lsp-bridge.js'
import { LspServerManager } from '../../core/lsp/lsp-server-manager.js'
import { LspDiagnosticsCollector } from '../../core/lsp/lsp-diagnostics.js'
import { ServerRegistry } from '../../core/lsp/server-registry.js'
import { LspEditApplier } from '../../core/lsp/lsp-edit-applier.js'
import { LspWorkspaceEditSchema, LspDocumentSymbolSchema } from '../../core/lsp/lsp-types.js'
import { findSymbolByPath } from '../../core/lsp/symbol-path-resolver.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { z } from 'zod'

const log = createLogger({ layer: 'cli', source: 'lsp-cmd.ts' })

function lspStatusCommand(): Command {
  return new Command('status')
    .description('List configured language servers and their current status')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(async (opts: { dir: string }) => {
      const out = createCliOutput('lsp.status')
      const registry = new ServerRegistry()
      const manager = new LspServerManager(registry, `file://${opts.dir}`)
      const diagnostics = new LspDiagnosticsCollector()
      const bridge = new LspBridge(manager, null, diagnostics, opts.dir)
      const status = await bridge.getLanguageStatus()
      const servers = Array.from(status.values())
      out.ok({ servers })
    })
}

function lspApplyEditCommand(): Command {
  return new Command('apply-edit')
    .description('Apply an LSP workspace edit (JSON) to disk')
    .requiredOption('--edit <json>', 'JSON-encoded LspWorkspaceEdit ({"changes":[...]})')
    .action(async (opts: { edit: string }) => {
      const out = createCliOutput('lsp.apply-edit')
      let raw: unknown
      try {
        raw = JSON.parse(opts.edit)
      } catch (err) {
        out.err('INVALID_EDIT', `--edit is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
        return
      }

      const parsed = LspWorkspaceEditSchema.safeParse(raw)
      if (!parsed.success) {
        out.err('INVALID_EDIT', `--edit does not match LspWorkspaceEdit: ${parsed.error.message}`)
        return
      }

      const applier = new LspEditApplier()
      const result = await applier.applyWorkspaceEdit(parsed.data)
      if (!result.applied) {
        out.fail('APPLY_FAILED', 'Failed to apply workspace edit', {
          filesModified: result.filesModified,
          totalEdits: result.totalEdits,
          errors: result.errors,
        })
        return
      }

      out.ok({
        applied: result.applied,
        filesModified: result.filesModified,
        totalEdits: result.totalEdits,
        errors: result.errors,
      })
    })
}

const symbolListSchema = z.array(LspDocumentSymbolSchema)

function lspFindSymbolCommand(): Command {
  return new Command('find-symbol')
    .description('Find a symbol by name path (e.g. "ClassName/methodName") in a precomputed document-symbol tree')
    .requiredOption('--symbols <json>', 'JSON-encoded LspDocumentSymbol[] (e.g. from textDocument/documentSymbol)')
    .requiredOption('--path <namePath>', 'Symbol name path, e.g. "ClassName/methodName" or "functionName"')
    .requiredOption('--file <path>', 'File the symbol tree belongs to')
    .action(async (opts: { symbols: string; path: string; file: string }) => {
      const out = createCliOutput('lsp.find-symbol')
      let raw: unknown
      try {
        raw = JSON.parse(opts.symbols)
      } catch (err) {
        out.err('INVALID_SYMBOLS', `--symbols is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
        return
      }

      const parsed = symbolListSchema.safeParse(raw)
      if (!parsed.success) {
        out.err('INVALID_SYMBOLS', `--symbols does not match LspDocumentSymbol[]: ${parsed.error.message}`)
        return
      }

      const symbol = findSymbolByPath(parsed.data, opts.path, opts.file)
      out.ok({ found: symbol !== undefined, symbol })
    })
}

/** Builds the `agf lsp` CLI command (Commander definition). */
export function lspCommand(): Command {
  log.info('lsp command registered')
  const cmd = new Command('lsp').description('Language server bridge: status of configured servers')
  cmd.addCommand(lspStatusCommand())
  cmd.addCommand(lspApplyEditCommand())
  cmd.addCommand(lspFindSymbolCommand())
  return cmd
}
