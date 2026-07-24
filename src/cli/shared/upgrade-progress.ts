/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Barra de progresso do `agf upgrade` (node_75475503f294).
 *
 * PORQUÊ: `agf upgrade` baixava o binário em silêncio — o usuário não sabia se
 * travou. Este módulo dá o RENDER puro (determinístico, testável) + o writer que
 * a anima em `process.stderr` durante o download em stream. Guardrails: a barra
 * NUNCA vai em stdout (lá vive o envelope JSON do CLI) e só é escrita quando o
 * stderr é um TTY (pipe/CI ⇒ saída limpa, sem ANSI). Reusado pelo port
 * `fetchBinary` do upgrade-cmd; zero dependência de Ink (leve).
 */

const FILLED = '█'
const EMPTY = '░'
const DEFAULT_WIDTH = 24
const BYTES_PER_MB = 1024 * 1024

/** Fração 0..1 saturada; total ≤ 0 (desconhecido) ⇒ 0, nunca NaN. */
function clampedFraction(downloaded: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const f = downloaded / total
  if (!Number.isFinite(f)) return 0
  return Math.min(1, Math.max(0, f))
}

const toMb = (bytes: number): string => (Math.max(0, bytes) / BYTES_PER_MB).toFixed(1)

/**
 * Monta a barra: `[████░░░░] 60% (1.2/2.0 MB)`. Com `total` desconhecido (≤0),
 * mostra só o baixado sem porcentagem falsa — nunca `NaN%`. Puro/determinístico.
 */
export function renderProgressBar(downloaded: number, total: number, width: number = DEFAULT_WIDTH): string {
  const w = Math.max(1, Math.floor(width))
  const fraction = clampedFraction(downloaded, total)
  const filled = Math.round(fraction * w)
  const bar = FILLED.repeat(filled) + EMPTY.repeat(w - filled)

  if (!Number.isFinite(total) || total <= 0) {
    return `[${bar}] … (${toMb(downloaded)} MB)`
  }
  const pct = Math.round(fraction * 100)
  return `[${bar}] ${pct}% (${toMb(downloaded)}/${toMb(total)} MB)`
}

/** Escreve a barra em stderr (carriage-return, sem newline) — só quando stderr é TTY. */
export interface ProgressWriter {
  update(downloaded: number, total: number): void
  done(): void
}

/**
 * Cria o writer que anima a barra em `stderr`. Fora de TTY (pipe/CI) todos os
 * métodos são no-op — nenhuma sequência ANSI vaza para logs. `err` é injetável
 * (DIP) para teste; default `process.stderr`.
 */
export function createProgressWriter(err: NodeJS.WriteStream = process.stderr): ProgressWriter {
  if (!err.isTTY) {
    return { update: () => {}, done: () => {} }
  }
  return {
    update(downloaded: number, total: number): void {
      err.write(`\r${renderProgressBar(downloaded, total)}`)
    },
    done(): void {
      err.write('\n')
    },
  }
}
