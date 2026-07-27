/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_42b89baf3d45 — Seleção interativa de CLI no `agf init`.
 *
 * Auto-detecta qual CLI o usuário está usando via env vars + markers,
 * permite override manual, e persiste a escolha como project setting.
 * Usa os CliDetectors de `cli-provider.ts` para detecção.
 */

import type { AgentSource } from '../hooks/config-loader.js'
import { detectActiveCLI } from './cli-provider.js'

/** Chave do project setting para persistir a escolha de CLI. */
export const CLI_PROVIDER_SETTING = 'cli_provider'

/** Mapa de AgentSource → label legível. */
const SOURCE_LABELS: Record<AgentSource, string> = {
  opencode: 'OpenCode',
  codex: 'Codex',
  claude: 'Claude Code',
  copilot: 'GitHub Copilot',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  gemini: 'Gemini CLI',
  aider: 'Aider',
  continue: 'Continue',
  cline: 'Cline',
  'mcp-graph': 'MCP Graph (directo)',
  unknown: 'Desconhecido / automático',
}

/** Modo de conexão para cada AgentSource. */
const SOURCE_MODE: Record<AgentSource, 'hook' | 'direct'> = {
  opencode: 'hook',
  codex: 'hook',
  claude: 'hook',
  copilot: 'direct',
  cursor: 'hook',
  windsurf: 'hook',
  gemini: 'hook',
  aider: 'hook',
  continue: 'hook',
  cline: 'hook',
  'mcp-graph': 'direct',
  unknown: 'direct',
}

/** Opções para resolução de CLI. */
export interface CliSelectionOptions {
  /** Variáveis de ambiente para detecção. */
  env: Record<string, string | undefined>
  /** Setting persistido (opcional — se fornecido, override auto-detect). */
  storedSetting?: string
  /** Função para verificar marker de filesystem (injetável para testabilidade). */
  hasMarker?: (marker: string) => boolean
}

/** Resultado da resolução de CLI. */
export interface CliSelectionResult {
  /** Fonte detectada ou configurada. */
  source: AgentSource
  /** Modo de conexão. */
  mode: 'hook' | 'direct'
  /** Nome legível. */
  label: string
  /** Se foi detectado automaticamente (vs. lido de setting). */
  autoDetected: boolean
}

/**
 * Resolve qual CLI está ativa, combinando auto-detecção com setting
 * persistido. O setting persistido sempre vence.
 *
 * Função pura (sem I/O) — testável via DI do env e hasMarker.
 */
export function resolveCliSelection(opts: CliSelectionOptions): CliSelectionResult {
  // 1. Se tem setting persistido, usar ele
  const stored = opts.storedSetting
  if (stored && stored in SOURCE_LABELS) {
    const source = stored as AgentSource
    return {
      source,
      mode: SOURCE_MODE[source],
      label: SOURCE_LABELS[source],
      autoDetected: false,
    }
  }

  // 2. Tentar auto-detecção via env vars + markers
  const detection = detectActiveCLI(undefined, opts.env, opts.hasMarker)
  if (detection) {
    return {
      source: detection.source,
      mode: detection.mode,
      label: detection.label,
      autoDetected: true,
    }
  }

  // 3. Nada detectado — fallback
  return {
    source: 'unknown',
    mode: 'direct',
    label: 'Desconhecido / automático',
    autoDetected: false,
  }
}
