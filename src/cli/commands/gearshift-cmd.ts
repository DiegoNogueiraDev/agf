/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { escalateGear, deescalateGear, effortForGear, tierForGear, type Gear } from '../../core/model-hub/gearshift.js'
import { resolveTierModel } from '../../core/model-hub/tier-router.js'
import { setGear, GEAR_SETTINGS } from '../../core/model-hub/claude-settings-writer.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'

const log = createLogger({ layer: 'cli', source: 'gearshift-cmd.ts' })

const GEAR_KEY = 'gearshift_gear'
const AUTO_KEY = 'gearshift_auto'
/** Safe default gear (build/low) — matches gearshift.ts's SAFE_DEFAULT_GEAR. */
const DEFAULT_GEAR: Gear = 2

function readGear(store: SqliteStore): Gear {
  const raw = store.getProjectSetting(GEAR_KEY)
  const parsed = raw ? Number(raw) : DEFAULT_GEAR
  return (parsed >= 1 && parsed <= 4 ? parsed : DEFAULT_GEAR) as Gear
}

function readAuto(store: SqliteStore): boolean {
  return store.getProjectSetting(AUTO_KEY) !== 'false'
}

function gearSnapshot(gear: Gear, auto: boolean) {
  const tier = tierForGear(gear)
  return {
    auto,
    gear,
    tier,
    model: resolveTierModel(tier),
    effort: effortForGear(gear),
  }
}

function persistGear(store: SqliteStore, gear: Gear): void {
  store.setProjectSetting(GEAR_KEY, String(gear))
  // AGF_CLAUDE_HOME lets tests redirect the settings.json write away from the
  // real ~/.claude — never rely on the real home dir being writable in tests.
  const home = process.env.AGF_CLAUDE_HOME
  if (home) setGear(gear, home)
  else setGear(gear)
}

/** Builds the `agf gearshift` CLI command (Commander definition). */
export function gearshiftCommand(): Command {
  log.info('gearshift command registered')
  const cmd = new Command('gearshift').description(
    'Gear manual (1-4) para model/effort — reflete em ~/.claude/settings.json',
  )

  cmd
    .command('status')
    .description('Mostra o gear/tier/model/effort atual e se o modo auto está ligado')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('gearshift.status')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        out.ok(gearSnapshot(readGear(store), readAuto(store)))
      } finally {
        store.close()
      }
    })

  cmd
    .command('set')
    .description('Fixa um gear (1-4) manualmente — sobrepõe o modo auto')
    .argument('<n>', 'Gear alvo (1-4)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((n: string, opts: { dir: string }) => {
      const out = createCliOutput('gearshift.set')
      const parsed = Number(n)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
        out.err('INVALID_GEAR', `Gear inválido: "${n}". Use um inteiro entre 1 e 4.`)
        return
      }
      const gear = parsed as Gear
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        persistGear(store, gear)
        out.ok({ ...gearSnapshot(gear, readAuto(store)), hint: `/model ${GEAR_SETTINGS[gear].model}` })
      } finally {
        store.close()
      }
    })

  cmd
    .command('up')
    .description('Sobe um rung de gear (cap em 4)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('gearshift.up')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const gear = escalateGear(readGear(store))
        persistGear(store, gear)
        out.ok({ ...gearSnapshot(gear, readAuto(store)), hint: `/model ${GEAR_SETTINGS[gear].model}` })
      } finally {
        store.close()
      }
    })

  cmd
    .command('down')
    .description('Desce um rung de gear (piso em 1)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('gearshift.down')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const gear = deescalateGear(readGear(store))
        persistGear(store, gear)
        out.ok({ ...gearSnapshot(gear, readAuto(store)), hint: `/model ${GEAR_SETTINGS[gear].model}` })
      } finally {
        store.close()
      }
    })

  cmd
    .command('auto')
    .description('Liga/desliga o modo automático (off = manual, gearshift set sobrepõe)')
    .argument('<onOrOff>', 'on | off')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((onOrOff: string, opts: { dir: string }) => {
      const out = createCliOutput('gearshift.auto')
      if (onOrOff !== 'on' && onOrOff !== 'off') {
        out.err('INVALID_ARG', `Esperado "on" ou "off", recebido: "${onOrOff}".`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        store.setProjectSetting(AUTO_KEY, onOrOff === 'on' ? 'true' : 'false')
        out.ok(gearSnapshot(readGear(store), onOrOff === 'on'))
      } finally {
        store.close()
      }
    })

  return cmd
}
