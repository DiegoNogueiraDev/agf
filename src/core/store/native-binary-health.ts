/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * native-binary-health — a native `.node` addon (better-sqlite3, onnxruntime)
 * can get silently swapped for the wrong platform's build by a concurrent
 * cross-compile pack run (this happened for real: a Windows DLL replaced the
 * real binary mid-session). The resulting dlopen/require error is cryptic —
 * this reads the first bytes and compares against the known-valid native
 * executable formats so the failure is diagnosed, not guessed at.
 *
 * Magic bytes checked (first 4 bytes, native Unix formats):
 *   - ELF (Linux):        7f 45 4c 46
 *   - Mach-O 32-bit:      fe ed fa ce (BE) / ce fa ed fe (LE)
 *   - Mach-O 64-bit:      fe ed fa cf (BE) / cf fa ed fe (LE)
 *   - Mach-O fat/universal: ca fe ba be (BE) / be ba fe ca (LE)
 * Rejected as a platform mismatch (first 2 bytes, Windows PE/DLL): 4d 5a ("MZ").
 */
import { existsSync, readFileSync } from 'node:fs'

export interface NativeBinaryHealth {
  ok: boolean
  /** 'missing' when the file doesn't exist; a mismatch message otherwise. Absent when ok. */
  reason?: string
}

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46])
const MACHO_MAGICS = [
  Buffer.from([0xfe, 0xed, 0xfa, 0xce]),
  Buffer.from([0xce, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xfe, 0xed, 0xfa, 0xcf]),
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
  Buffer.from([0xbe, 0xba, 0xfe, 0xca]),
]
const MZ_MAGIC = Buffer.from([0x4d, 0x5a])

/** Check a native `.node` binary's first bytes against known-valid executable formats. */
export function checkNativeBinary(path: string): NativeBinaryHealth {
  if (!existsSync(path)) return { ok: false, reason: 'missing' }

  const fd = readFileSync(path)
  const head = fd.subarray(0, 4)

  if (head.subarray(0, 4).equals(ELF_MAGIC)) return { ok: true }
  if (MACHO_MAGICS.some((magic) => head.subarray(0, 4).equals(magic))) return { ok: true }

  if (head.subarray(0, 2).equals(MZ_MAGIC)) {
    return {
      ok: false,
      reason:
        'magic bytes mismatch (Windows MZ/DLL found where a Unix native binary was expected) — ' +
        'native binary swapped by a concurrent process, run npm rebuild better-sqlite3',
    }
  }

  return {
    ok: false,
    reason: 'magic bytes mismatch (unrecognized native binary) — run npm rebuild better-sqlite3',
  }
}
