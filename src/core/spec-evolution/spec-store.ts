/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Spec Store — CRUD for spec documents, versions, and node links.
 * Supports the living spec concept: versioned documents with bidirectional node linking.
 */

import type Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'spec-store.ts' })

function generateId(): string {
  return `spec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export interface SpecDocument {
  id: string
  project_id: string
  name: string
  template_name: string | null
  file_path: string | null
  content_hash: string
  version: number
  status: string
  metadata: string | null
  created_at: string
  updated_at: string
}

export interface SpecVersion {
  id: string
  spec_id: string
  version: number
  content: string
  content_hash: string
  diff_summary: string | null
  created_at: string
}

export interface SpecNodeLink {
  id: string
  spec_id: string
  node_id: string
  section_title: string | null
  link_type: string
  created_at: string
}

export interface RegisterParams {
  projectId: string
  name: string
  templateName?: string
  content: string
  filePath?: string
}

export class SpecStore {
  constructor(private readonly db: Database.Database) {}

  register(params: RegisterParams): SpecDocument {
    const now = new Date().toISOString()
    const id = generateId()
    const hash = contentHash(params.content)

    this.db
      .prepare(
        `
      INSERT INTO spec_documents (id, project_id, name, template_name, file_path, content_hash, version, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'draft', ?, ?)
    `,
      )
      .run(id, params.projectId, params.name, params.templateName ?? null, params.filePath ?? null, hash, now, now)

    // Archive initial version
    this.db
      .prepare(
        `
      INSERT INTO spec_document_versions (id, spec_id, version, content, content_hash, diff_summary, created_at)
      VALUES (?, ?, 1, ?, ?, 'Initial version', ?)
    `,
      )
      .run(generateId(), id, params.content, hash, now)

    log.info('Spec document registered', { id, name: params.name })

    const resultValue = this.get(id)
    if (!resultValue) throw new McpGraphError(`Failed to retrieve spec document after register: ${id}`)
    return resultValue
  }

  update(specId: string, newContent: string, diffSummary: string): void {
    const current = this.get(specId)
    if (!current) throw new McpGraphError(`Spec not found: ${specId}`)

    const now = new Date().toISOString()
    const hash = contentHash(newContent)
    const newVersion = current.version + 1

    // Update current document
    this.db
      .prepare(
        `
      UPDATE spec_documents SET content_hash = ?, version = ?, updated_at = ? WHERE id = ?
    `,
      )
      .run(hash, newVersion, now, specId)

    // Archive new version
    this.db
      .prepare(
        `
      INSERT INTO spec_document_versions (id, spec_id, version, content, content_hash, diff_summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(generateId(), specId, newVersion, newContent, hash, diffSummary, now)

    log.info('Spec document updated', { specId, version: newVersion })
  }

  get(specId: string): SpecDocument | undefined {
    return this.db.prepare('SELECT * FROM spec_documents WHERE id = ?').get(specId) as SpecDocument | undefined
  }

  getHistory(specId: string): SpecVersion[] {
    // Return all versions except the latest (current), ordered descending
    const current = this.get(specId)
    if (!current) return []

    return this.db
      .prepare('SELECT * FROM spec_document_versions WHERE spec_id = ? AND version < ? ORDER BY version DESC')
      .all(specId, current.version) as SpecVersion[]
  }

  remove(specId: string): void {
    // CASCADE deletes versions and links
    this.db.prepare('DELETE FROM spec_document_versions WHERE spec_id = ?').run(specId)
    this.db.prepare('DELETE FROM spec_node_links WHERE spec_id = ?').run(specId)
    this.db.prepare('DELETE FROM spec_documents WHERE id = ?').run(specId)
    log.info('Spec document removed', { specId })
  }

  linkNode(specId: string, nodeId: string, sectionTitle: string, linkType: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `
      INSERT INTO spec_node_links (id, spec_id, node_id, section_title, link_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(generateId(), specId, nodeId, sectionTitle, linkType, now)
  }

  getLinksForSpec(specId: string): SpecNodeLink[] {
    return this.db
      .prepare('SELECT * FROM spec_node_links WHERE spec_id = ? ORDER BY created_at')
      .all(specId) as SpecNodeLink[]
  }

  getLinksForNode(nodeId: string): SpecNodeLink[] {
    return this.db
      .prepare('SELECT * FROM spec_node_links WHERE node_id = ? ORDER BY created_at')
      .all(nodeId) as SpecNodeLink[]
  }
}
