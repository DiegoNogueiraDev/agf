/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_92cf517b3dbe — Catálogo de providers OpenAI-compatible (baseURL + env da
 * chave). Um único OpenAICompatibleAdapter atende todos. **Anthropic é
 * deliberadamente excluído** — o dono usa o CLI da Anthropic diretamente.
 * GitHub Copilot continua com seu adapter dedicado (default).
 */

export interface ProviderConfig {
  id: string
  label: string
  baseURL: string
  /** Variável de ambiente da chave Bearer (vazia p/ endpoints locais). */
  envVar: string
  /** Se false, não exige chave (ex.: Ollama local). */
  requiresKey: boolean
}

const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    envVar: 'OPENAI_API_KEY',
    requiresKey: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    envVar: 'OPENROUTER_API_KEY',
    requiresKey: true,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    envVar: 'GROQ_API_KEY',
    requiresKey: true,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    envVar: 'DEEPSEEK_API_KEY',
    requiresKey: true,
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    baseURL: 'https://api.cerebras.ai/v1',
    envVar: 'CEREBRAS_API_KEY',
    requiresKey: true,
  },
  togetherai: {
    id: 'togetherai',
    label: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    envVar: 'TOGETHER_API_KEY',
    requiresKey: true,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    baseURL: 'http://localhost:11434/v1',
    envVar: '',
    requiresKey: false,
  },
}

/** Config de um provider por id, ou `undefined` (inclui o caso excluído anthropic). */
export function resolveProviderConfig(id: string): ProviderConfig | undefined {
  return PROVIDERS[id]
}

/** Ids dos providers disponíveis (Anthropic não está presente). */
export function listProviders(): string[] {
  return Object.keys(PROVIDERS)
}
