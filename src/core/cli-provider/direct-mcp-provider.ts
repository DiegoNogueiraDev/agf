/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_dfed2dc00d88 — DirectMcpProvider (ADR-003).
 *
 * Provider que conecta MCP direto quando agent-driver interno está
 * no controle. Em vez de gerar hooks shell (ShellHookProvider),
 * este provider faz bootstrap do MCP server in-process.
 *
 * Modo `simulate`: permite testar o provider sem banco real
 * (viabiliza testes determinísticos sem SQLite).
 */

/** Opções para inicialização do DirectMcpProvider. */
export interface DirectMcpStartOptions {
  /** Diretório do projeto (default: cwd). */
  dir?: string
  /** Porta HTTP (default: 3000 ou MCP_PORT env). */
  port?: number
  /** Modo simulado: não conecta banco real. */
  simulate?: boolean
}

/** Status atual da conexão MCP direta. */
export interface DirectMcpStatus {
  connected: boolean
  storeReady: boolean
  nodeCount: number
  version: string
  uptimeMs: number
  port?: number
}

/** Provider de conexão MCP direta. */
export interface DirectMcpProvider {
  /** Identificador do provider. */
  readonly id: 'mcp-graph'
  /** Nome legível. */
  readonly label: string
  /** Inicializa a conexão MCP. */
  start(opts?: DirectMcpStartOptions): Promise<DirectMcpStatus>
  /** Encerra a conexão MCP. */
  stop(): Promise<void>
  /** Status atual da conexão. */
  status(): DirectMcpStatus
}

/** Versão do pacote (importada do package.json via index.ts). */
const PROVIDER_VERSION = '0.14.0'

/**
 * Cria uma instância do DirectMcpProvider.
 * Fabrica em vez de classe para seguir o padrão de pure functions
 * usado pelos hook providers existentes.
 */
export function createDirectMcpProvider(): DirectMcpProvider {
  let connected = false
  let storeReady = false
  let startedAt = 0
  let currentPort: number | undefined

  const provider: DirectMcpProvider = {
    id: 'mcp-graph',
    label: 'DirectMCP',

    async start(opts: DirectMcpStartOptions = {}): Promise<DirectMcpStatus> {
      if (opts.simulate) {
        connected = true
        storeReady = true
        startedAt = Date.now()
        currentPort = opts.port
        return provider.status()
      }

      // Modo real: bootstrap do MCP server.
      // Por enquanto, o bootstrap real é delegado ao src/mcp/server.ts.
      // Este provider expõe a interface programática.
      try {
        const { bootstrap } = await import('../../mcp/server.js')
        await bootstrap({ dir: opts.dir, port: opts.port })
        connected = true
        storeReady = true
        startedAt = Date.now()
        currentPort = opts.port
      } catch {
        connected = false
        storeReady = false
        startedAt = 0
      }
      return provider.status()
    },

    async stop(): Promise<void> {
      connected = false
      storeReady = false
      startedAt = 0
      currentPort = undefined
    },

    status(): DirectMcpStatus {
      const uptimeMs = startedAt > 0 ? Date.now() - startedAt : 0
      return {
        connected,
        storeReady,
        nodeCount: 0,
        version: PROVIDER_VERSION,
        uptimeMs,
        port: currentPort,
      }
    },
  }

  return provider
}
