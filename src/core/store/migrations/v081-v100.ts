/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SQLite migration definitions for versions 81–100.
 * Pure data — no runtime logic. Imported and merged by index.ts.
 */

import type { Migration } from './v001-v020.js'

export const migrationsV081_V100: Migration[] = [
  {
    version: 81,
    // §EPIC-12.T07 — knowledge_documents project scoping index.
    // Enforces fast WHERE project_id = ? lookups so cross-project FTS queries
    // are filtered before scanning. Caller (knowledge-store) must pass
    // projectId on every query — the lint test in src/tests/ enforces this.
    description: 'EPIC 12 Resilience — knowledge_documents project_id index for project-scoped FTS',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_knowledge_documents_project_id
        ON knowledge_documents(project_id);
    `,
  },
  {
    version: 82,
    // §EPIC-6.T01 — Token Economy: response cache + economy metrics.
    // Schema versions v76-v81 already taken; bumped to v82. Tables back the
    // ResponseCache (E6.T04) persistence and the economy reporting query.
    description: 'EPIC 6 Token Economy — llm_response_cache + economy_metrics tables',
    sql: `
      CREATE TABLE IF NOT EXISTS llm_response_cache (
        key             TEXT PRIMARY KEY,
        value_json      TEXT NOT NULL,
        schema_version  INTEGER NOT NULL,
        created_at_ms   INTEGER NOT NULL,
        ttl_expires_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_llm_response_cache_ttl
        ON llm_response_cache(ttl_expires_at);
      CREATE INDEX IF NOT EXISTS idx_llm_response_cache_schema
        ON llm_response_cache(schema_version);

      CREATE TABLE IF NOT EXISTS economy_metrics (
        id            TEXT PRIMARY KEY,
        ts            INTEGER NOT NULL,
        tier          TEXT NOT NULL,
        tokens_saved  INTEGER NOT NULL DEFAULT 0,
        cost_saved    REAL NOT NULL DEFAULT 0,
        cache_hit     INTEGER NOT NULL DEFAULT 0,
        node_id       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_economy_metrics_ts   ON economy_metrics(ts);
      CREATE INDEX IF NOT EXISTS idx_economy_metrics_tier ON economy_metrics(tier);
      CREATE INDEX IF NOT EXISTS idx_economy_metrics_node ON economy_metrics(node_id);
    `,
  },
  {
    version: 83,
    // §SprintA-cleanup — Swarm consensus rounds + strategy default.
    // Adds the swarm_consensus_rounds table expected by EPIC-19 consensus
    // protocols (§EPIC-19.T03) and relaxes swarm_sessions.strategy to allow
    // legacy callers/tests that pre-date the strategy column. Existing rows
    // (which already have strategy populated) are unaffected.
    description: 'Swarm consensus rounds + strategy default',
    sql: `
      CREATE TABLE IF NOT EXISTS swarm_consensus_rounds (
        id            TEXT PRIMARY KEY,
        session_id    TEXT NOT NULL,
        round_index   INTEGER NOT NULL,
        outcome       TEXT NOT NULL,
        decided_at    TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES swarm_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_swarm_consensus_rounds_session ON swarm_consensus_rounds(session_id);
      CREATE INDEX IF NOT EXISTS idx_swarm_consensus_rounds_round   ON swarm_consensus_rounds(round_index);

      CREATE TABLE IF NOT EXISTS swarm_sessions_v83 (
        id           TEXT PRIMARY KEY,
        topology     TEXT NOT NULL,
        consensus    TEXT NOT NULL,
        status       TEXT NOT NULL,
        max_agents   INTEGER NOT NULL,
        strategy     TEXT NOT NULL DEFAULT 'default',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      INSERT INTO swarm_sessions_v83 (id, topology, consensus, status, max_agents, strategy, created_at, updated_at)
        SELECT id, topology, consensus, status, max_agents, strategy, created_at, updated_at FROM swarm_sessions;
      DROP TABLE swarm_sessions;
      ALTER TABLE swarm_sessions_v83 RENAME TO swarm_sessions;
      CREATE INDEX IF NOT EXISTS idx_swarm_sessions_status   ON swarm_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_swarm_sessions_topology ON swarm_sessions(topology);
    `,
  },
  {
    version: 84,
    // §SprintD — Lifecycle health snapshots.
    // The 9-phase régua (prd-lifecycle-health) computes a passedAll boolean
    // every call; persisting the snapshot lets analyze(success_rate) report
    // the rolling pass-rate over a window. Idempotent per (epic_id, taken_on)
    // day so multiple invocations the same day collapse to one row.
    description: 'Lifecycle health snapshots — persist régua results for trend analysis',
    sql: `
      CREATE TABLE IF NOT EXISTS lifecycle_health_snapshots (
        id            TEXT PRIMARY KEY,
        epic_id       TEXT,
        snapshot_json TEXT NOT NULL,
        passed_all    INTEGER NOT NULL,
        taken_at      TEXT NOT NULL,
        taken_on      TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lifecycle_health_unique
        ON lifecycle_health_snapshots(COALESCE(epic_id, ''), taken_on);
      CREATE INDEX IF NOT EXISTS idx_lifecycle_health_taken_at
        ON lifecycle_health_snapshots(taken_at);
    `,
  },
  {
    version: 85,
    // §extracta — evolution_reason on nodes (Hive auto-merge inspiration).
    // When the orchestrator regenerates a node (failure recovery, cost
    // overrun, user nudge), we want the *why* preserved alongside the new
    // metadata so analyze(evolution_audit) can surface top regenerated
    // nodes + reasons. Nullable so existing rows are unaffected.
    description: 'evolution_reason on nodes — audit trail for node regeneration',
    sql: `
      ALTER TABLE nodes ADD COLUMN evolution_reason TEXT;
      ALTER TABLE nodes ADD COLUMN evolution_count INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_nodes_evolution_count
        ON nodes(evolution_count) WHERE evolution_count > 0;
    `,
  },
  {
    version: 86,
    // §extracta-cost-observability — session_id on llm_call_ledger.
    // Enables aggregating cost across an entire agent session (across
    // many cells and runs) so we can enforce a session-level budget cap
    // and trigger auto-fallback to a cheaper model at the soft-cap.
    description: 'session_id on llm_call_ledger — session-scoped cost aggregation',
    sql: `
      ALTER TABLE llm_call_ledger ADD COLUMN session_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_llm_ledger_session
        ON llm_call_ledger(session_id) WHERE session_id IS NOT NULL;
    `,
  },
  {
    version: 87,
    // §harness-savings-ledger (Eduardo, 2026-04-30) — every harness block
    // persists a row with REAL token-savings metrics so the graph can
    // quantify how much hallucination/quality/context-loss cost was
    // avoided. Grounded in Hu et al. 2026 "Memory in the Age of AI Agents"
    // §4 (factual + experiential memory).
    description: 'harness_savings_ledger — token savings on each harness block (Eduardo spec)',
    sql: `
      CREATE TABLE IF NOT EXISTS harness_savings_ledger (
        id                       TEXT PRIMARY KEY,
        project_id               TEXT NOT NULL,
        block_type               TEXT NOT NULL,
        blocker_module           TEXT NOT NULL,
        node_id                  TEXT,
        session_id               TEXT,
        tokens_consumed          INTEGER NOT NULL DEFAULT 0,
        baseline_continuation    INTEGER NOT NULL DEFAULT 0,
        baseline_n               INTEGER NOT NULL DEFAULT 0,
        savings_tokens           INTEGER NOT NULL DEFAULT 0,
        confidence               REAL NOT NULL DEFAULT 0,
        source                   TEXT NOT NULL,
        evidence_json            TEXT,
        timestamp                TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_harness_savings_project_time
        ON harness_savings_ledger(project_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_harness_savings_block_type
        ON harness_savings_ledger(block_type);
      CREATE INDEX IF NOT EXISTS idx_harness_savings_node
        ON harness_savings_ledger(node_id) WHERE node_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_harness_savings_session
        ON harness_savings_ledger(session_id) WHERE session_id IS NOT NULL;
    `,
  },
  {
    version: 88,
    // §EPIC-unified-observability Task 1.2 — failure signal collector.
    // Persists structured failure signals from 5 collection hooks
    // (tool invocation, lifecycle gate, DoD check, SQLite busy, MCP server).
    description: 'failure_signals — structured failure signal collector (obs-90)',
    sql: `
      CREATE TABLE IF NOT EXISTS failure_signals (
        id          INTEGER PRIMARY KEY,
        source      TEXT NOT NULL,
        signalKind  TEXT NOT NULL,
        context     TEXT NOT NULL DEFAULT '{}',
        severity    TEXT NOT NULL DEFAULT 'error',
        timestamp   TEXT NOT NULL,
        rawError    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_failure_signals_kind
        ON failure_signals(signalKind);
      CREATE INDEX IF NOT EXISTS idx_failure_signals_source
        ON failure_signals(source);
      CREATE INDEX IF NOT EXISTS idx_failure_signals_timestamp
        ON failure_signals(timestamp);
    `,
  },
  {
    version: 89,
    // §EPIC-unified-observability Task 1.1 — event store for structured
    // observability events. Buffered writes via EventWriter (best-effort,
    // not durable across crash before flush).
    description: 'events — structured event store for observability (obs-90)',
    sql: `
      CREATE TABLE IF NOT EXISTS events (
        id              TEXT PRIMARY KEY,
        kind            TEXT NOT NULL,
        subjectRef_kind TEXT NOT NULL,
        subjectRef_id   TEXT NOT NULL,
        payload         TEXT,
        timestamp       TEXT NOT NULL,
        projectId       TEXT,
        sessionId       TEXT,
        durationMs      REAL,
        parentEventId   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_timestamp
        ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_kind
        ON events(kind);
      CREATE INDEX IF NOT EXISTS idx_events_session
        ON events(sessionId) WHERE sessionId IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_events_subject
        ON events(subjectRef_kind, subjectRef_id);
    `,
  },
  {
    version: 90,
    // §EPIC-policy-engine-context-routing Task 2.1 — analyze(mode:"policy_observations").
    // Stores one row per routing decision for divergence tracking.
    description: 'policy_observations — routing decision log for divergence analysis',
    sql: `
      CREATE TABLE IF NOT EXISTS policy_observations (
        id               TEXT PRIMARY KEY,
        project_id       TEXT,
        timestamp        TEXT NOT NULL,
        signals_snapshot TEXT NOT NULL DEFAULT '{}',
        decision         TEXT NOT NULL DEFAULT '{}',
        actual_used      TEXT NOT NULL DEFAULT '[]',
        divergence       INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_policy_obs_project_time
        ON policy_observations(project_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_policy_obs_timestamp
        ON policy_observations(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_policy_obs_divergence
        ON policy_observations(divergence) WHERE divergence = 1;
    `,
  },
  {
    version: 91,
    // §EPIC-browser-harness Task 4.1 — browser_test_runs table.
    // Stores structured browser test run results with JSON evidence fields.
    description: 'browser_test_runs — browser test run results with JSON evidence (browser-harness)',
    sql: `
      CREATE TABLE IF NOT EXISTS browser_test_runs (
        id            TEXT PRIMARY KEY,
        runId         TEXT NOT NULL,
        targetUrl     TEXT NOT NULL,
        featureNodeId TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'running',
        evidences     TEXT NOT NULL DEFAULT '[]',
        pathTaken     TEXT NOT NULL DEFAULT '[]',
        startedAt     TEXT NOT NULL,
        endedAt       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_browser_test_runs_feature
        ON browser_test_runs(featureNodeId);
      CREATE INDEX IF NOT EXISTS idx_browser_test_runs_status
        ON browser_test_runs(status);
    `,
  },
  {
    version: 92,
    // Task 2.1 (autonomy-gap-3-to-6 PRD): episodic memory outcome table.
    // Stores outcome-centric tuples per completed task for cross-task learning.
    description: 'episodic_outcomes — outcome-centric memory tuples indexed by task_type (autonomy-gap Task 2.1)',
    sql: `
      CREATE TABLE IF NOT EXISTS episodic_outcomes (
        id               TEXT PRIMARY KEY,
        node_id          TEXT NOT NULL,
        task_type        TEXT NOT NULL DEFAULT '',
        tags             TEXT NOT NULL DEFAULT '',
        approach_summary TEXT NOT NULL DEFAULT '',
        outcome          TEXT NOT NULL CHECK(outcome IN ('success', 'partial', 'failure')),
        cycle_time_delta REAL NOT NULL DEFAULT 0,
        reopen_count     INTEGER NOT NULL DEFAULT 0,
        created_at       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_episodic_outcomes_task_type_created
        ON episodic_outcomes(task_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_episodic_outcomes_created
        ON episodic_outcomes(created_at DESC);
    `,
  },
  {
    version: 93,
    // §EPIC-Hard-cutover-do-tool-legado Task 2.4: feature_depth retired in favor
    // of Sentrux (ADR-0060). Baselines reset accepted by the user — no data
    // preservation needed.
    description: 'drop feature_depth_baselines — hard cutover to Sentrux (ADR-0060)',
    sql: `DROP TABLE IF EXISTS feature_depth_baselines;`,
  },
  {
    version: 94,
    // §EPIC-Calibracao-Estimativas Task 2.4 — next_overrides: telemetry table for
    // tracking when the agent starts a task different from what next() suggested.
    // Telemetry-only: never affects node status or graph structure.
    description: 'next_overrides — override telemetry when start_task deviates from next suggestion',
    sql: `
      CREATE TABLE IF NOT EXISTS next_overrides (
        id                  TEXT PRIMARY KEY,
        project_id          TEXT NOT NULL,
        suggestion_id       TEXT NOT NULL,
        actual_id           TEXT NOT NULL,
        suggestion_priority INTEGER,
        actual_priority     INTEGER,
        suggestion_tags     TEXT,
        actual_tags         TEXT,
        timestamp           TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_next_overrides_project
        ON next_overrides(project_id, timestamp);
    `,
  },
  {
    version: 95,
    // §EPIC-unified-observability Task 2.1 — tool_token_usage_v: read-only VIEW
    // over events WHERE kind='tool.completed'. Coexists with the real table during
    // the 2-sprint migration window. Consumers can migrate queries to this view;
    // the table will be dropped and this view renamed in a future migration.
    description: 'tool_token_usage_v — view over events for tool.completed dual-write migration',
    sql: `
      CREATE VIEW IF NOT EXISTS tool_token_usage_v AS
      SELECT
        e.id                                                  AS event_id,
        e.projectId                                           AS project_id,
        e.subjectRef_id                                       AS tool_name,
        CAST(json_extract(e.payload, '$.inputTokens')  AS INTEGER) AS input_tokens,
        CAST(json_extract(e.payload, '$.outputTokens') AS INTEGER) AS output_tokens,
        e.timestamp                                           AS called_at,
        CAST(json_extract(e.payload, '$.success') AS INTEGER)      AS success,
        CAST(json_extract(e.payload, '$.durationMs') AS INTEGER)   AS duration_ms,
        json_extract(e.payload, '$.errorKind')                AS error_kind
      FROM events e
      WHERE e.kind = 'tool.completed'
        AND e.subjectRef_kind = 'mcp.tool';
    `,
  },
  {
    version: 96,
    // λ_flow (transient-hypofrontality) telemetry. Records, per context call, the
    // flow state (Φ, λ_flow) and how much topological decay pruned vs. pinned,
    // tagged flow_on/flow_off for A/B. Telemetry-only — never affects graph state.
    // Pairs with flow-metrics-store.ts / flow-report.ts.
    description: 'flow_metrics — λ_flow (hipofrontalidade) A/B telemetry',
    sql: `
      CREATE TABLE IF NOT EXISTS flow_metrics (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL,
        node_id         TEXT NOT NULL,
        mode            TEXT NOT NULL,
        phi             REAL NOT NULL,
        lambda          REAL NOT NULL,
        tokens_baseline INTEGER NOT NULL,
        tokens_actual   INTEGER NOT NULL,
        pruned_count    INTEGER NOT NULL,
        pinned_count    INTEGER NOT NULL,
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_flow_metrics_project_created
        ON flow_metrics(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_flow_metrics_mode
        ON flow_metrics(mode, created_at DESC);
    `,
  },
  {
    version: 97,
    // Reuso determinístico (Épico R): cache de artefatos (edits gerados e verdes)
    // por assinatura de task. Quando a mesma assinatura reaparece, o loop reusa os
    // edits sem chamar o modelo (~0 tokens). Pairs com src/core/reuse/*.
    description: 'artifact_cache — reuso determinístico de edits por task-signature',
    sql: `
      CREATE TABLE IF NOT EXISTS artifact_cache (
        id               TEXT PRIMARY KEY,
        signature        TEXT NOT NULL,
        node_id          TEXT,
        applied_edits    TEXT NOT NULL,
        approach_summary TEXT,
        model            TEXT,
        outcome          TEXT NOT NULL,
        created_at       INTEGER NOT NULL,
        UNIQUE(signature, outcome)
      );
      CREATE INDEX IF NOT EXISTS idx_artifact_cache_signature
        ON artifact_cache(signature, created_at DESC);
    `,
  },
  {
    version: 98,
    description: 'thread_store — persistência de sessões de conversa (Codex Feature Import)',
    sql: `
      CREATE TABLE IF NOT EXISTS threads (
        id               TEXT PRIMARY KEY,
        rollout_path     TEXT NOT NULL,
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL,
        source           TEXT NOT NULL DEFAULT 'cli',
        model_provider   TEXT NOT NULL DEFAULT 'openai',
        cwd              TEXT NOT NULL DEFAULT '',
        title            TEXT NOT NULL DEFAULT '',
        preview          TEXT,
        sandbox_policy   TEXT NOT NULL DEFAULT 'restricted',
        approval_mode    TEXT NOT NULL DEFAULT 'on-request',
        tokens_used      INTEGER NOT NULL DEFAULT 0,
        git_sha          TEXT,
        git_branch       TEXT,
        git_origin_url   TEXT,
        archived         INTEGER NOT NULL DEFAULT 0,
        archived_at      INTEGER,
        cli_version      TEXT,
        first_user_message TEXT,
        agent_nickname   TEXT,
        agent_role       TEXT,
        model            TEXT,
        reasoning_effort TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_threads_archived ON threads(archived);
      CREATE INDEX IF NOT EXISTS idx_threads_source ON threads(source);
      CREATE INDEX IF NOT EXISTS idx_threads_provider ON threads(model_provider);
    `,
  },
  {
    version: 99,
    description: 'economy_lever_ledger — atribuição de economia por-lever (Token Economy)',
    sql: `
      CREATE TABLE IF NOT EXISTS economy_lever_ledger (
        id            TEXT PRIMARY KEY,
        ts            INTEGER NOT NULL,
        session_id    TEXT NOT NULL,
        node_id       TEXT,
        lever         TEXT NOT NULL,
        tokens_before INTEGER NOT NULL,
        tokens_after  INTEGER NOT NULL,
        saved         INTEGER NOT NULL,
        accepted      INTEGER NOT NULL DEFAULT 0,
        gate_outcome  TEXT NOT NULL DEFAULT 'passthrough'
      );
      CREATE INDEX IF NOT EXISTS idx_lev_ledger_session ON economy_lever_ledger(session_id);
      CREATE INDEX IF NOT EXISTS idx_lev_ledger_lever_ts ON economy_lever_ledger(lever, ts);
    `,
  },
  {
    version: 100,
    description: 'perf_records — raw learning records (PerfRecord) persisted by lifecycle hooks',
    sql: `
      CREATE TABLE IF NOT EXISTS perf_records (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL,
        agent_id      TEXT NOT NULL,
        node_id       TEXT NOT NULL,
        harness_delta REAL NOT NULL DEFAULT 0,
        ac_passed     INTEGER NOT NULL DEFAULT 0,
        cycle_time_ms INTEGER NOT NULL DEFAULT 0,
        ts            INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_perf_records_project ON perf_records(project_id);
      CREATE INDEX IF NOT EXISTS idx_perf_records_agent   ON perf_records(project_id, agent_id);
    `,
  },
]
