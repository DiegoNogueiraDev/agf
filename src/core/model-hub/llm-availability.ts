/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Detecção de disponibilidade de LLM próprio do `agf` (modo autônomo vs delegado).
 *
 * O `agf` tem dois modos: **autônomo** (ele mesmo chama o modelo — precisa de um
 * provider/login) e **delegado** (uma CLI-agente — Claude/Copilot/Codex/… — dirige
 * o `agf` e faz o "pensar"; o `agf` é a camada determinística). Esta função detecta
 * qual modo está disponível **sem nunca chamar a rede**, para os comandos `--live`
 * escolherem entre executar autônomo ou emitir um brief de delegação.
 */
import { checkProviders } from '../doctor/provider-check.js'
import { isLoggedIn } from './copilot-auth.js'

/** Como o LLM próprio do agf está disponível (ou por que não está). */
export type LlmVia = 'provider-key' | 'provider-setting' | 'copilot-login' | 'none' | 'delegated-cli'

export interface LlmAvailability {
  /** true = modo autônomo possível; false = só modo delegado. */
  available: boolean
  via: LlmVia
  /** Provider/credencial detectado (ex.: 'openrouter', 'copilot'), p/ diagnóstico. */
  detail?: string
}

export interface DetectLlmOptions {
  env?: NodeJS.ProcessEnv
  /** Setting persistido do projeto (provider) — ex.: 'ollama', 'openrouter'. */
  providerSetting?: string
  /** Base URL persistida (ollama/custom OpenAI-compatible). */
  providerBaseUrl?: string
  /** Injeção p/ teste — default: copilot-auth.isLoggedIn. */
  isLoggedInFn?: () => boolean
}

/**
 * Resolve a disponibilidade de LLM próprio, na ordem: env key de provider →
 * provider+base-url persistido (ex.: ollama local) → login Copilot → nenhum.
 * Determinística e offline.
 */
export function detectLlmAvailability(opts: DetectLlmOptions = {}): LlmAvailability {
  const env = opts.env ?? process.env
  const loggedIn = opts.isLoggedInFn ?? (() => isLoggedIn())

  // 1. Chave de provider no ambiente (OPENROUTER_API_KEY, OPENAI_API_KEY, …).
  const providers = checkProviders(env)
  if (providers.configuredCount > 0) {
    const first = providers.providers.find((p) => p.configured)
    return { available: true, via: 'provider-key', detail: first?.provider }
  }

  // 2. Provider explícito + base-url persistidos (ex.: ollama local, $0/token).
  if (opts.providerSetting && opts.providerBaseUrl) {
    return { available: true, via: 'provider-setting', detail: opts.providerSetting }
  }

  // 3. Login do GitHub Copilot (auth.json).
  if (loggedIn()) {
    return { available: true, via: 'copilot-login', detail: 'copilot' }
  }

  // 4. Nada → só modo delegado (a CLI-agente que dirige faz o pensar).
  return { available: false, via: 'none' }
}
