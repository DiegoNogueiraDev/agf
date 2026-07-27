/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { listProviders, resolveProviderConfig } from '../../core/model-hub/provider-registry.js'
import { selectProvider } from '../../core/model-hub/resolve-provider.js'
import { parseFailoverProviders } from '../../core/model-hub/failover-model-adapter.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'provider-cmd.ts' })

const PROVIDER_SETTING = 'provider'
const BASE_URL_SETTING = 'provider_base_url'
const FAILOVER_SETTING = 'provider_failover'

/** Builds the `agf provider` CLI command (Commander definition). */
export function providerCommand(): Command {
  log.info('provider command registered')
  const cmd = new Command('provider').description(
    'Provider de modelo (Copilot default; OpenAI-compatible; exclui Anthropic)',
  )

  cmd
    .command('list', { isDefault: true })
    .description('Lista os providers disponíveis')
    .action(() => {
      const out = createCliOutput('provider.list')
      const providers: Array<{ id: string; label: string; baseURL?: string; requiresKey?: boolean; envVar?: string }> =
        [{ id: 'copilot', label: 'GitHub Copilot (default)' }]
      for (const id of listProviders()) {
        const c = resolveProviderConfig(id)
        if (c)
          providers.push({
            id,
            label: c.label,
            baseURL: c.baseURL,
            requiresKey: c.requiresKey,
            envVar: c.requiresKey ? c.envVar : undefined,
          })
      }
      out.ok({ providers })
    })

  cmd
    .command('use <id>')
    .description('Define o provider ativo do projeto (opcional: --base-url p/ servidor local/remoto)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--base-url <url>', 'Endpoint OpenAI-compatible (ex.: http://IP:11434/v1 p/ Ollama remoto)')
    .action((id: string, opts: { dir: string; baseUrl?: string }) => {
      const out = createCliOutput('provider.use')
      if (id !== 'copilot' && !resolveProviderConfig(id)) {
        out.err('UNKNOWN_PROVIDER', `Provider desconhecido: ${id}. Tente 'provider list'.`)
        return
      }
      const store = openStoreOrFail(opts.dir)
      try {
        store.setProjectSetting(PROVIDER_SETTING, id)
        store.setProjectSetting(BASE_URL_SETTING, opts.baseUrl?.trim() ?? '')
        const c = id === 'copilot' ? null : resolveProviderConfig(id)
        out.ok({
          provider: id,
          baseUrl: opts.baseUrl?.trim() ?? null,
          requiresKey: c?.requiresKey ?? false,
          envVar: c?.requiresKey ? c.envVar : undefined,
        })
      } finally {
        store.close()
      }
    })

  cmd
    .command('set-url [url]')
    .description('Define/limpa o endpoint do provider ativo (sem url = limpa → volta ao padrão)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((url: string | undefined, opts: { dir: string }) => {
      const out = createCliOutput('provider.set-url')
      const store = openStoreOrFail(opts.dir)
      try {
        store.setProjectSetting(BASE_URL_SETTING, url?.trim() ?? '')
        out.ok({ endpoint: url?.trim() ?? null })
      } finally {
        store.close()
      }
    })

  cmd
    .command('failover [chain]')
    .description(
      'Define a cadeia de failover (ex.: "openrouter,ollama:qwen2.5-coder:7b"); sem arg mostra; --clear limpa',
    )
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--clear', 'Remove a cadeia de failover', false)
    .action((chain: string | undefined, opts: { dir: string; clear: boolean }) => {
      const out = createCliOutput('provider.failover')
      const store = openStoreOrFail(opts.dir)
      try {
        if (opts.clear) {
          store.setProjectSetting(FAILOVER_SETTING, '')
          out.ok({ failover: null })
          return
        }
        if (!chain || !chain.trim()) {
          const current = parseFailoverProviders(store.getProjectSetting(FAILOVER_SETTING))
          out.ok({
            failover:
              current.length > 0 ? current.map((s) => (s.model ? `${s.provider}:${s.model}` : s.provider)) : null,
          })
          return
        }
        const specs = parseFailoverProviders(chain)
        const unknown = specs.filter((s) => s.provider !== 'copilot' && !resolveProviderConfig(s.provider))
        if (unknown.length > 0) {
          out.err(
            'UNKNOWN_PROVIDER',
            `Provider(s) desconhecido(s): ${unknown.map((s) => s.provider).join(', ')}. Tente 'provider list'.`,
          )
          return
        }
        store.setProjectSetting(FAILOVER_SETTING, chain.trim())
        out.ok({ failover: specs.map((s) => (s.model ? `${s.provider}:${s.model}` : s.provider)) })
      } finally {
        store.close()
      }
    })

  cmd
    .command('current')
    .description('Mostra o provider ativo (resolvido com o ambiente + setting)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('provider.current')
      const store = openStoreOrFail(opts.dir)
      try {
        const setting = store.getProjectSetting(PROVIDER_SETTING)
        const persistedUrl = store.getProjectSetting(BASE_URL_SETTING)
        const choice = selectProvider(setting, process.env, persistedUrl)
        out.ok({
          provider: choice.kind === 'copilot' ? 'copilot' : choice.providerId,
          kind: choice.kind,
          baseURL: choice.kind === 'copilot' ? undefined : choice.baseURL,
          fallback:
            choice.kind === 'copilot' && setting && setting !== 'copilot'
              ? `setting='${setting}' sem chave → fallback p/ copilot`
              : undefined,
        })
      } finally {
        store.close()
      }
    })

  return cmd
}
