/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { Command } from 'commander'
import {
  requestDeviceCode,
  pollForAccessToken,
  saveAuth,
  loadAuth,
  defaultAuthPath,
} from '../../core/model-hub/copilot-auth.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'login-cmd.ts' })

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

/** Builds the `agf login` CLI command (Commander definition). */
export function loginCommand(): Command {
  log.info('login command registered')
  return new Command('login')
    .description('Autentica no GitHub Copilot (device-flow ou --token) p/ o provider HTTP direto')
    .option('--token <pat>', 'Salva um Personal Access Token diretamente (modo headless/CI)')
    .action(async (opts: { token?: string }) => {
      const out = createCliOutput('login')
      const path = defaultAuthPath()

      if (opts.token) {
        saveAuth(path, { githubToken: opts.token })
        out.ok({ authPath: path, method: 'token' })
        return
      }

      const device = await requestDeviceCode(globalThis.fetch as never)
      progress('\nPara autenticar, abra:')
      progress(`  ${device.verificationUri}`)
      progress(`e informe o código: \x1b[1m${device.userCode}\x1b[0m\n`)
      progress('Aguardando autorização… (Ctrl+C para cancelar)')

      const deadline = Date.now() + device.expiresIn * 1000
      let interval = Math.max(1, device.interval)
      while (Date.now() < deadline) {
        await sleep(interval * 1000)
        const r = await pollForAccessToken(globalThis.fetch as never, device.deviceCode)
        if ('accessToken' in r) {
          saveAuth(path, { githubToken: r.accessToken })
          out.ok({ authPath: path, method: 'device-flow' })
          return
        }
        if ('slowDown' in r) interval += 5
      }
      out.err('DEVICE_FLOW_TIMEOUT', 'Tempo esgotado sem autorização. Rode `agf login` de novo.')
    })
}

/** Builds the `agf login` CLI command (Commander definition). */
export function logoutCommand(): Command {
  log.info('logout command registered')
  return new Command('logout').description('Remove o token salvo do GitHub Copilot').action(() => {
    const out = createCliOutput('logout')
    const path = defaultAuthPath()
    if (existsSync(path) && loadAuth(path)) {
      rmSync(path, { force: true })
      out.ok({ authPath: path, action: 'removed' })
    } else {
      out.ok({ action: 'none', reason: 'Nenhum login salvo.' })
    }
  })
}
