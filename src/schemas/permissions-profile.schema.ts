/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §CodexFeatureImport — Permission Profiles: TOML parsing + extends inheritance
 * Inspired by codex-rs config/src/permissions_toml.rs
 */

import { z } from 'zod/v4'
import {
  FileSystemSandboxKindSchema,
  FileSystemAccessModeSchema,
  FileSystemPathSchema,
  type FileSystemSandboxPolicy,
  type FileSystemSandboxEntry,
  type FileSystemAccessMode,
  type FileSystemPath,
} from './permissions.schema.js'

export const WorkspaceRootEntrySchema = z.object({
  path: z.string().min(1),
  access: FileSystemAccessModeSchema,
})

export type WorkspaceRootEntry = z.infer<typeof WorkspaceRootEntrySchema>

export const PermissionProfileTomlSchema = z.object({
  extends: z.string().optional(),
  filesystem: z.object({
    kind: FileSystemSandboxKindSchema,
    entries: z
      .array(
        z.union([
          FileSystemPathSchema,
          z.object({
            path: z.string().min(1),
            access: FileSystemAccessModeSchema,
          }),
        ]),
      )
      .optional()
      .default([]),
  }),
  network: z.object({
    kind: z.enum(['Restricted', 'Enabled']),
    domains: z
      .record(z.string(), z.enum(['Allow', 'Deny']))
      .optional()
      .default({}),
    unixSockets: z
      .record(z.string(), z.enum(['Allow', 'Deny']))
      .optional()
      .default({}),
  }),
  workspace_roots: z.array(WorkspaceRootEntrySchema).optional().default([]),
  description: z.string().optional(),
})

export type PermissionProfileToml = z.infer<typeof PermissionProfileTomlSchema>

export const BUILT_IN_PROFILE_NAMES = [':read-only', ':workspace', ':danger-full-access'] as const

export type BuiltInProfileName = (typeof BUILT_IN_PROFILE_NAMES)[number]

export const builtInProfiles: Record<BuiltInProfileName, PermissionProfileToml> = {
  ':read-only': {
    filesystem: {
      kind: 'Restricted',
      entries: [
        { path: '/', access: 'Read' as FileSystemAccessMode },
        { path: '/tmp', access: 'Write' as FileSystemAccessMode },
      ],
    },
    network: { kind: 'Restricted', domains: {}, unixSockets: {} },
    workspace_roots: [],
    description: 'Read-only access to the filesystem with write to /tmp',
  },
  ':workspace': {
    filesystem: {
      kind: 'Restricted',
      entries: [':workspace_roots'].map((p) => ({ path: p, access: 'Write' as FileSystemAccessMode })),
    },
    network: { kind: 'Restricted', domains: {}, unixSockets: {} },
    workspace_roots: [],
    description: 'Read-write access to workspace roots with restricted network',
  },
  ':danger-full-access': {
    filesystem: {
      kind: 'Unrestricted',
      entries: [],
    },
    network: { kind: 'Enabled', domains: {}, unixSockets: {} },
    workspace_roots: [],
    description: 'Full filesystem and network access (dangerous)',
  },
}

export type SpecialPath = 'Root' | 'Minimal' | 'ProjectRoots' | 'Tmpdir' | 'SlashTmp'

const SPECIAL_PATH_MAP: Record<string, SpecialPath> = {
  ':root': 'Root',
  ':workspace_roots': 'ProjectRoots',
  ':tmpdir': 'Tmpdir',
  ':slash_tmp': 'SlashTmp',
}

/** Parses a colon-prefixed special path (e.g. `:project/`) to its structured SpecialPath descriptor, or null for normal paths. */
export function parseSpecialPath(path: string): SpecialPath | null {
  const base = path.startsWith(':') ? path.split('/')[0] : null
  if (!base) return null
  return SPECIAL_PATH_MAP[base] ?? null
}

/** Returns true if the given profile name is one of the built-in permission profiles. */
export function isBuiltInProfile(name: string): boolean {
  return (BUILT_IN_PROFILE_NAMES as readonly string[]).includes(name)
}

/** Returns true if following a profile's `extends` chain revisits an already-seen profile (a cycle). */
export function chainExists(
  profileName: string,
  profiles: Record<string, PermissionProfileToml>,
  visited: Set<string>,
): boolean {
  if (visited.has(profileName)) return true
  const profile = profiles[profileName]
  if (!profile || !profile.extends) return false
  visited.add(profileName)
  return chainExists(profile.extends, profiles, visited)
}

