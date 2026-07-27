/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * scan-silent-failures — expõe o detector de falha silenciosa (node_e7807a63a61d,
 * épico node_b94dd6f2df50) como comando CLI. Varre um diretório por FALLBACKS
 * MASCARANTES (`|| []`, `|| ''`, catch vazio, `@ts-expect-error`) — a classe
 * dominante de defeito da validação de superfície (contrato API↔tela divergente
 * que degrada p/ vazio sem crashar). Sem esta superfície o detector fica dormente
 * (regra 9). Reusa a lógica pura buildSilentFailurePayload (zero recount) e o
 * envelope-helper. Registrado em commands-list.ts + command-registry.ts.
 */
import { Command } from 'commander'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'
import { createLogger } from '../../core/utils/logger.js'
import { buildSilentFailurePayload, type ScannedFile } from '../../core/analyzer/silent-failure-detector.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'scan-silent-failures-cmd.ts' })

const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,vue,svelte}'
const IGNORE_GLOBS = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/*.d.ts']

export function scanSilentFailuresCommand(): Command {
  return new Command('scan-silent-failures')
    .description("Scan a directory for masking fallbacks (|| [], || '', empty catch, @ts-expect-error)")
    .argument('[dir]', 'Directory to scan', process.cwd())
    .option('--select <path>', 'Dot-path filter on output data')
    .action(async (dir: string) => {
      const out = createCliOutput('scan-silent-failures')
      if (!existsSync(dir)) {
        out.err('PATH_NOT_FOUND', `Diretório não existe: ${dir}`)
        return
      }
      try {
        const files: ScannedFile[] = globSync(SOURCE_GLOB, { cwd: dir, ignore: IGNORE_GLOBS })
          .map((rel): ScannedFile | null => {
            try {
              return { path: rel, content: readFileSync(join(dir, rel), 'utf8') }
            } catch {
              return null // arquivo sumiu/ilegível entre o glob e a leitura — pula, não derruba o scan
            }
          })
          .filter((f): f is ScannedFile => f !== null)
        out.ok(buildSilentFailurePayload(files))
      } catch (err) {
        log.error('scan-silent-failures:error', { error: String(err) })
        out.err('SCAN_ERROR', err instanceof Error ? err.message : String(err))
      }
    })
}
