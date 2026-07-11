/*!
 * install-gate — security gate for plugin installation.
 *
 * WHY: plugins carry remote code. Validate manifest schema + scan for
 * suspicious entryPoint patterns BEFORE any install; never auto-execute.
 * Pure function — no I/O, fully testable without a real filesystem.
 *
 * Composes with: plugin-store.ts (caller checks gate first),
 * schemas/plugin.schema.ts (manifest shape), plugin-registry.ts (enable gate).
 */

import { PluginManifestSchema } from '../../schemas/plugin.schema.js'

export interface InstallGateResult {
  ok: boolean
  reason?: string
}

/** Patterns in entryPoint that suggest shell injection or remote code execution. */
const SUSPICIOUS_PATTERNS = [
  /child_process/i,
  /exec\s*\(/i,
  /eval\s*\(/i,
  /require\s*\(\s*['"`]child_process/i,
  /https?:\/\//i,
  /curl\s+/i,
  /wget\s+/i,
  /bash\s+-c/i,
]

function hasSuspiciousEntryPoint(entryPoint: string): boolean {
  return SUSPICIOUS_PATTERNS.some((p) => p.test(entryPoint))
}

/**
 * Validates a plugin manifest before installation.
 * Returns { ok: true } when safe to proceed, or { ok: false, reason } to block.
 */
export function validateInstallGate(manifest: unknown): InstallGateResult {
  const parsed = PluginManifestSchema.safeParse(manifest)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const field = first?.path.join('.') ?? 'unknown'
    const msg = first?.message ?? 'invalid'
    return { ok: false, reason: `Manifest validation failed on "${field}": ${msg}` }
  }

  if (hasSuspiciousEntryPoint(parsed.data.entryPoint)) {
    return {
      ok: false,
      reason: 'Security gate: suspicious pattern detected in entryPoint (possible remote code execution).',
    }
  }

  return { ok: true }
}
