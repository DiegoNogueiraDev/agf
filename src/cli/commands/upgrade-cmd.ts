/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * agf upgrade — self-update the standalone binary in place: checks the published
 * version (releases/BUILDINFO), downloads the fixed-name asset for this OS/arch,
 * verifies its sha256, and atomically swaps the running executable. Only meaningful
 * for the compiled binary; the npm/source install is updated via npm, so this
 * command refuses there with a clear message.
 *
 * Composes with: core/upgrade/upgrade-runner.ts (testable flow + ports),
 *               core/upgrade/upgrade.ts (pure logic). Mirrors public/install.sh.
 */
import { Command } from 'commander'
import { chmodSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { VERSION } from '../../index.js'
import { isBunRuntime } from '../../core/store/database-factory.js'
import { createCliOutput } from '../shared/cli-output.js'
import { runUpgrade } from '../../core/upgrade/upgrade-runner.js'
import { UpgradeError } from '../../core/upgrade/upgrade-error.js'
import { createProgressWriter } from '../shared/upgrade-progress.js'

/**
 * Baixa o binário em STREAM, animando a barra em stderr (node_75475503f294).
 * Sem `res.body` (fetch sem stream) cai no arrayBuffer de uma vez. O writer é
 * no-op fora de TTY, então logs/pipes ficam limpos e o envelope JSON em stdout intacto.
 */
async function fetchBinaryWithProgress(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new UpgradeError(`HTTP ${res.status} for ${url}`)
  if (!res.body) return Buffer.from(await res.arrayBuffer())

  const total = Number(res.headers.get('content-length') ?? 0)
  const writer = createProgressWriter()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let downloaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    downloaded += value.length
    writer.update(downloaded, total)
  }
  writer.done()
  return Buffer.concat(chunks)
}

/** Replace the binary at `dest` atomically. Unix: rename-over keeps the open
 * inode valid for the running process. Windows: a running .exe can't be
 * overwritten, so rename the old aside first, then move the new one in. */
async function swapBinary(dest: string, bytes: Buffer): Promise<void> {
  const tmp = join(dirname(dest), `.agf-upgrade-${process.pid}.tmp`)
  writeFileSync(tmp, bytes)
  if (process.platform !== 'win32') chmodSync(tmp, 0o755)

  if (process.platform === 'win32') {
    const old = `${dest}.old-${process.pid}`
    renameSync(dest, old) // free the name (the running .exe stays open as `old`)
    try {
      renameSync(tmp, dest)
    } catch (e) {
      renameSync(old, dest) // roll back on failure
      throw e
    }
    // `old` can't be deleted while running; best-effort cleanup, ignore EBUSY.
    try {
      rmSync(old, { force: true })
    } catch {
      /* the next upgrade or a reboot reclaims it */
    }
    return
  }

  renameSync(tmp, dest) // atomic on POSIX (same filesystem)
}

export function upgradeCommand(): Command {
  return new Command('upgrade')
    .description('Update the agf standalone binary to the latest published version')
    .option('-f, --force', 'Re-install even if already up to date')
    .option('--check', 'Only report whether an update is available; do not install')
    .action(async (opts: { force?: boolean; check?: boolean }) => {
      const out = createCliOutput('upgrade')

      if (!isBunRuntime) {
        out.err(
          'NOT_A_BINARY',
          'agf upgrade only updates the standalone binary. This is the npm/source install — update it with `npm i -g agent-graph-flow@latest` or `git pull && npm run build`.',
        )
        return
      }

      const result = await runUpgrade({
        platform: process.platform,
        arch: process.arch,
        currentVersion: VERSION,
        execPath: process.execPath,
        force: opts.force,
        fetchText: async (url) => {
          const res = await fetch(url)
          if (!res.ok) throw new UpgradeError(`HTTP ${res.status} for ${url}`)
          return res.text()
        },
        fetchBinary: fetchBinaryWithProgress,
        // --check short-circuits the swap by reporting only; otherwise swap for real.
        swapBinary: opts.check ? async () => {} : swapBinary,
      })

      if (result.ok) {
        out.ok(result)
      } else {
        out.fail(result.code ?? 'UPGRADE_FAILED', result.error ?? 'upgrade failed', result)
      }
    })
}