/** Validates that a profile's `extends` target resolves without an unresolved reference or cycle. */
export function validateExtends(
  extendsName: string,
  allProfiles: Record<string, PermissionProfileToml>,
  _visited: string[],
): boolean {
  if (isBuiltInProfile(extendsName)) return true

  const profile = allProfiles[extendsName]
  if (!profile) return false

  const chain = new Set<string>([extendsName])
  let current: string | undefined = extendsName

  while (current && allProfiles[current]?.extends) {
    current = allProfiles[current]!.extends
    if (!current) break
    if (isBuiltInProfile(current)) return true
    if (chain.has(current)) return false
    if (!allProfiles[current]) return false
    chain.add(current)
  }

  return true
}

/**
 * Resolves a profile by name into a fully materialized profile, merging any `extends` parent.
 * Falls back to the built-in `:read-only` profile when the name is unknown.
 */
export function resolveProfile(
  name: string,
  customProfiles: Record<string, PermissionProfileToml>,
  workspaceRoots: string[] = [],
): PermissionProfileToml {
  const builtIn = builtInProfiles[name as BuiltInProfileName]
  if (builtIn) {
    return materializeProfile(builtIn, workspaceRoots)
  }

  const custom = customProfiles[name]
  if (!custom) {
    return builtInProfiles[':read-only']
  }

  let resolved: PermissionProfileToml

  if (custom.extends) {
    const parent = resolveProfile(custom.extends, customProfiles, workspaceRoots)
    const mergedEntries = [
      ...(parent.filesystem.entries ?? []),
      ...custom.filesystem.entries.map((e) => {
        const entry = e as Record<string, unknown>
        if (typeof entry.path === 'string') {
          return { path: entry.path as string, access: entry.access as FileSystemAccessMode }
        }
        if (entry.path && typeof entry.path === 'object') {
          return e as unknown as FileSystemSandboxEntry
        }
        if ('type' in entry) {
          return { path: entry as unknown as FileSystemPath, access: 'Write' as FileSystemAccessMode }
        }
        return e as unknown as FileSystemSandboxEntry
      }),
    ]

    resolved = {
      ...parent,
      filesystem: {
        kind: custom.filesystem.kind,
        entries: mergedEntries as PermissionProfileToml['filesystem']['entries'],
      },
      network: custom.network,
      workspace_roots: custom.workspace_roots ?? parent.workspace_roots,
      description: custom.description ?? parent.description,
    }
  } else {
    resolved = { ...custom }
  }

  return materializeProfile(resolved, workspaceRoots)
}

export interface CompileProfileOptions {
  workspaceRoots?: string[]
}

/** Compiles a parsed profile TOML into the runtime filesystem sandbox policy. */
export function compileProfile(toml: PermissionProfileToml, options?: CompileProfileOptions): FileSystemSandboxPolicy {
  const workspaceRoots = options?.workspaceRoots ?? []
  const materialized = materializeProfile(toml, workspaceRoots)
  return materialized.filesystem as unknown as FileSystemSandboxPolicy
}

function isStringEntry(e: unknown): e is { path: string; access: FileSystemAccessMode } {
  const entry = e as Record<string, unknown>
  return typeof entry.path === 'string'
}

function isObjectPathEntry(e: unknown): e is FileSystemSandboxEntry {
  const entry = e as Record<string, unknown>
  return typeof entry.path === 'object' && entry.path !== null
}

function materializeProfile(profile: PermissionProfileToml, workspaceRoots: string[]): PermissionProfileToml {
  const entries = profile.filesystem.entries.map((entry) => {
    if (isObjectPathEntry(entry)) {
      return entry as unknown as FileSystemSandboxEntry
    }

    if (isStringEntry(entry)) {
      const special = parseSpecialPath(entry.path)

      if (special === 'ProjectRoots') {
        const subpath = entry.path.includes('/') ? entry.path.slice(entry.path.indexOf('/')) : ''
        return {
          path: { type: 'Path' as const, path: workspaceRoots[0] + subpath },
          access: entry.access,
        }
      }

      return {
        path: { type: 'Path' as const, path: entry.path },
        access: entry.access,
      }
    }

    return entry as unknown as FileSystemSandboxEntry
  })

  return {
    ...profile,
    filesystem: {
      kind: profile.filesystem.kind,
      entries: entries as unknown as PermissionProfileToml['filesystem']['entries'],
    },
  }
}
