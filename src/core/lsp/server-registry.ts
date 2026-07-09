/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * ServerRegistry — Registry of language server configurations.
 *
 * Manages 12 built-in language servers with extension routing,
 * supports user overrides and custom language additions.
 */

import path from 'node:path'
import type { LspServerConfig, LspConfigOverride } from './lsp-types.js'

// ---------------------------------------------------------------------------
// Default server configurations (12 built-in)
// ---------------------------------------------------------------------------

const DEFAULT_SERVERS: LspServerConfig[] = [
  {
    languageId: 'typescript',
    extensions: ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    configFiles: ['tsconfig.json', 'jsconfig.json', 'package.json'],
  },
  {
    languageId: 'python',
    extensions: ['py', 'pyi'],
    command: 'pylsp',
    args: [],
    configFiles: ['pyproject.toml', 'setup.py', 'Pipfile', 'requirements.txt'],
  },
  {
    languageId: 'rust',
    extensions: ['rs'],
    command: 'rust-analyzer',
    args: [],
    configFiles: ['Cargo.toml'],
  },
  {
    languageId: 'go',
    extensions: ['go'],
    command: 'gopls',
    args: ['serve'],
    configFiles: ['go.mod'],
  },
  {
    languageId: 'java',
    extensions: ['java'],
    command: 'jdtls',
    args: [],
    configFiles: ['pom.xml', 'build.gradle'],
  },
  {
    languageId: 'cpp',
    extensions: ['cpp', 'c', 'cc', 'cxx', 'h', 'hpp'],
    command: 'clangd',
    args: [],
    configFiles: ['CMakeLists.txt', 'compile_commands.json', 'Makefile'],
  },
  {
    languageId: 'ruby',
    extensions: ['rb'],
    command: 'solargraph',
    args: ['stdio'],
    configFiles: ['Gemfile'],
  },
  {
    languageId: 'php',
    extensions: ['php'],
    command: 'intelephense',
    args: ['--stdio'],
    configFiles: ['composer.json'],
  },
  {
    languageId: 'kotlin',
    extensions: ['kt', 'kts'],
    command: 'kotlin-language-server',
    args: [],
    configFiles: ['build.gradle.kts'],
  },
  {
    languageId: 'swift',
    extensions: ['swift'],
    command: 'sourcekit-lsp',
    args: [],
    configFiles: ['Package.swift'],
  },
  {
    languageId: 'csharp',
    extensions: ['cs'],
    command: 'csharp-ls',
    args: [],
    configFiles: [],
  },
  {
    languageId: 'lua',
    extensions: ['lua'],
    command: 'lua-language-server',
    args: [],
    configFiles: ['.luarc.json'],
  },
]

// ---------------------------------------------------------------------------
// ServerRegistry
// ---------------------------------------------------------------------------

export class ServerRegistry {
  private servers: Map<string, LspServerConfig>
  private extensionMap: Map<string, string>

  constructor(overrides?: LspConfigOverride[]) {
    this.servers = new Map()
    this.extensionMap = new Map()

    // 1. Load defaults
    for (const server of DEFAULT_SERVERS) {
      this.servers.set(server.languageId, { ...server })
    }

    // 2. Build initial extension map
    this.rebuildExtensionMap()

    // 3. Apply overrides
    if (overrides) {
      for (const override of overrides) {
        const existing = this.servers.get(override.languageId)
        if (existing) {
          // Merge: override fields take precedence
          const merged: LspServerConfig = {
            ...existing,
            command: override.command,
            args: override.args ?? existing.args,
          }
          if (override.extensions) {
            merged.extensions = override.extensions
          }
          if (override.initializationOptions !== undefined) {
            merged.initializationOptions = override.initializationOptions
          }
          if (override.settings !== undefined) {
            merged.settings = override.settings
          }
          this.servers.set(override.languageId, merged)
        } else {
          // Add as new server
          const newServer: LspServerConfig = {
            languageId: override.languageId,
            command: override.command,
            args: override.args ?? [],
            extensions: override.extensions ?? [],
            configFiles: [],
          }
          if (override.initializationOptions !== undefined) {
            newServer.initializationOptions = override.initializationOptions
          }
          if (override.settings !== undefined) {
            newServer.settings = override.settings
          }
          this.servers.set(override.languageId, newServer)
        }
      }

      // 4. Rebuild extension map after overrides
      this.rebuildExtensionMap()
    }
  }

  getConfigForLanguage(languageId: string): LspServerConfig | undefined {
    return this.servers.get(languageId)
  }

  getLanguageForExtension(ext: string): string | undefined {
    return this.extensionMap.get(ext)
  }

  getLanguageForFile(filePath: string): string | undefined {
    const ext = path.extname(filePath)
    if (!ext) {
      return undefined
    }
    // Strip leading dot
    return this.getLanguageForExtension(ext.slice(1))
  }

  getAllConfigs(): LspServerConfig[] {
    return Array.from(this.servers.values())
  }

  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys())
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private rebuildExtensionMap(): void {
    this.extensionMap.clear()
    for (const server of this.servers.values()) {
      for (const ext of server.extensions) {
        this.extensionMap.set(ext, server.languageId)
      }
    }
  }
}
