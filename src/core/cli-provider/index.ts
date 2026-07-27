/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export {
  type CliConnectionMode,
  type CliDetection,
  type CliDetector,
  opencodeDetector,
  codexDetector,
  claudeDetector,
  copilotDetector,
  detectActiveCLI,
} from './cli-provider.js'

export { generateShellHooks, type ShellHookOptions, type ShellHookResult } from './shell-hook-provider.js'

export {
  createDirectMcpProvider,
  type DirectMcpProvider,
  type DirectMcpStatus,
  type DirectMcpStartOptions,
} from './direct-mcp-provider.js'

export {
  resolveCliSelection,
  CLI_PROVIDER_SETTING,
  type CliSelectionOptions,
  type CliSelectionResult,
} from './cli-init-selector.js'

export { getConfigFilesForCLI, CLI_CONFIG_MAP, type CliConfigFiles } from './config-conditional.js'
