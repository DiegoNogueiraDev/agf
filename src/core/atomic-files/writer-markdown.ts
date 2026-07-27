/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-atomic-files-writer — Task 1.2: Markdown writer with managed block markers.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import type { AtomicFile, AtomicFileMode, WriteResult } from './types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'writer-markdown.ts' })

const markerStart = (id: string) => `<!-- MCP-GRAPH:MANAGED-START:${id} -->`
const markerEnd = (id: string) => `<!-- MCP-GRAPH:MANAGED-END:${id} -->`

export function extractManagedBlock(content: string, fileId: string): string | null {
  const start = markerStart(fileId)
  const end = markerEnd(fileId)
  const si = content.indexOf(start)
  const ei = content.indexOf(end)
  if (si === -1 || ei === -1 || ei <= si) return null
  return content
    .slice(si + start.length, ei)
    .replace(/^\n/, '')
    .replace(/\n$/, '')
}

export function replaceManagedBlock(content: string, fileId: string, newBlock: string): string {
  const start = markerStart(fileId)
  const end = markerEnd(fileId)
  const si = content.indexOf(start)
  const ei = content.indexOf(end)
  if (si === -1 || ei === -1) return content
  return content.slice(0, si) + start + '\n' + newBlock + '\n' + end + content.slice(ei + end.length)
}

function buildBlock(fileId: string, managedContent: string): string {
  return `${markerStart(fileId)}\n${managedContent}\n${markerEnd(fileId)}\n`
}

function hashOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function hashFilePath(filePath: string, fileId: string): string {
  return path.join(path.dirname(filePath), '.mcp-graph-backups', `${fileId}.hash`)
}

function saveBlockHash(filePath: string, fileId: string, blockContent: string): void {
  const hPath = hashFilePath(filePath, fileId)
  fs.mkdirSync(path.dirname(hPath), { recursive: true })
  fs.writeFileSync(hPath, hashOf(blockContent), 'utf8')
}

function detectTampering(filePath: string, fileId: string, currentBlockContent: string): boolean {
  const hPath = hashFilePath(filePath, fileId)
  if (!fs.existsSync(hPath)) return false
  const stored = fs.readFileSync(hPath, 'utf8').trim()
  return hashOf(currentBlockContent) !== stored
}

export async function write(file: AtomicFile, mode: AtomicFileMode): Promise<WriteResult> {
  const { fileId, path: filePath, managedContent } = file
  const exists = fs.existsSync(filePath)

  // --- init + no file ---
  if (!exists) {
    const newContent = buildBlock(fileId, managedContent)
    await atomicWrite(filePath, newContent)
    saveBlockHash(filePath, fileId, managedContent)
    return { status: 'created' }
  }

  const current = fs.readFileSync(filePath, 'utf8')
  const hasMarkers = current.includes(markerStart(fileId))

  // --- init + markers present: noop ---
  if (mode === 'init' && hasMarkers) {
    const existingBlock = extractManagedBlock(current, fileId)
    if (existingBlock === managedContent) return { status: 'noop' }
    return { status: 'noop' }
  }

  // --- update + markers present ---
  if (mode === 'update' && hasMarkers) {
    const existingBlock = extractManagedBlock(current, fileId)

    // Detect user tampering: hash of current block vs stored hash
    const tampered = existingBlock !== null && detectTampering(filePath, fileId, existingBlock)
    if (tampered) {
      log.warn('managed block tampered — system reconquering', { fileId, filePath })
      fs.writeFileSync(filePath + '.user-modified.bak', current, 'utf8')
    }

    if (!tampered && existingBlock === managedContent) {
      saveBlockHash(filePath, fileId, managedContent)
      return { status: 'noop' }
    }

    const updated = replaceManagedBlock(current, fileId, managedContent)
    const backupPath = await backup(filePath, current)
    await atomicWrite(filePath, updated)
    saveBlockHash(filePath, fileId, managedContent)
    return { status: 'updated', backupPath, tampered: tampered || undefined }
  }

  // --- init + no markers: append ---
  if (mode === 'init' && !hasMarkers) {
    const suffix = current.endsWith('\n') ? '' : '\n'
    const updated = current + suffix + '\n' + buildBlock(fileId, managedContent)
    const backupPath = await backup(filePath, current)
    await atomicWrite(filePath, updated)
    saveBlockHash(filePath, fileId, managedContent)
    return { status: 'updated', backupPath }
  }

  // --- update + no markers: append (treat like init) ---
  const suffix = current.endsWith('\n') ? '' : '\n'
  const updated = current + suffix + '\n' + buildBlock(fileId, managedContent)
  const backupPath = await backup(filePath, current)
  await atomicWrite(filePath, updated)
  saveBlockHash(filePath, fileId, managedContent)
  return { status: 'updated', backupPath }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `.mcp-graph-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    fs.writeFileSync(tmp, content, 'utf8')
    fs.renameSync(tmp, filePath)
  } catch (err) {
    try {
      fs.unlinkSync(tmp)
    } catch (e) {
      log.debug('intentional swallow', { error: e, reason: 'tmp file already gone, cleanup not needed' })
    }
    throw err
  }
}

async function backup(filePath: string, content: string): Promise<string> {
  const dir = path.dirname(filePath)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const rel = path.basename(filePath)
  const backupDir = path.join(dir, '.mcp-graph-backups', ts)
  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, rel)
  fs.writeFileSync(backupPath, content, 'utf8')
  return backupPath
}
