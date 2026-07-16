/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SQLite migration definitions for versions 101–123.
 * Pure data — no runtime logic. Imported and merged by index.ts.
 */

import type { Migration } from './v001-v020.js'

export const migrationsV101_V123: Migration[] = [
  {
    version: 101,
    description: 'healing_log — registro persistido das ações de self-healing (MAPE-K)',
    sql: `
      CREATE TABLE IF NOT EXISTS healing_log (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        ts          INTEGER NOT NULL,
        issue_type  TEXT NOT NULL,
        severity    TEXT NOT NULL,
        action_type TEXT NOT NULL,
        node_id     TEXT,
        applied     INTEGER NOT NULL DEFAULT 0,
        success     INTEGER NOT NULL DEFAULT 0,
        message     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_healing_log_project ON healing_log(project_id, ts);
    `,
  },
  {
    version: 102,
    description: 'generated_artifacts — proveniência da geração determinística (acoplador determinístico)',
    sql: `
      CREATE TABLE IF NOT EXISTS generated_artifacts (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        node_id     TEXT,
        kinds       TEXT NOT NULL,
        paths       TEXT NOT NULL,
        signature   TEXT NOT NULL,
        covered     INTEGER NOT NULL DEFAULT 0,
        applied     INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gen_artifacts_project ON generated_artifacts(project_id, created_at);
    `,
  },
  {
    version: 103,
    description: 'github_corpus_cache — cache determinístico de scaffolds varridos do github (greenfield)',
    sql: `
      CREATE TABLE IF NOT EXISTS github_corpus_cache (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        query       TEXT NOT NULL,
        payload     TEXT NOT NULL,
        fetched_at  INTEGER NOT NULL,
        UNIQUE (project_id, query)
      );
      CREATE INDEX IF NOT EXISTS idx_gh_corpus_project ON github_corpus_cache(project_id, fetched_at);
    `,
  },
  {
    version: 104,
    description: 'reasoning_tokens on llm_call_ledger — medição T_reason da Frente C (esforço condicional)',
    sql: `
      ALTER TABLE llm_call_ledger ADD COLUMN reasoning_tokens INTEGER;
    `,
  },
  {
    version: 105,
    description: 'cmd_usage table — track command frequency for auto-wrapper detection',
    sql: `
      CREATE TABLE IF NOT EXISTS cmd_usage (
        id         TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        command    TEXT NOT NULL,
        args       TEXT NOT NULL DEFAULT '',
        cwd        TEXT NOT NULL DEFAULT '',
        durationMs INTEGER NOT NULL DEFAULT 0,
        exitCode   INTEGER NOT NULL DEFAULT 0,
        trackedAt  INTEGER NOT NULL,
        wrapped    INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_cmd_usage_command ON cmd_usage(project_id, command);
      CREATE INDEX IF NOT EXISTS idx_cmd_usage_tracked ON cmd_usage(project_id, trackedAt);
    `,
  },
  {
    version: 106,
    description: 'command_invocations — universal agf subcommand I/O ledger',
    sql: `
      CREATE TABLE IF NOT EXISTS command_invocations (
        id                TEXT PRIMARY KEY,
        ts                INTEGER NOT NULL,
        command           TEXT NOT NULL,
        input_bytes       INTEGER NOT NULL DEFAULT 0,
        output_bytes      INTEGER NOT NULL DEFAULT 0,
        estimated_tokens  INTEGER NOT NULL DEFAULT 0,
        cached            INTEGER NOT NULL DEFAULT 0,
        duration_ms       INTEGER NOT NULL DEFAULT 0,
        node_id           TEXT,
        session_id        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_command_invocations_cmd ON command_invocations(command, ts);
      CREATE INDEX IF NOT EXISTS idx_command_invocations_session ON command_invocations(session_id) WHERE session_id IS NOT NULL;
    `,
  },
  {
    version: 107,
    description: 'compiled_decisions — Learning Compiler (JIT) zero-token decision fast-path store',
    sql: `
      CREATE TABLE IF NOT EXISTS compiled_decisions (
        decision_key TEXT NOT NULL,
        project_id   TEXT NOT NULL DEFAULT 'default',
        decision     TEXT NOT NULL,
        occurrences  INTEGER NOT NULL DEFAULT 1,
        success_rate REAL NOT NULL DEFAULT 0,
        compiled_at  INTEGER NOT NULL,
        last_used_at INTEGER,
        PRIMARY KEY (project_id, decision_key)
      );
      CREATE INDEX IF NOT EXISTS idx_compiled_decisions_project ON compiled_decisions(project_id, last_used_at);
    `,
  },
  {
    version: 108,
    description: 'tool_output_store — offloaded large tool output (head-tail preview + tool-output://<hash> retrieval)',
    sql: `
      CREATE TABLE IF NOT EXISTS tool_output_store (
        hash       TEXT PRIMARY KEY,
        original   TEXT NOT NULL,
        bytes      INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 109,
    description: 'helper_records — self-healing memory: which fix resolved a failure, keyed by failure signature',
    sql: `
      CREATE TABLE IF NOT EXISTS helper_records (
        signature    TEXT NOT NULL,
        project_id   TEXT NOT NULL DEFAULT 'default',
        fix          TEXT NOT NULL,
        uses         INTEGER NOT NULL DEFAULT 1,
        last_used_at INTEGER,
        created_at   INTEGER NOT NULL,
        PRIMARY KEY (project_id, signature)
      );
    `,
  },
  {
    version: 110,
    description: 'import_history.raw_text — store imported PRD raw text to enable agf import-prd --diff',
    sql: `
      ALTER TABLE import_history ADD COLUMN raw_text TEXT;
    `,
  },
  {
    version: 111,
    description: 'economy_lever_ledger.score — persist gate confidence (rerank/fit) for threshold calibration (RAG F4)',
    sql: `
      ALTER TABLE economy_lever_ledger ADD COLUMN score REAL;
    `,
  },
  {
    version: 112,
    description:
      'command_invocations.graph_export_bytes — raw graph size at invocation time for delegate economy baseline',
    sql: `ALTER TABLE command_invocations ADD COLUMN graph_export_bytes INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 113,
    description: 'Hierarchical ToC document tree (doc_tree_nodes) + standalone FTS5 for PageIndex-style tree retrieval',
    sql: `
      CREATE TABLE IF NOT EXISTS doc_tree_nodes (
        id           TEXT PRIMARY KEY,
        document_id  TEXT NOT NULL,
        tree_path    TEXT NOT NULL,
        level        INTEGER NOT NULL,
        title        TEXT NOT NULL,
        summary      TEXT NOT NULL DEFAULT '',
        content      TEXT NOT NULL DEFAULT '',
        parent_id    TEXT,
        start_line   INTEGER NOT NULL DEFAULT 0,
        end_line     INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_doc_tree_document ON doc_tree_nodes(document_id);
      CREATE INDEX IF NOT EXISTS idx_doc_tree_parent ON doc_tree_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_doc_tree_level ON doc_tree_nodes(level);

      -- Standalone FTS (manually populated): node_id + document_id are UNINDEXED
      -- carriers so retrieval can return the node and re-import can purge by doc.
      CREATE VIRTUAL TABLE IF NOT EXISTS doc_tree_nodes_fts USING fts5(
        node_id UNINDEXED, document_id UNINDEXED, title, summary, content
      );
    `,
  },
  {
    version: 114,
    description: 'pheromone_trails — stigmergy/ACO: persisted decaying trails for the stigmergy lever',
    sql: `
      CREATE TABLE IF NOT EXISTS pheromone_trails (
        project_id  TEXT NOT NULL,
        key         TEXT NOT NULL,
        amount      REAL NOT NULL,
        ts          INTEGER NOT NULL,
        PRIMARY KEY (project_id, key)
      );

      CREATE INDEX IF NOT EXISTS idx_pheromone_project ON pheromone_trails(project_id);
    `,
  },
  {
    version: 115,
    description: 'model_tier + escalated + escalation_reason on llm_call_ledger — tier routing and escalation tracking',
    sql: `
      ALTER TABLE llm_call_ledger ADD COLUMN model_tier TEXT;
      ALTER TABLE llm_call_ledger ADD COLUMN escalated INTEGER;
      ALTER TABLE llm_call_ledger ADD COLUMN escalation_reason TEXT;
    `,
  },
  {
    version: 116,
    description: 'immune_memory + immune_ledger — Danger Theory error recovery persistence',
    sql: `
      CREATE TABLE IF NOT EXISTS immune_memory (
        project_id      TEXT NOT NULL,
        signature       TEXT NOT NULL,
        antigen_kind    TEXT NOT NULL,
        file            TEXT NOT NULL,
        first_seen      INTEGER NOT NULL,
        last_seen       INTEGER NOT NULL,
        occurrences     INTEGER NOT NULL DEFAULT 1,
        last_action     TEXT,
        recovery_success INTEGER NOT NULL DEFAULT 0,
        suppressed      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (project_id, signature)
      );

      CREATE INDEX IF NOT EXISTS idx_immune_memory_project ON immune_memory(project_id);
      CREATE INDEX IF NOT EXISTS idx_immune_memory_file ON immune_memory(project_id, file);

      CREATE TABLE IF NOT EXISTS immune_ledger (
        id                  TEXT PRIMARY KEY,
        project_id          TEXT NOT NULL,
        cycle_id            TEXT NOT NULL,
        signals_detected    INTEGER NOT NULL DEFAULT 0,
        antigens_presented  INTEGER NOT NULL DEFAULT 0,
        responses_generated INTEGER NOT NULL DEFAULT 0,
        responses_applied   INTEGER NOT NULL DEFAULT 0,
        recovery_rate       REAL NOT NULL DEFAULT 0,
        duration_ms         INTEGER NOT NULL DEFAULT 0,
        created_at          INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_immune_ledger_project ON immune_ledger(project_id);
      CREATE INDEX IF NOT EXISTS idx_immune_ledger_cycle ON immune_ledger(cycle_id);
    `,
  },
  {
    version: 117,
    description: 'immune_ledger expansion: gated responses, verification, token economics columns',
    sql: `
      ALTER TABLE immune_ledger ADD COLUMN responses_gated INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE immune_ledger ADD COLUMN responses_failed_verify INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE immune_ledger ADD COLUMN gate_pass_rate REAL NOT NULL DEFAULT 0;
      ALTER TABLE immune_ledger ADD COLUMN verification_pass_rate REAL NOT NULL DEFAULT 0;
      ALTER TABLE immune_ledger ADD COLUMN estimated_tokens_saved INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE immune_ledger ADD COLUMN estimated_tokens_spent INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 118,
    description: 'healing_log: add subgraph_fingerprint column for immune memory (Burnet 1959)',
    sql: `
      ALTER TABLE healing_log ADD COLUMN subgraph_fingerprint TEXT;
      CREATE INDEX IF NOT EXISTS idx_healing_log_fingerprint ON healing_log(project_id, subgraph_fingerprint);
    `,
  },
  {
    version: 119,
    description: 'healing_patterns: immune memory table — occurrence count + confidence per fingerprint',
    sql: `
      CREATE TABLE IF NOT EXISTS healing_patterns (
        fingerprint       TEXT NOT NULL,
        project_id        TEXT NOT NULL,
        issue_type        TEXT NOT NULL,
        occurrence_count  INTEGER NOT NULL DEFAULT 1,
        confidence        REAL NOT NULL DEFAULT 0.5,
        last_seen_at      INTEGER NOT NULL,
        auto_applied      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (fingerprint, project_id)
      );
      CREATE INDEX IF NOT EXISTS idx_healing_patterns_project ON healing_patterns(project_id, confidence);
    `,
  },
  {
    version: 120,
    description: 'nodes: soft-delete support — archived flag + archived_at timestamp for reversible rm',
    sql: `
      ALTER TABLE nodes ADD COLUMN archived     INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE nodes ADD COLUMN archived_at  INTEGER;
      CREATE INDEX IF NOT EXISTS idx_nodes_archived ON nodes(project_id, archived);
    `,
  },
  {
    version: 121,
    description: 'perf_records: add nullable caste column for colony caste performance tracking (E1.3)',
    sql: `
      ALTER TABLE perf_records ADD COLUMN caste TEXT;
      CREATE INDEX IF NOT EXISTS idx_perf_records_caste ON perf_records(project_id, caste);
    `,
  },
  {
    version: 122,
    // EPIC-SESSION-4 (Fase 2) — session/runtime persistence (the diagram's
    // HARNESS → storage box): first-class runs + an upward-event history.
    description: 'session layer: create runs + session_events tables',
    sql: `
      CREATE TABLE IF NOT EXISTS runs (
        run_id     TEXT PRIMARY KEY,
        status     TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at   INTEGER,
        budget     TEXT NOT NULL,
        session_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_status  ON runs(status);
      CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);

      CREATE TABLE IF NOT EXISTS session_events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        channel    TEXT NOT NULL,
        timestamp  TEXT NOT NULL,
        payload    TEXT NOT NULL,
        session_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_events_channel ON session_events(channel);
      CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id);
    `,
  },
  {
    version: 123,
    // EPIC-CONSISTENCY (Fase 2) — execution-grounded proof: a ledger of real
    // test-gate runs so provenance can only promote a node to `validated`
    // against a receipt that actually exists (no string can fake a test run).
    description: 'consistency: create test_run_receipts ledger',
    sql: `
      CREATE TABLE IF NOT EXISTS test_run_receipts (
        receipt    TEXT PRIMARY KEY,
        node_id    TEXT,
        runner     TEXT,
        exit_code  INTEGER,
        passed     INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_test_receipts_node ON test_run_receipts(node_id);
    `,
  },
  {
    version: 124,
    // Anti-hallucination triangulation (code axis): mirror of test_files so a
    // task can declare the source files it delivers. phantom_done then crosses
    // both axes against the filesystem (AC ↔ code ↔ test, all physical).
    description: 'consistency: add implementation_files column to nodes (code axis)',
    sql: `
      ALTER TABLE nodes ADD COLUMN implementation_files TEXT; -- JSON array of source file paths
    `,
  },
  {
    version: 125,
    // A saving is only evidence if you can name the baseline it was measured against. Rows written
    // before this column exist carry NULL, which reads as 'structural' — the constant they used.
    description: 'economy: add baseline_method to economy_lever_ledger so a saving names its counterfactual',
    sql: `
      ALTER TABLE economy_lever_ledger ADD COLUMN baseline_method TEXT;
    `,
  },
  {
    version: 126,
    // Efeito-no-driver por lever (F2.T2 node_41efe88b1dcd): a saving names WHERE it fired.
    // hook/context/brief/envelope = driver-facing surfaces; internal = never counts as driver
    // effect. NULL = pre-migration row only — every new write classifies (compile-enforced).
    description: 'economy: add surface column to economy_lever_ledger (driver-boundary attribution)',
    sql: `
      ALTER TABLE economy_lever_ledger ADD COLUMN surface TEXT;
    `,
  },
  {
    version: 127,
    // Cache semântico (B.T1): colunas aditivas na MESMA tabela do cache exato —
    // vetor de termos + escopo (comando/node) p/ nunca servir resposta de task alheia.
    description: 'llm: semantic columns on llm_response_cache (prompt_terms, scope)',
    sql: `
      ALTER TABLE llm_response_cache ADD COLUMN prompt_terms TEXT;
      ALTER TABLE llm_response_cache ADD COLUMN scope_command TEXT;
      ALTER TABLE llm_response_cache ADD COLUMN scope_node_id TEXT;
    `,
  },
  {
    version: 128,
    // Colônia (node_aa91e9665ac2): atribuição por FORMIGA além do node — quem
    // gastou o token. NULL = linha pré-colônia/loop principal (sem formiga).
    description: 'llm: add agent_id to llm_call_ledger (per-ant attribution in the async colony)',
    sql: `
      ALTER TABLE llm_call_ledger ADD COLUMN agent_id TEXT;
    `,
  },
  {
    version: 129,
    description:
      'prefetch_context_cache — prefetch persistente para contexto+brief da próxima task (node_cc4c4c7e02e2)',
    sql: `
      CREATE TABLE IF NOT EXISTS prefetch_context_cache (
        node_id       TEXT PRIMARY KEY,
        context_json  TEXT NOT NULL,
        brief_json    TEXT NOT NULL,
        created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      );
    `,
  },
]
