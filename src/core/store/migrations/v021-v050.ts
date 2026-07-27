/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SQLite migration definitions for versions 21–50.
 * Pure data — no runtime logic. Imported and merged by index.ts.
 */

import type { Migration } from './v001-v020.js'

export const migrationsV021_V050: Migration[] = [
  {
    version: 21,
    description:
      'Syntax Enrichment — language, docstring, source_snippet, visibility columns + FTS5 rebuild with docstring',
    sql: `
      ALTER TABLE code_symbols ADD COLUMN language TEXT DEFAULT 'typescript';
      ALTER TABLE code_symbols ADD COLUMN docstring TEXT;
      ALTER TABLE code_symbols ADD COLUMN source_snippet TEXT;
      ALTER TABLE code_symbols ADD COLUMN visibility TEXT DEFAULT 'public';

      CREATE INDEX IF NOT EXISTS idx_code_sym_language ON code_symbols(language);

      -- Rebuild FTS5 to include docstring as searchable field
      DROP TRIGGER IF EXISTS code_fts_insert;
      DROP TRIGGER IF EXISTS code_fts_delete;
      DROP TRIGGER IF EXISTS code_fts_update;
      DROP TABLE IF EXISTS code_symbols_fts;

      CREATE VIRTUAL TABLE code_symbols_fts USING fts5(
        name, file, signature, docstring,
        content='code_symbols', content_rowid='rowid'
      );

      CREATE TRIGGER code_fts_insert AFTER INSERT ON code_symbols BEGIN
        INSERT INTO code_symbols_fts(rowid, name, file, signature, docstring)
          VALUES (NEW.rowid, NEW.name, NEW.file, COALESCE(NEW.signature, ''), COALESCE(NEW.docstring, ''));
      END;

      CREATE TRIGGER code_fts_delete AFTER DELETE ON code_symbols BEGIN
        INSERT INTO code_symbols_fts(code_symbols_fts, rowid, name, file, signature, docstring)
          VALUES ('delete', OLD.rowid, OLD.name, OLD.file, COALESCE(OLD.signature, ''), COALESCE(OLD.docstring, ''));
      END;

      CREATE TRIGGER code_fts_update AFTER UPDATE ON code_symbols BEGIN
        INSERT INTO code_symbols_fts(code_symbols_fts, rowid, name, file, signature, docstring)
          VALUES ('delete', OLD.rowid, OLD.name, OLD.file, COALESCE(OLD.signature, ''), COALESCE(OLD.docstring, ''));
        INSERT INTO code_symbols_fts(rowid, name, file, signature, docstring)
          VALUES (NEW.rowid, NEW.name, NEW.file, COALESCE(NEW.signature, ''), COALESCE(NEW.docstring, ''));
      END;

      -- Repopulate FTS5 from existing data (critical for DBs that already had symbols)
      INSERT INTO code_symbols_fts(code_symbols_fts) VALUES('rebuild');
    `,
  },
  {
    version: 22,
    description: 'DreamMode — dream_cycles and dream_archive tables for REM-inspired knowledge consolidation',
    sql: `
      CREATE TABLE IF NOT EXISTS dream_cycles (
        id              TEXT PRIMARY KEY,
        status          TEXT NOT NULL,
        config          TEXT NOT NULL,
        result          TEXT,
        started_at      TEXT NOT NULL,
        completed_at    TEXT,
        error_message   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_dream_cycles_status ON dream_cycles(status);
      CREATE INDEX IF NOT EXISTS idx_dream_cycles_started ON dream_cycles(started_at);

      CREATE TABLE IF NOT EXISTS dream_archive (
        id              TEXT PRIMARY KEY,
        original_doc_id TEXT NOT NULL,
        title           TEXT NOT NULL,
        source_type     TEXT NOT NULL,
        quality_score   REAL,
        reason          TEXT NOT NULL,
        archived_at     TEXT NOT NULL,
        cycle_id        TEXT REFERENCES dream_cycles(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_dream_archive_cycle ON dream_archive(cycle_id);
      CREATE INDEX IF NOT EXISTS idx_dream_archive_reason ON dream_archive(reason);
    `,
  },
  {
    version: 23,
    description: 'Node changelog for audit trail',
    sql: `
      CREATE TABLE IF NOT EXISTS node_changelog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_changelog_node ON node_changelog(node_id);
      CREATE INDEX IF NOT EXISTS idx_changelog_project ON node_changelog(project_id);
    `,
  },
  {
    version: 24,
    description: 'Add test_files column to nodes for linking test files to ACs',
    sql: `
      ALTER TABLE nodes ADD COLUMN test_files TEXT; -- JSON array of test file paths
    `,
  },
  {
    version: 25,
    description: 'Task templates for reusable task patterns',
    sql: `
      CREATE TABLE IF NOT EXISTS task_templates (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id),
        name        TEXT NOT NULL,
        description TEXT NOT NULL,
        subtasks    TEXT NOT NULL, -- JSON array of template subtasks
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        UNIQUE(project_id, name)
      );
      CREATE INDEX IF NOT EXISTS idx_templates_project ON task_templates(project_id);
    `,
  },
  {
    version: 26,
    description: 'Flow snapshots for Cumulative Flow Diagrams',
    sql: `
      CREATE TABLE IF NOT EXISTS flow_snapshots (
        id               TEXT PRIMARY KEY,
        project_id       TEXT NOT NULL,
        snapshot_date    TEXT NOT NULL,
        backlog_count    INTEGER DEFAULT 0,
        ready_count      INTEGER DEFAULT 0,
        in_progress_count INTEGER DEFAULT 0,
        blocked_count    INTEGER DEFAULT 0,
        done_count       INTEGER DEFAULT 0,
        sprint           TEXT,
        created_at       TEXT NOT NULL,
        UNIQUE(project_id, snapshot_date, sprint)
      );
      CREATE INDEX IF NOT EXISTS idx_flow_snapshots_project_date ON flow_snapshots(project_id, snapshot_date);
    `,
  },
  {
    version: 27,
    description: 'Query cache table for semantic query caching',
    sql: `
      CREATE TABLE IF NOT EXISTS query_cache (
        query_hash    TEXT NOT NULL UNIQUE,
        query_text    TEXT NOT NULL,
        embedding     BLOB,
        result_json   TEXT NOT NULL,
        tokens_saved  INTEGER NOT NULL DEFAULT 0,
        hit_count     INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        expires_at    TEXT NOT NULL
      );
    `,
  },
  {
    version: 28,
    description: 'Session chunks table for context delta tracking',
    sql: `
      CREATE TABLE IF NOT EXISTS session_chunks (
        session_id    TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        tokens        INTEGER NOT NULL DEFAULT 0,
        tracked_at    TEXT NOT NULL,
        UNIQUE(session_id, content_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_session_chunks_session_id ON session_chunks(session_id);
    `,
  },
  {
    version: 29,
    description: 'Relevance feedback table for implicit RAG quality signals',
    sql: `
      CREATE TABLE IF NOT EXISTS relevance_feedback (
        id           TEXT PRIMARY KEY,
        session_id   TEXT NOT NULL,
        query        TEXT NOT NULL,
        document_id  TEXT NOT NULL,
        signal       TEXT NOT NULL,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_relevance_feedback_session ON relevance_feedback(session_id);
      CREATE INDEX IF NOT EXISTS idx_relevance_feedback_doc ON relevance_feedback(document_id);
    `,
  },
  {
    version: 30,
    description: 'v7.0 schema cleanup: backfill NULLs for required fields + rebuild FTS indexes',
    sql: `
      -- Backfill NULL status, priority, blocked fields (now required in v7)
      UPDATE nodes SET status = 'backlog' WHERE status IS NULL;
      UPDATE nodes SET priority = 3 WHERE priority IS NULL;
      UPDATE nodes SET blocked = 0 WHERE blocked IS NULL OR blocked = '';

      -- Rebuild nodes FTS index with fresh data
      DELETE FROM nodes_fts;
      INSERT INTO nodes_fts(rowid, title, description)
        SELECT rowid, COALESCE(title, ''), COALESCE(description, '') FROM nodes;

      -- Rebuild docs_cache FTS index (lib docs)
      INSERT OR IGNORE INTO docs_fts(rowid, lib_name, content)
        SELECT id, COALESCE(lib_name, ''), COALESCE(content, '') FROM docs_cache
        WHERE id NOT IN (SELECT rowid FROM docs_fts);
    `,
  },
  {
    version: 31,
    description: 'v7.0 community summaries: add community_summaries table + FTS5 virtual table for GraphRAG',
    sql: `
      CREATE TABLE IF NOT EXISTS community_summaries (
        id               TEXT PRIMARY KEY,
        community_id     TEXT NOT NULL,
        title            TEXT NOT NULL,
        summary          TEXT NOT NULL,
        member_node_ids  TEXT NOT NULL,
        member_count     INTEGER NOT NULL,
        top_terms        TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_community_summaries_community_id
        ON community_summaries(community_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS community_summaries_fts USING fts5(
        community_id UNINDEXED,
        title,
        summary,
        top_terms,
        content=community_summaries,
        content_rowid=rowid
      );

      CREATE TRIGGER IF NOT EXISTS community_summaries_fts_insert
        AFTER INSERT ON community_summaries BEGIN
          INSERT INTO community_summaries_fts(rowid, community_id, title, summary, top_terms)
            VALUES (new.rowid, new.community_id, new.title, new.summary, new.top_terms);
        END;

      CREATE TRIGGER IF NOT EXISTS community_summaries_fts_delete
        AFTER DELETE ON community_summaries BEGIN
          INSERT INTO community_summaries_fts(community_summaries_fts, rowid, community_id, title, summary, top_terms)
            VALUES ('delete', old.rowid, old.community_id, old.title, old.summary, old.top_terms);
        END;

      CREATE TRIGGER IF NOT EXISTS community_summaries_fts_update
        AFTER UPDATE ON community_summaries BEGIN
          INSERT INTO community_summaries_fts(community_summaries_fts, rowid, community_id, title, summary, top_terms)
            VALUES ('delete', old.rowid, old.community_id, old.title, old.summary, old.top_terms);
          INSERT INTO community_summaries_fts(rowid, community_id, title, summary, top_terms)
            VALUES (new.rowid, new.community_id, new.title, new.summary, new.top_terms);
        END;
    `,
  },
  {
    version: 32,
    description: 'Plugin system: add plugins table for extension persistence',
    sql: `
      CREATE TABLE IF NOT EXISTS plugins (
        name         TEXT NOT NULL,
        project_id   TEXT NOT NULL,
        version      TEXT NOT NULL,
        path         TEXT NOT NULL,
        enabled      INTEGER NOT NULL DEFAULT 1,
        config       TEXT,
        installed_at TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        PRIMARY KEY (project_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_plugins_project
        ON plugins(project_id);
    `,
  },
  {
    version: 33,
    description: 'Harness v2: add harness_history table for trend tracking',
    sql: `
      CREATE TABLE IF NOT EXISTS harness_history (
        id          TEXT NOT NULL PRIMARY KEY,
        project_id  TEXT NOT NULL,
        score       REAL NOT NULL,
        grade       TEXT NOT NULL,
        breakdown   TEXT NOT NULL,
        git_commit  TEXT,
        timestamp   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_harness_history_project_time
        ON harness_history(project_id, timestamp);
    `,
  },
  {
    version: 34,
    description: 'Spec evolution: spec_documents, spec_document_versions, spec_node_links',
    sql: `
      CREATE TABLE IF NOT EXISTS spec_documents (
        id             TEXT PRIMARY KEY,
        project_id     TEXT NOT NULL,
        name           TEXT NOT NULL,
        template_name  TEXT,
        file_path      TEXT,
        content_hash   TEXT NOT NULL,
        version        INTEGER NOT NULL DEFAULT 1,
        status         TEXT NOT NULL DEFAULT 'draft',
        metadata       TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_spec_docs_project
        ON spec_documents(project_id);

      CREATE TABLE IF NOT EXISTS spec_document_versions (
        id             TEXT PRIMARY KEY,
        spec_id        TEXT NOT NULL REFERENCES spec_documents(id) ON DELETE CASCADE,
        version        INTEGER NOT NULL,
        content        TEXT NOT NULL,
        content_hash   TEXT NOT NULL,
        diff_summary   TEXT,
        created_at     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_spec_versions_spec
        ON spec_document_versions(spec_id);

      CREATE TABLE IF NOT EXISTS spec_node_links (
        id             TEXT PRIMARY KEY,
        spec_id        TEXT NOT NULL REFERENCES spec_documents(id) ON DELETE CASCADE,
        node_id        TEXT NOT NULL,
        section_title  TEXT,
        link_type      TEXT NOT NULL DEFAULT 'derived_from',
        created_at     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_spec_links_spec
        ON spec_node_links(spec_id);

      CREATE INDEX IF NOT EXISTS idx_spec_links_node
        ON spec_node_links(node_id);
    `,
  },
  {
    version: 35,
    description: 'Harness v3: issue_patterns table (moved from constructor to versioned migration)',
    sql: `
      CREATE TABLE IF NOT EXISTS issue_patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL UNIQUE,
        count INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        suggested_rule TEXT,
        auto_generated INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    version: 36,
    description: 'Remediation Engine v4: suppressions, validations, meta-rules tables',
    sql: `
      CREATE TABLE IF NOT EXISTS remediation_suppressions (
        id TEXT PRIMARY KEY,
        file TEXT NOT NULL,
        violation_type TEXT NOT NULL,
        dimension TEXT NOT NULL,
        reason TEXT,
        suppressed_at TEXT NOT NULL,
        UNIQUE(file, violation_type)
      );

      CREATE TABLE IF NOT EXISTS remediation_validations (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        file TEXT NOT NULL,
        applied INTEGER NOT NULL DEFAULT 0,
        score_before REAL,
        score_after REAL,
        confirmed INTEGER NOT NULL DEFAULT 0,
        validated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS remediation_meta_rules (
        id TEXT PRIMARY KEY,
        dimension TEXT NOT NULL,
        violation_type TEXT NOT NULL,
        pattern TEXT NOT NULL,
        fix_template TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.8,
        confirmations INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 37,
    description: 'Agent tracking: modified_by, version columns + resource_locks table + embedding_type',
    sql: `
      -- Agent identity columns on nodes
      ALTER TABLE nodes ADD COLUMN modified_by TEXT;
      ALTER TABLE nodes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

      -- Agent identity columns on edges
      ALTER TABLE edges ADD COLUMN modified_by TEXT;
      ALTER TABLE edges ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

      -- Agent identity on knowledge_documents
      ALTER TABLE knowledge_documents ADD COLUMN modified_by TEXT;

      -- Agent tracking in changelog
      ALTER TABLE node_changelog ADD COLUMN agent_id TEXT;

      -- Embedding type for dual-mode (tfidf vs onnx)
      -- Note: embeddings table is created lazily by EmbeddingStore.
      -- The column is added conditionally at EmbeddingStore init time.

      -- Resource locks for multi-agent lease-based locking
      CREATE TABLE IF NOT EXISTS resource_locks (
        resource_id   TEXT PRIMARY KEY,
        resource_type TEXT NOT NULL,
        agent_id      TEXT NOT NULL,
        lease_token   TEXT NOT NULL UNIQUE,
        acquired_at   TEXT NOT NULL,
        expires_at    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_resource_locks_agent
        ON resource_locks(agent_id);

      CREATE INDEX IF NOT EXISTS idx_resource_locks_expires
        ON resource_locks(expires_at);
    `,
  },
  {
    version: 38,
    description: 'Cross-terminal event queue for teamTask mode',
    sql: `
      CREATE TABLE IF NOT EXISTS event_queue (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload    TEXT NOT NULL,
        agent_id   TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_event_queue_created
        ON event_queue(created_at);
    `,
  },
  {
    version: 39,
    description: 'Composite index (project_id, parent_id) for node queries',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_nodes_project_parent
        ON nodes(project_id, parent_id);
    `,
  },
  {
    version: 40,
    description: 'Rename FTS sync triggers to explicit after_* names',
    sql: `
      DROP TRIGGER IF EXISTS nodes_fts_insert;
      DROP TRIGGER IF EXISTS nodes_fts_delete;
      DROP TRIGGER IF EXISTS nodes_fts_update;

      CREATE TRIGGER IF NOT EXISTS nodes_fts_after_insert AFTER INSERT ON nodes BEGIN
        INSERT INTO nodes_fts(rowid, title, description, tags)
          VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS nodes_fts_after_delete AFTER DELETE ON nodes BEGIN
        INSERT INTO nodes_fts(nodes_fts, rowid, title, description, tags)
          VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS nodes_fts_after_update AFTER UPDATE ON nodes BEGIN
        INSERT INTO nodes_fts(nodes_fts, rowid, title, description, tags)
          VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''));
        INSERT INTO nodes_fts(rowid, title, description, tags)
          VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''));
      END;
    `,
  },
  {
    version: 43,
    description: 'Deterministic edge deduplication by created_at/id ordering',
    sql: `
      DELETE FROM edges
      WHERE rowid IN (
        SELECT rowid FROM (
          SELECT
            rowid,
            ROW_NUMBER() OVER (
              PARTITION BY project_id, from_node, to_node, relation_type
              ORDER BY COALESCE(created_at, ''), id, rowid
            ) AS rn
          FROM edges
        ) ranked
        WHERE ranked.rn > 1
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique
        ON edges(project_id, from_node, to_node, relation_type);
    `,
  },
  {
    version: 44,
    description: 'Add ON DELETE CASCADE to edges foreign keys',
    sql: `
      -- SQLite cannot ALTER FK constraints, so recreate the table
      CREATE TABLE IF NOT EXISTS edges_new (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        from_node     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        to_node       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL,
        weight        REAL,
        reason        TEXT,
        metadata      TEXT,
        created_at    TEXT NOT NULL,
        modified_by   TEXT,
        version       INTEGER NOT NULL DEFAULT 1
      );

      INSERT OR IGNORE INTO edges_new SELECT * FROM edges;
      DROP TABLE edges;
      ALTER TABLE edges_new RENAME TO edges;

      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_edges_project ON edges(project_id);
      CREATE INDEX IF NOT EXISTS idx_edges_from    ON edges(from_node);
      CREATE INDEX IF NOT EXISTS idx_edges_to      ON edges(to_node);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique
        ON edges(project_id, from_node, to_node, relation_type);
    `,
  },
  {
    version: 45,
    description:
      'Add UNIQUE constraint on knowledge_documents(content_hash, source_id) to prevent dedup race condition',
    sql: `
      -- Remove any existing duplicates (keep oldest by rowid)
      DELETE FROM knowledge_documents
        WHERE rowid NOT IN (
          SELECT MIN(rowid)
          FROM knowledge_documents
          GROUP BY content_hash, source_id
        );

      -- Add UNIQUE index to enforce dedup at DB level
      CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_content_hash_source_id
        ON knowledge_documents(content_hash, source_id);
    `,
  },
  {
    version: 46,
    description: 'Contract violations table for architecture rule enforcement (Design by Contract — Meyer 1986)',
    sql: `
      CREATE TABLE IF NOT EXISTS contract_violations (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id    TEXT NOT NULL,
        file       TEXT NOT NULL,
        line       INTEGER NOT NULL DEFAULT 0,
        message    TEXT NOT NULL,
        severity   TEXT NOT NULL DEFAULT 'error',
        node_id    TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_contract_violations_node_created
        ON contract_violations(node_id, created_at);
    `,
  },
  {
    version: 47,
    description: 'Token budget policy table for adaptive Q-Learning (Sutton & Barto RL)',
    sql: (() => {
      const phases = ['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING']
      const grades = ['A', 'B', 'C', 'D']
      const presets = ['graph_heavy', 'knowledge_heavy', 'balanced', 'code_heavy', 'minimal']

      let sql = `
        CREATE TABLE IF NOT EXISTS token_budget_policy (
          state_phase    TEXT NOT NULL,
          state_grade    TEXT NOT NULL,
          action_preset  TEXT NOT NULL,
          q_value        REAL NOT NULL DEFAULT 0,
          visits         INTEGER NOT NULL DEFAULT 0,
          updated_at     TEXT NOT NULL,
          PRIMARY KEY (state_phase, state_grade, action_preset)
        );
      `

      const now = new Date().toISOString()
      const rows: string[] = []
      for (const phase of phases) {
        for (const grade of grades) {
          for (const preset of presets) {
            rows.push(`('${phase}', '${grade}', '${preset}', 0, 0, '${now}')`)
          }
        }
      }

      sql += `INSERT OR IGNORE INTO token_budget_policy (state_phase, state_grade, action_preset, q_value, visits, updated_at) VALUES ${rows.join(',\n')};`

      return sql
    })(),
  },
  {
    version: 48,
    description: 'Autopilot sessions table for autonomous sprint execution (Hewitt Actor Model 1973)',
    sql: `
      CREATE TABLE IF NOT EXISTS autopilot_sessions (
        id               TEXT PRIMARY KEY,
        sprint_id        TEXT NOT NULL,
        started_at       TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'running',
        tasks_completed  INTEGER NOT NULL DEFAULT 0,
        tasks_failed     INTEGER NOT NULL DEFAULT 0,
        tokens_used      INTEGER NOT NULL DEFAULT 0,
        config           TEXT NOT NULL DEFAULT '{}',
        decisions        TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_autopilot_sessions_sprint_status
        ON autopilot_sessions(sprint_id, status);
    `,
  },
  {
    version: 49,
    description: 'Add FK constraint to plugins table (E1-T13)',
    sql: `
      CREATE TABLE IF NOT EXISTS plugins_new (
        name         TEXT NOT NULL,
        project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version      TEXT NOT NULL,
        path         TEXT NOT NULL,
        enabled      INTEGER NOT NULL DEFAULT 1,
        config       TEXT,
        installed_at TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        PRIMARY KEY (project_id, name)
      );

      INSERT OR IGNORE INTO plugins_new SELECT * FROM plugins;
      DROP TABLE IF EXISTS plugins;
      ALTER TABLE plugins_new RENAME TO plugins;

      CREATE INDEX IF NOT EXISTS idx_plugins_project ON plugins(project_id);
    `,
  },
  {
    version: 50,
    description: 'Execution traces and spans for agent observability (Kalman Observability Theorem 1960)',
    sql: `
      CREATE TABLE IF NOT EXISTS execution_traces (
        id                 TEXT PRIMARY KEY,
        thread_id          TEXT NOT NULL,
        node_id            TEXT,
        tool_name          TEXT NOT NULL,
        started_at         TEXT NOT NULL,
        ended_at           TEXT,
        latency_ms         INTEGER,
        status             TEXT NOT NULL DEFAULT 'running',
        tokens_in          INTEGER DEFAULT 0,
        tokens_out         INTEGER DEFAULT 0,
        estimated_cost_usd REAL DEFAULT 0,
        metadata           TEXT DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_traces_thread ON execution_traces(thread_id);
      CREATE INDEX IF NOT EXISTS idx_traces_node ON execution_traces(node_id);
      CREATE INDEX IF NOT EXISTS idx_traces_status ON execution_traces(status);

      CREATE TABLE IF NOT EXISTS execution_spans (
        id              TEXT PRIMARY KEY,
        trace_id        TEXT NOT NULL REFERENCES execution_traces(id),
        parent_span_id  TEXT,
        name            TEXT NOT NULL,
        started_at      TEXT NOT NULL,
        ended_at        TEXT,
        latency_ms      INTEGER,
        input_summary   TEXT,
        output_summary  TEXT,
        metadata        TEXT DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_spans_trace ON execution_spans(trace_id);
    `,
  },
]
