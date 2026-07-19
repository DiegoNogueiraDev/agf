/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * agf composable runner — lets agf call agf subcommands programmatically.
 *
 * Spawns agf as a child process, collects stdout JSON envelope, and returns
 * the parsed result. Enables command chaining: one agf command's output
 * feeds into another.
 */

import { spawn } from 'node:child_process'
import type { OutputEnvelope } from '../output/envelope.js'
import { McpGraphError } from '../utils/errors.js'
import { listCommandNames } from '../config/command-surface.js'

export interface AgfRunOptions {
  dir?: string
  cwd?: string
  timeoutMs?: number
}

export interface AgfRunResult<T = unknown> {
  envelope: OutputEnvelope<T>
  stdout: string
}

export interface AgfInvocation {
  /** Executável a spawnar. */
  bin: string
  /** Args ANTES do comando agf (loader + script em dev; vazio p/ binário). */
  prefix: string[]
}

/**
 * Resolve como re-invocar o próprio agf (node_e3972a535bf6). Em `npm run dev`
 * `argv[1]` é `src/cli/index.ts` — spawná-lo direto dá `spawn EACCES` (não é
 * executável). A correção: rodar via `execPath` + `execArgv` (o loader tsx) +
 * o script, para o Node conseguir carregar o `.ts`. Contra o binário instalado
 * (`argv[1]` = JS/bin executável) mantém o spawn direto, sem prefixo. Puro e
 * testável — não lê `process` (recebe os valores por parâmetro).
 */
export function resolveAgfInvocation(
  argv1: string | undefined,
  execPath: string,
  execArgv: readonly string[],
): AgfInvocation {
  if (argv1 && argv1.endsWith('.ts')) {
    return { bin: execPath, prefix: [...execArgv, argv1] }
  }
  return { bin: argv1 || 'agf', prefix: [] }
}

/**
 * Tool-routing gate (REQ-LCR-001): reject an unknown `agf` command before it
 * ever reaches `spawn`. Without this, a typo'd command name (e.g. `nxt`)
 * silently becomes a child-process spawn that fails downstream with a
 * confusing exit-code/stderr — the #1 cause of loop reruns per
 * the Pareto analysis behind REQ-LCR.
 */
function assertKnownCommand(command: string): void {
  if (!listCommandNames().includes(command)) {
    throw new McpGraphError(`unknown agf command: '${command}'`)
  }
}

export function runAgf<T = unknown>(
  command: string,
  args: string[],
  opts: AgfRunOptions = {},
): Promise<AgfRunResult<T>> {
  return new Promise((resolve, reject) => {
    assertKnownCommand(command)
    const { bin, prefix } = resolveAgfInvocation(process.argv[1], process.execPath, process.execArgv)
    const childArgs = [...prefix, command, ...args]
    if (opts.dir) childArgs.push('-d', opts.dir)

    const child = spawn(bin, childArgs, {
      cwd: opts.cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill()
          reject(new Error(`agf ${command} timed out after ${opts.timeoutMs}ms`))
        }, opts.timeoutMs)
      : null

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)

      if (code !== 0 && code !== 1) {
        reject(new Error(`agf ${command} exited with code ${code}: ${stderr}`))
        return
      }

      try {
        const trimmed = stdout.trim()
        if (!trimmed) {
          reject(new Error(`agf ${command} produced no output`))
          return
        }
        const envelope = JSON.parse(trimmed) as OutputEnvelope<T>
        resolve({ envelope, stdout: trimmed })
      } catch (err) {
        reject(
          new Error(`agf ${command} produced invalid JSON: ${(err as Error).message}. stdout: ${stdout.slice(0, 200)}`),
        )
      }
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(new Error(`agf ${command} failed to spawn: ${err.message}`))
    })
  })
}

export async function runAgfOk<T = unknown>(command: string, args: string[], opts?: AgfRunOptions): Promise<T> {
  const result = await runAgf<T>(command, args, opts)
  if (!result.envelope.ok) {
    throw new McpGraphError(`agf ${command} returned error: ${result.envelope.code} — ${result.envelope.error}`)
  }
  return result.envelope.data as T
}
