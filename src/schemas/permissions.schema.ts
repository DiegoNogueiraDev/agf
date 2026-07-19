/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §CodexFeatureImport — Permissions System: FileSystem/Network sandbox policy types
 * Inspired by codex-rs protocol/src/permissions.rs
 */

import { z } from 'zod/v4'
export const FileSystemAccessMode = {
  Read: 'Read',
  Write: 'Write',
  Deny: 'Deny',
} as const

export type FileSystemAccessMode = (typeof FileSystemAccessMode)[keyof typeof FileSystemAccessMode]

export const FileSystemAccessModeSchema = z.enum(['Read', 'Write', 'Deny'])

export const FileSystemSandboxKind = {
  Restricted: 'Restricted',
  Unrestricted: 'Unrestricted',
  ExternalSandbox: 'ExternalSandbox',
} as const

export type FileSystemSandboxKind = (typeof FileSystemSandboxKind)[keyof typeof FileSystemSandboxKind]

export const FileSystemSandboxKindSchema = z.enum(['Restricted', 'Unrestricted', 'ExternalSandbox'])

export const FileSystemSpecialPathType = {
  Root: 'Root',
  Minimal: 'Minimal',
  ProjectRoots: 'ProjectRoots',
  Tmpdir: 'Tmpdir',
  SlashTmp: 'SlashTmp',
} as const

export type FileSystemSpecialPathType = (typeof FileSystemSpecialPathType)[keyof typeof FileSystemSpecialPathType]

export const FileSystemSpecialPathTypeSchema = z.enum(['Root', 'Minimal', 'ProjectRoots', 'Tmpdir', 'SlashTmp'])

export const FileSystemPathSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Path'), path: z.string().min(1) }),
  z.object({
    type: z.literal('GlobPattern'),
    pattern: z
      .string()
      .min(1)
      .refine(
        (val) => {
          try {
            const globRegex = new RegExp(
              '^' + val.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$',
            )
            globRegex.test('test')
            return true
          } catch {
            return false
          }
        },
        { message: 'Invalid glob pattern' },
      ),
  }),
  z.object({ type: z.literal('Special'), value: FileSystemSpecialPathTypeSchema }),
])

export type FileSystemPath = z.infer<typeof FileSystemPathSchema>

export const FileSystemSandboxEntrySchema = z.object({
  path: FileSystemPathSchema,
  access: FileSystemAccessModeSchema,
})

export type FileSystemSandboxEntry = z.infer<typeof FileSystemSandboxEntrySchema>

export const FileSystemSandboxPolicySchema = z.object({
  kind: FileSystemSandboxKindSchema,
  entries: z.array(FileSystemSandboxEntrySchema).optional().default([]),
})

export type FileSystemSandboxPolicy = z.infer<typeof FileSystemSandboxPolicySchema>

const NetworkDomainActionSchema = z.enum(['Allow', 'Deny'])

export const NetworkSandboxKind = {
  Restricted: 'Restricted',
  Enabled: 'Enabled',
} as const

export type NetworkSandboxKind = (typeof NetworkSandboxKind)[keyof typeof NetworkSandboxKind]

export const NetworkSandboxKindSchema = z.enum(['Restricted', 'Enabled'])

export const NetworkSandboxPolicySchema = z.object({
  kind: NetworkSandboxKindSchema,
  domains: z.record(z.string(), NetworkDomainActionSchema).optional().default({}),
  unixSockets: z.record(z.string(), NetworkDomainActionSchema).optional().default({}),
})

export type NetworkSandboxPolicy = z.infer<typeof NetworkSandboxPolicySchema>

export const PermissionsProfileSchema = z.object({
  name: z.string().min(1),
  extends: z.string().optional(),
  filesystem: FileSystemSandboxPolicySchema,
  network: NetworkSandboxPolicySchema,
})

export type PermissionsProfile = z.infer<typeof PermissionsProfileSchema>

export const builtInPermissionProfiles = [':read-only', ':workspace', ':danger-full-access'] as const

/** Returns true if the given name matches one of the built-in permission profile identifiers. */
export function isValidBuiltInProfile(name: string): boolean {
  return (builtInPermissionProfiles as readonly string[]).includes(name)
}
