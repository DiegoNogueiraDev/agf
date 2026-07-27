/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_f64d4527275d — Config condicional (ADR-001).
 *
 * Mapeia cada CLI ao conjunto de config files de CONTEXTO que ela precisa.
 * CLI-first: zero `.mcp.json` / `.vscode/mcp.json` — o pivot dirige tudo pelo
 * CLI `agf`. Cada CLI recebe só o arquivo de contexto no seu formato nativo.
 */

import type { AgentSource } from '../hooks/config-loader.js'

/** Lista de config files para uma CLI. */
export type CliConfigFiles = readonly string[]

/** Mapa: AgentSource → arquivos de contexto CLI-first (sem MCP). */
export const CLI_CONFIG_MAP = new Map<AgentSource, CliConfigFiles>([
  ['opencode', ['AGENTS.md']],
  ['codex', ['AGENTS.md']],
  ['claude', ['CLAUDE.md']],
  ['copilot', ['.github/copilot-instructions.md']],
  ['cursor', ['.cursor/rules/agent-graph-flow.md']],
  ['windsurf', ['.windsurf/rules/agent-graph-flow.md']],
  ['gemini', ['GEMINI.md']],
  ['aider', ['CLAUDE.md']],
  ['continue', ['CLAUDE.md']],
  ['cline', ['CLAUDE.md']],
  ['mcp-graph', ['CLAUDE.md', '.github/copilot-instructions.md', 'AGENTS.md']],
  ['unknown', ['CLAUDE.md', '.github/copilot-instructions.md', 'AGENTS.md']],
])

/**
 * Retorna a lista de config files para a CLI especificada.
 * CLIs não mapeadas recebem o conjunto completo (fallback).
 */
export function getConfigFilesForCLI(cli: AgentSource): CliConfigFiles {
  return CLI_CONFIG_MAP.get(cli) ?? CLI_CONFIG_MAP.get('unknown')!
}
