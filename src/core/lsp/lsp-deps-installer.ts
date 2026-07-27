/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LSP Language Server dependency installer.
 * Detects project languages and checks/installs corresponding language servers.
 * Never throws — returns LspDepResult[] with status for each dependency.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createLogger } from '../utils/logger.js'
import { whichCommand } from '../utils/platform.js'

const log = createLogger({ layer: 'core', source: 'lsp-deps-installer.ts' })

const execAsync = promisify(execFile)

export type LspDepStatus = 'already_available' | 'not_found' | 'skipped'

export interface LspDepResult {
  name: string
  languageId: string
  status: LspDepStatus
  message: string
  npmPackage?: string
  installHint?: string
}

/** npm-installable language servers: languageId → npm package name */
export const LSP_NPM_PACKAGES: Record<string, string> = {
  typescript: 'typescript-language-server',
  php: 'intelephense',
}

/** System-installed language servers: languageId → { command, installHint } */
export const LSP_SYSTEM_PACKAGES: Record<string, { command: string; installHint: string }> = {
  python: {
    command: 'pylsp',
    installHint: 'pip install python-lsp-server',
  },
  rust: {
    command: 'rust-analyzer',
    installHint: 'rustup component add rust-analyzer',
  },
  go: {
    command: 'gopls',
    installHint: 'go install golang.org/x/tools/gopls@latest',
  },
  cpp: {
    command: 'clangd',
    installHint: 'Install via system package manager (apt install clangd / brew install llvm)',
  },
  ruby: {
    command: 'solargraph',
    installHint: 'gem install solargraph',
  },
  java: {
    command: 'jdtls',
    installHint: 'Install Eclipse JDT Language Server (https://github.com/eclipse-jdtls/eclipse.jdt.ls)',
  },
  kotlin: {
    command: 'kotlin-language-server',
    installHint: 'npm install -g kotlin-language-server',
  },
  swift: {
    command: 'sourcekit-lsp',
    installHint: 'Included with Xcode / Swift toolchain',
  },
  csharp: {
    command: 'csharp-ls',
    installHint: 'dotnet tool install --global csharp-ls',
  },
  lua: {
    command: 'lua-language-server',
    installHint: 'Install from https://github.com/LuaLS/lua-language-server',
  },
}

/**
 * Check if a specific LSP server command is available.
 */
export async function checkLspDep(languageId: string, command: string): Promise<LspDepResult> {
  try {
    await execAsync(whichCommand(), [command])
    log.info('LSP server available', { languageId, command })
    return {
      name: command,
      languageId,
      status: 'already_available',
      message: `${command} found in PATH`,
    }
  } catch {
    // Check npm packages
    const npmPkg = LSP_NPM_PACKAGES[languageId]
    if (npmPkg) {
      return {
        name: command,
        languageId,
        status: 'not_found',
        message: `Not found. Install with: npm install --save-dev ${npmPkg}`,
        npmPackage: npmPkg,
        installHint: `npm install --save-dev ${npmPkg}`,
      }
    }

    // Check system packages
    const sysPkg = LSP_SYSTEM_PACKAGES[languageId]
    if (sysPkg) {
      return {
        name: command,
        languageId,
        status: 'not_found',
        message: `Not found. Install with: ${sysPkg.installHint}`,
        installHint: sysPkg.installHint,
      }
    }

    return {
      name: command,
      languageId,
      status: 'not_found',
      message: `${command} not found in PATH`,
    }
  }
}

/**
 * Get the server command for a language ID.
 */
function getServerCommand(languageId: string): string | null {
  const npm = LSP_NPM_PACKAGES[languageId]
  if (npm) return npm
  const sys = LSP_SYSTEM_PACKAGES[languageId]
  if (sys) return sys.command
  return null
}

/**
 * Check LSP dependencies for detected project languages.
 * Never throws — returns status for each language.
 */
export async function installLspDeps(detectedLanguages: string[]): Promise<LspDepResult[]> {
  if (detectedLanguages.length === 0) return []

  log.info('Checking LSP server dependencies', {
    languages: detectedLanguages.join(', '),
  })

  const results: LspDepResult[] = []

  for (const lang of detectedLanguages) {
    const command = getServerCommand(lang)
    if (!command) continue

    const resultValue = await checkLspDep(lang, command)
    results.push(resultValue)
  }

  const available = results.filter((r) => r.status === 'already_available').length
  const missing = results.filter((r) => r.status === 'not_found').length

  log.info('LSP dependency check complete', {
    total: String(results.length),
    available: String(available),
    missing: String(missing),
  })

  return results
}
