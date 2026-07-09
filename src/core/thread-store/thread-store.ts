/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { mkdirSync, existsSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface RolloutEntry {
  kind: string
  content?: string
  toolName?: string
  timestamp?: string
  [key: string]: unknown
}

export interface StoredThread {
  id: string
  rolloutPath: string
  createdAt: number
  updatedAt: number
  source: string
  modelProvider: string
  cwd: string
  title: string
  preview: string | null
  model: string | null
  gitSha: string | null
  gitBranch: string | null
  archived: number
  archivedAt: number | null
  tokensUsed: number
  sandboxPolicy: string | null
  approvalMode: string | null
  gitOriginUrl: string | null
  cliVersion: string | null
  firstUserMessage: string | null
  agentNickname: string | null
  agentRole: string | null
  reasoningEffort: string | null
}

export interface ThreadPage {
  threads: StoredThread[]
  hasMore: boolean
  total?: number
}

export interface CreateThreadParams {
  id: string
  source: string
  modelProvider: string
  cwd: string
  title: string
  preview?: string | null
  model?: string | null
  gitSha?: string | null
  gitBranch?: string | null
  tokensUsed?: number
  sandboxPolicy?: string | null
  approvalMode?: string | null
  gitOriginUrl?: string | null
  cliVersion?: string | null
  firstUserMessage?: string | null
  agentNickname?: string | null
  agentRole?: string | null
  reasoningEffort?: string | null
}

export interface ResumeThreadParams {
  id: string
}

export interface AppendThreadItemsParams {
  id: string
  items: RolloutEntry[]
}

export interface LoadThreadHistoryParams {
  id: string
  limit?: number
  offset?: number
}

export interface ReadThreadParams {
  id: string
}

export interface ListThreadsParams {
  limit?: number
  offset?: number
  includeArchived?: boolean
}

export interface SearchThreadsParams {
  query: string
  limit?: number
  offset?: number
  includeArchived?: boolean
}

export interface ArchiveThreadParams {
  id: string
}

export interface UpdateThreadMetadataParams {
  id: string
  title?: string
  preview?: string | null
  model?: string | null
  modelProvider?: string
  tokensUsed?: number
  sandboxPolicy?: string | null
  approvalMode?: string | null
  gitOriginUrl?: string | null
  cliVersion?: string | null
  firstUserMessage?: string | null
  agentNickname?: string | null
  agentRole?: string | null
  reasoningEffort?: string | null
}

export interface ThreadStore {
  createThread(params: CreateThreadParams): Promise<void>
  resumeThread(params: ResumeThreadParams): Promise<StoredThread | null>
  appendItems(params: AppendThreadItemsParams): Promise<void>
  persistThread(threadId: string): Promise<void>
  flushThread(threadId: string): Promise<void>
  shutdownThread(threadId: string): Promise<void>
  discardThread(threadId: string): Promise<void>
  loadHistory(params: LoadThreadHistoryParams): Promise<RolloutEntry[]>
  readThread(params: ReadThreadParams): Promise<StoredThread | null>
  listThreads(params: ListThreadsParams): Promise<ThreadPage>
  searchThreads(params: SearchThreadsParams): Promise<ThreadPage>
  archiveThread(params: ArchiveThreadParams): Promise<void>
  unarchiveThread(params: ArchiveThreadParams): Promise<void>
  updateThreadMetadata(params: UpdateThreadMetadataParams): Promise<StoredThread>
}

function rowToThread(row: Record<string, unknown>): StoredThread {
  return {
    id: row.id as string,
    rolloutPath: row.rollout_path as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    source: row.source as string,
    modelProvider: row.model_provider as string,
    cwd: row.cwd as string,
    title: row.title as string,
    preview: (row.preview as string) ?? null,
    model: (row.model as string) ?? null,
    gitSha: (row.git_sha as string) ?? null,
    gitBranch: (row.git_branch as string) ?? null,
    archived: (row.archived as number) ?? 0,
    archivedAt: (row.archived_at as number) ?? null,
    tokensUsed: (row.tokens_used as number) ?? 0,
    sandboxPolicy: (row.sandbox_policy as string) ?? null,
    approvalMode: (row.approval_mode as string) ?? null,
    gitOriginUrl: (row.git_origin_url as string) ?? null,
    cliVersion: (row.cli_version as string) ?? null,
    firstUserMessage: (row.first_user_message as string) ?? null,
    agentNickname: (row.agent_nickname as string) ?? null,
    agentRole: (row.agent_role as string) ?? null,
    reasoningEffort: (row.reasoning_effort as string) ?? null,
  }
}

export class LocalThreadStore implements ThreadStore {
  private db: Database.Database
  private baseDir: string

  constructor(db: Database.Database, baseDir: string) {
    this.db = db
    this.baseDir = baseDir
  }

  private sessionsDir(): string {
    return join(this.baseDir, 'sessions')
  }

  private jsonlPath(threadId: string): string {
    return join(this.sessionsDir(), `rollout-${threadId}.jsonl`)
  }

  async createThread(params: CreateThreadParams): Promise<void> {
    const now = Date.now()
    const rolloutPath = this.jsonlPath(params.id)

    const dir = dirname(rolloutPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(rolloutPath, '', 'utf-8')

    this.db
      .prepare(
        `INSERT INTO threads (
          id, rollout_path, created_at, updated_at, source, model_provider, cwd,
          title, preview, model, git_sha, git_branch, tokens_used,
          sandbox_policy, approval_mode, git_origin_url, cli_version,
          first_user_message, agent_nickname, agent_role, reasoning_effort
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )`,
      )
      .run(
        params.id,
        rolloutPath,
        now,
        now,
        params.source,
        params.modelProvider,
        params.cwd,
        params.title,
        params.preview ?? null,
        params.model ?? null,
        params.gitSha ?? null,
        params.gitBranch ?? null,
        params.tokensUsed ?? 0,
        params.sandboxPolicy ?? 'restricted',
        params.approvalMode ?? 'on-request',
        params.gitOriginUrl ?? null,
        params.cliVersion ?? null,
        params.firstUserMessage ?? null,
        params.agentNickname ?? null,
        params.agentRole ?? null,
        params.reasoningEffort ?? null,
      )
  }

  async resumeThread(params: ResumeThreadParams): Promise<StoredThread | null> {
    return this.readThread({ id: params.id })
  }

  async appendItems(params: AppendThreadItemsParams): Promise<void> {
    const thread = await this.readThread({ id: params.id })
    if (!thread) return

    const path = this.jsonlPath(params.id)
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    for (const item of params.items) {
      const line = JSON.stringify({ ...item, timestamp: item.timestamp ?? new Date().toISOString() }) + '\n'
      appendFileSync(path, line, 'utf-8')
    }

    this.db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(Date.now(), params.id)
  }

  async persistThread(_threadId: string): Promise<void> {
    return
  }

  async flushThread(_threadId: string): Promise<void> {
    return
  }

  async shutdownThread(_threadId: string): Promise<void> {
    return
  }

  async discardThread(threadId: string): Promise<void> {
    this.db.prepare('DELETE FROM threads WHERE id = ?').run(threadId)
  }

  async loadHistory(params: LoadThreadHistoryParams): Promise<RolloutEntry[]> {
    const path = this.jsonlPath(params.id)
    if (!existsSync(path)) return []

    const limit = params.limit ?? 100
    const offset = params.offset ?? 0

    try {
      const raw = readFileSync(path, 'utf-8')
      const allLines = raw.split('\n').filter((l) => l.trim())
      const paginated = allLines.slice(offset, offset + limit)
      return paginated.map((l) => JSON.parse(l) as RolloutEntry)
    } catch {
      return []
    }
  }

  async readThread(params: ReadThreadParams): Promise<StoredThread | null> {
    const row = this.db.prepare('SELECT * FROM threads WHERE id = ?').get(params.id) as
      Record<string, unknown> | undefined
    if (!row) return null
    return rowToThread(row)
  }

  async listThreads(params: ListThreadsParams): Promise<ThreadPage> {
    const limit = Math.min(params.limit ?? 20, 500)
    const offset = params.offset ?? 0
    const archivedFilter = params.includeArchived ? '' : 'WHERE archived = 0'

    const countRow = this.db.prepare(`SELECT COUNT(*) as total FROM threads ${archivedFilter}`).get() as {
      total: number
    }
    const total = countRow.total

    const rows = this.db
      .prepare(`SELECT * FROM threads ${archivedFilter} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(limit + 1, offset) as Record<string, unknown>[]

    const hasMore = rows.length > limit
    const threads = rows.slice(0, limit).map(rowToThread)

    return { threads, hasMore, total }
  }

  async searchThreads(params: SearchThreadsParams): Promise<ThreadPage> {
    const limit = Math.min(params.limit ?? 20, 500)
    const offset = params.offset ?? 0
    const pattern = `%${params.query}%`
    const archivedFilter = params.includeArchived ? '' : 'AND archived = 0'

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as total FROM threads WHERE (title LIKE ? OR preview LIKE ?) ${archivedFilter}`)
      .get(pattern, pattern) as { total: number }
    const total = countRow.total

    const rows = this.db
      .prepare(
        `SELECT * FROM threads WHERE (title LIKE ? OR preview LIKE ?) ${archivedFilter} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(pattern, pattern, limit + 1, offset) as Record<string, unknown>[]

    const hasMore = rows.length > limit
    const threads = rows.slice(0, limit).map(rowToThread)

    return { threads, hasMore, total }
  }

  async archiveThread(params: ArchiveThreadParams): Promise<void> {
    this.db.prepare('UPDATE threads SET archived = 1, archived_at = ? WHERE id = ?').run(Date.now(), params.id)
  }

  async unarchiveThread(params: ArchiveThreadParams): Promise<void> {
    this.db.prepare('UPDATE threads SET archived = 0, archived_at = NULL WHERE id = ?').run(params.id)
  }

  async updateThreadMetadata(params: UpdateThreadMetadataParams): Promise<StoredThread> {
    const sets: string[] = []
    const values: unknown[] = []

    if (params.title !== undefined) {
      sets.push('title = ?')
      values.push(params.title)
    }
    if (params.preview !== undefined) {
      sets.push('preview = ?')
      values.push(params.preview)
    }
    if (params.model !== undefined) {
      sets.push('model = ?')
      values.push(params.model)
    }
    if (params.modelProvider !== undefined) {
      sets.push('model_provider = ?')
      values.push(params.modelProvider)
    }
    if (params.tokensUsed !== undefined) {
      sets.push('tokens_used = ?')
      values.push(params.tokensUsed)
    }
    if (params.sandboxPolicy !== undefined) {
      sets.push('sandbox_policy = ?')
      values.push(params.sandboxPolicy)
    }
    if (params.approvalMode !== undefined) {
      sets.push('approval_mode = ?')
      values.push(params.approvalMode)
    }
    if (params.gitOriginUrl !== undefined) {
      sets.push('git_origin_url = ?')
      values.push(params.gitOriginUrl)
    }
    if (params.cliVersion !== undefined) {
      sets.push('cli_version = ?')
      values.push(params.cliVersion)
    }
    if (params.firstUserMessage !== undefined) {
      sets.push('first_user_message = ?')
      values.push(params.firstUserMessage)
    }
    if (params.agentNickname !== undefined) {
      sets.push('agent_nickname = ?')
      values.push(params.agentNickname)
    }
    if (params.agentRole !== undefined) {
      sets.push('agent_role = ?')
      values.push(params.agentRole)
    }
    if (params.reasoningEffort !== undefined) {
      sets.push('reasoning_effort = ?')
      values.push(params.reasoningEffort)
    }

    if (sets.length > 0) {
      sets.push('updated_at = ?')
      values.push(Date.now())
      values.push(params.id)
      this.db.prepare(`UPDATE threads SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    const row = this.db.prepare('SELECT * FROM threads WHERE id = ?').get(params.id) as Record<string, unknown>
    return rowToThread(row)
  }
}
