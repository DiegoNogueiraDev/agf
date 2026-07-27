/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Seleção automática do provider (M1u): usa o adapter HTTP direto
 * (`CopilotApiAdapter`) quando há login salvo; senão cai no adapter via-CLI
 * (`CopilotSdkAdapter`). Aditivo — nada quebra para quem usa o Copilot CLI.
 */
import { isLoggedIn } from './copilot-auth.js'
import { CopilotApiAdapter } from './copilot-api-adapter.js'
import { CopilotSdkAdapter } from './copilot-sdk-adapter.js'
import type { ModelAdapter } from './model-client.js'

export interface ResolvedAdapter {
  adapter: ModelAdapter
  kind: 'api' | 'cli'
}

/** Resolve o melhor adapter disponível: HTTP se logado, senão CLI. */
export function resolveModelAdapter(opts: { authFilePath?: string } = {}): ResolvedAdapter {
  if (isLoggedIn(opts.authFilePath)) {
    return { adapter: new CopilotApiAdapter({ authFilePath: opts.authFilePath }), kind: 'api' }
  }
  return { adapter: new CopilotSdkAdapter(), kind: 'cli' }
}
