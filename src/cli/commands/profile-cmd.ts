/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { BUILT_IN_PROFILES, listProfiles, resolveProfile, type WorkProfile } from '../../core/config/profiles.js'
import { resolveTierModel } from '../../core/model-hub/tier-router.js'
import { setFlowEnabled } from '../shared/enable-flow.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'profile-cmd.ts' })

interface ProfileStore {
  getProjectSetting(key: string): string | null
  setProjectSetting(key: string, value: string): void
}

export function applyProfile(store: ProfileStore, name: string): WorkProfile | undefined {
  const profile = resolveProfile(name)
  if (!profile) return undefined
  store.setProjectSetting('model', resolveTierModel(profile.modelTier))
  setFlowEnabled(store, profile.flow)
  return profile
}

/** Builds the `agf profile` CLI command (Commander definition). */
export function profileCommand(): Command {
  log.info('profile command registered')
  const cmd = new Command('profile').description('Bundles de trabalho: tier de modelo + flow + retries')

  cmd
    .command('list')
    .description('Lista os profiles disponíveis')
    .action(() => {
      const out = createCliOutput('profile-list')
      const results: { name: string; tier: string; flow: boolean; retries: number }[] = []
      for (const name of listProfiles()) {
        const p = BUILT_IN_PROFILES[name]
        results.push({ name, tier: p.modelTier, flow: p.flow, retries: p.retries })
      }
      out.ok({ profiles: results })
    })

  cmd
    .command('show <nome>')
    .description('Detalha um profile')
    .action((nome: string) => {
      const out = createCliOutput('profile-show')
      const p = resolveProfile(nome)
      if (!p) {
        out.err('NOT_FOUND', `Profile desconhecido: ${nome}. Tente 'profile list'.`)
        return
      }
      out.ok({ name: nome, tier: p.modelTier, flow: p.flow, retries: p.retries, model: resolveTierModel(p.modelTier) })
    })

  return cmd
}
