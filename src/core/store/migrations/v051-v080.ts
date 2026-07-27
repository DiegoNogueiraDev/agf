/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SQLite migration definitions for versions 51–80.
 * Pure data — no runtime logic. Imported and merged by index.ts.
 */

import type { Migration } from './v001-v020.js'

export const migrationsV051_V080: Migration[] = [
  {
    version: 51,
    description: 'Guardrail executions for unified quality gate tracking (Meyer Design by Contract 1986)',
    sql: `
      CREATE TABLE IF NOT EXISTS guardrail_executions (
        id          TEXT PRIMARY KEY,
        trace_id    TEXT REFERENCES execution_traces(id),
        name        TEXT NOT NULL,
        position    TEXT NOT NULL,
        passed      INTEGER NOT NULL,
        score       REAL,
        latency_ms  INTEGER,
        strategy    TEXT NOT NULL DEFAULT 'fail_closed',
        details     TEXT DEFAULT '{}',
        created_at  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_guardrail_trace ON guardrail_executions(trace_id);
      CREATE INDEX IF NOT EXISTS idx_guardrail_name ON guardrail_executions(name);
    `,
  },
  {
    version: 52,
    description:
      'Decision log for confidence scorer replay and counterfactual analysis (von Neumann-Morgenstern 1944, Pearl 2000)',
    sql: `
      CREATE TABLE IF NOT EXISTS decision_log (
        id                  TEXT PRIMARY KEY,
        trace_id            TEXT REFERENCES execution_traces(id),
        node_id             TEXT NOT NULL,
        decision            TEXT NOT NULL,
        confidence_score    REAL NOT NULL,
        evidence            TEXT NOT NULL,
        weights_used        TEXT NOT NULL,
        policy_name         TEXT DEFAULT 'default',
        guardrail_pass_rate REAL,
        outcome             TEXT,
        created_at          TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_decision_node ON decision_log(node_id);
      CREATE INDEX IF NOT EXISTS idx_decision_trace ON decision_log(trace_id);
      CREATE INDEX IF NOT EXISTS idx_decision_outcome ON decision_log(outcome);
    `,
  },
  {
    version: 53,
    description: 'Experiment tracking — datasets, experiments, results (Fisher Hypothesis Testing 1925)',
    sql: `
      CREATE TABLE IF NOT EXISTS eval_datasets (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        source      TEXT NOT NULL,
        entry_count INTEGER DEFAULT 0,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS eval_dataset_entries (
        id              TEXT PRIMARY KEY,
        dataset_id      TEXT NOT NULL REFERENCES eval_datasets(id),
        input           TEXT NOT NULL,
        expected_output TEXT,
        metadata        TEXT DEFAULT '{}',
        created_at      TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_entries_dataset ON eval_dataset_entries(dataset_id);

      CREATE TABLE IF NOT EXISTS eval_experiments (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        dataset_id       TEXT NOT NULL REFERENCES eval_datasets(id),
        evaluator_config TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'pending',
        summary          TEXT,
        created_at       TEXT NOT NULL,
        completed_at     TEXT
      );

      CREATE TABLE IF NOT EXISTS eval_experiment_results (
        id            TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES eval_experiments(id),
        entry_id      TEXT NOT NULL REFERENCES eval_dataset_entries(id),
        actual_output TEXT,
        scores        TEXT NOT NULL,
        trace_id      TEXT,
        created_at    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_results_experiment ON eval_experiment_results(experiment_id);
    `,
  },
  {
    version: 54,
    description: 'Quality policies with default seed (Lamport Safety/Liveness Properties 1977)',
    sql: `
      CREATE TABLE IF NOT EXISTS quality_policies (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        gates      TEXT NOT NULL,
        active     INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT OR IGNORE INTO quality_policies (id, name, gates, active, created_at, updated_at)
      VALUES (
        'policy_default',
        'default',
        '[{"metric":"harness_score","operator":">=","threshold":70,"severity":"block"},{"metric":"security_score","operator":">=","threshold":80,"severity":"block"},{"metric":"test_pass_rate","operator":">=","threshold":80,"severity":"warn"},{"metric":"trend_direction","operator":"!=","threshold":-1,"severity":"warn"}]',
        1,
        datetime('now'),
        datetime('now')
      );
    `,
  },
  {
    version: 55,
    description: 'Security events audit log (Hermes-agent integration — input sanitization)',
    sql: `
      CREATE TABLE IF NOT EXISTS security_events (
        id          TEXT PRIMARY KEY,
        event_type  TEXT NOT NULL,
        severity    TEXT NOT NULL DEFAULT 'medium',
        input_hash  TEXT NOT NULL,
        details     TEXT NOT NULL,
        tool_name   TEXT,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);
    `,
  },
  {
    version: 56,
    description: 'Tool result persistence store (Hermes-agent integration — audit/replay)',
    sql: `
      CREATE TABLE IF NOT EXISTS tool_results (
        id           TEXT PRIMARY KEY,
        project_id   TEXT NOT NULL,
        trace_id     TEXT,
        tool_name    TEXT NOT NULL,
        tool_args    TEXT,
        result       TEXT NOT NULL,
        result_hash  TEXT NOT NULL,
        size_bytes   INTEGER NOT NULL DEFAULT 0,
        truncated    INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tool_results_trace ON tool_results(trace_id);
      CREATE INDEX IF NOT EXISTS idx_tool_results_tool ON tool_results(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_results_project ON tool_results(project_id);
    `,
  },
  {
    version: 57,
    description: 'Session recall store with FTS5 (Hermes-agent integration — cross-session search)',
    sql: `
      CREATE TABLE IF NOT EXISTS session_summaries (
        id                 TEXT PRIMARY KEY,
        session_id         TEXT NOT NULL UNIQUE,
        parent_session_id  TEXT,
        summary            TEXT NOT NULL,
        topics             TEXT NOT NULL DEFAULT '[]',
        node_ids           TEXT DEFAULT '[]',
        tokens_used        INTEGER DEFAULT 0,
        cost_usd           REAL DEFAULT 0,
        created_at         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_summaries_parent ON session_summaries(parent_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_created ON session_summaries(created_at);
      CREATE VIRTUAL TABLE IF NOT EXISTS session_summaries_fts USING fts5(
        summary, topics, content='session_summaries', content_rowid='rowid'
      );
    `,
  },
  {
    version: 58,
    description: 'Sub-agent delegation tracking (Hermes-agent integration — orchestration)',
    sql: `
      CREATE TABLE IF NOT EXISTS delegations (
        id                TEXT PRIMARY KEY,
        parent_agent_id   TEXT NOT NULL,
        child_agent_id    TEXT NOT NULL,
        objective         TEXT NOT NULL,
        allowed_tools     TEXT NOT NULL DEFAULT '[]',
        status            TEXT NOT NULL DEFAULT 'running',
        result_summary    TEXT,
        tokens_used       INTEGER NOT NULL DEFAULT 0,
        depth             INTEGER NOT NULL DEFAULT 1,
        created_at        TEXT NOT NULL,
        completed_at      TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_delegations_parent ON delegations(parent_agent_id);
      CREATE INDEX IF NOT EXISTS idx_delegations_status ON delegations(status);
    `,
  },
  {
    version: 59,
    description: 'Skill system enhancement — toolchain, triggers, context template (Hermes-agent integration)',
    sql: `
      ALTER TABLE custom_skills ADD COLUMN toolchain TEXT DEFAULT '[]';
      ALTER TABLE custom_skills ADD COLUMN triggers TEXT DEFAULT '[]';
      ALTER TABLE custom_skills ADD COLUMN context_template TEXT;
    `,
  },
  {
    version: 60,
    description: 'Browser-harness — CDP sessions, agent-editable helpers registry, audit log, runs',
    sql: `
      CREATE TABLE IF NOT EXISTS bh_sessions (
        id            TEXT PRIMARY KEY,
        cdp_endpoint  TEXT NOT NULL,
        pid           INTEGER,
        status        TEXT NOT NULL,
        started_at    INTEGER NOT NULL,
        closed_at     INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_bh_sessions_status ON bh_sessions(status);

      CREATE TABLE IF NOT EXISTS bh_helpers (
        name         TEXT NOT NULL,
        version      INTEGER NOT NULL,
        source       TEXT NOT NULL,
        signature    TEXT NOT NULL,
        origin       TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        created_by   TEXT,
        PRIMARY KEY (name, version)
      );
      CREATE INDEX IF NOT EXISTS idx_bh_helpers_origin ON bh_helpers(origin);

      CREATE TABLE IF NOT EXISTS bh_audit (
        id           TEXT PRIMARY KEY,
        session_id   TEXT NOT NULL,
        action       TEXT NOT NULL,
        payload      TEXT NOT NULL,
        result       TEXT,
        at           INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bh_audit_session ON bh_audit(session_id);
      CREATE INDEX IF NOT EXISTS idx_bh_audit_action ON bh_audit(action);

      CREATE TABLE IF NOT EXISTS bh_runs (
        id            TEXT PRIMARY KEY,
        session_id    TEXT NOT NULL,
        node_id       TEXT,
        prompt        TEXT NOT NULL,
        plan          TEXT NOT NULL,
        results       TEXT NOT NULL DEFAULT '[]',
        verdict       TEXT NOT NULL,
        duration_ms   INTEGER NOT NULL,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bh_runs_session ON bh_runs(session_id);
      CREATE INDEX IF NOT EXISTS idx_bh_runs_verdict ON bh_runs(verdict);
    `,
  },
  {
    version: 61,
    description: 'Journey runs — per-variant execution history with step screenshots + OCR',
    sql: `
      CREATE TABLE IF NOT EXISTS journey_runs (
        id            TEXT PRIMARY KEY,
        map_id        TEXT NOT NULL,
        variant_id    TEXT,
        node_id       TEXT,
        prompt        TEXT,
        plan          TEXT NOT NULL,
        results       TEXT NOT NULL DEFAULT '[]',
        verdict       TEXT NOT NULL,
        duration_ms   INTEGER NOT NULL,
        created_at    INTEGER NOT NULL,
        finished_at   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_journey_runs_map ON journey_runs(map_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_journey_runs_node ON journey_runs(node_id);
      CREATE INDEX IF NOT EXISTS idx_journey_runs_verdict ON journey_runs(verdict);
    `,
  },
  {
    version: 62,
    description: 'Lifecycle violation log — records gate bypass attempts with reason, decision node, severity',
    sql: `
      CREATE TABLE IF NOT EXISTS lifecycle_violations (
        id               TEXT PRIMARY KEY,
        gate_id          TEXT NOT NULL,
        node_id          TEXT NOT NULL,
        sprint           TEXT NOT NULL,
        reason           TEXT NOT NULL,
        decision_node_id TEXT,
        severity         TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high')),
        mode             TEXT NOT NULL CHECK(mode IN ('strict', 'advisory')),
        created_at       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_violations_sprint   ON lifecycle_violations(sprint);
      CREATE INDEX IF NOT EXISTS idx_violations_severity ON lifecycle_violations(severity);
      CREATE INDEX IF NOT EXISTS idx_violations_gate     ON lifecycle_violations(gate_id);
    `,
  },
  {
    version: 63,
    description:
      'Subtask artifacts store (v11 Context-Pollination) — structured outputs per subtask for sibling-context assembly',
    sql: `
      CREATE TABLE IF NOT EXISTS subtask_artifacts (
        id           TEXT PRIMARY KEY,
        project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        node_id      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        epic_id      TEXT NOT NULL,
        kind         TEXT NOT NULL CHECK(kind IN ('diff','file','interface','decision','note')),
        path         TEXT,
        content      TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_epic   ON subtask_artifacts(epic_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_artifacts_node   ON subtask_artifacts(node_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_dedup
        ON subtask_artifacts(project_id, epic_id, kind, content_hash);
    `,
  },
  {
    version: 64,
    description:
      'Tool telemetry columns (v11 Maestro Phase 1) — adds success, duration_ms, error_kind to tool_token_usage for deprecation gate evidence',
    sql: `
      ALTER TABLE tool_token_usage ADD COLUMN success     INTEGER;
      ALTER TABLE tool_token_usage ADD COLUMN duration_ms INTEGER;
      ALTER TABLE tool_token_usage ADD COLUMN error_kind  TEXT;
      CREATE INDEX IF NOT EXISTS idx_ttu_success  ON tool_token_usage(success);
      CREATE INDEX IF NOT EXISTS idx_ttu_err_kind ON tool_token_usage(error_kind);
    `,
  },
  {
    version: 65,
    description:
      'Feature-depth file-level baselines — per-file score history for finish_task regression gate, plan_sprint risk index, and quadrant-crossing memory entries',
    sql: `
      CREATE TABLE IF NOT EXISTS feature_depth_baselines (
        project_id  TEXT NOT NULL,
        rel_path    TEXT NOT NULL,
        module      TEXT NOT NULL,
        score       REAL NOT NULL,
        quadrant    TEXT NOT NULL,
        test_loc    INTEGER NOT NULL,
        source_loc  INTEGER NOT NULL,
        stored_at   TEXT NOT NULL,
        git_commit  TEXT,
        PRIMARY KEY (project_id, rel_path)
      );
      CREATE INDEX IF NOT EXISTS idx_fd_module ON feature_depth_baselines(project_id, module);
    `,
  },
  {
    version: 66,
    description:
      'knowledge_docs_project index — enables efficient per-project FTS5 post-filter; prevents full-table scan in multi-project daemons',
    sql: `
      CREATE INDEX IF NOT EXISTS knowledge_docs_project ON knowledge_documents(project_id);
    `,
  },
  {
    version: 67,
    description:
      'embeddings table: add embedding_blob (BLOB) and vector_dim (INT) columns for ONNX dense-vector storage alongside legacy TF-IDF float arrays',
    sql: `
      CREATE TABLE IF NOT EXISTS embeddings (
        id             TEXT PRIMARY KEY,
        source         TEXT NOT NULL,
        source_id      TEXT NOT NULL,
        text           TEXT NOT NULL,
        embedding      BLOB NOT NULL,
        embedding_type TEXT NOT NULL DEFAULT 'tfidf',
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        embedding_blob BLOB,
        vector_dim     INTEGER
      );
    `,
  },
  {
    version: 68,
    description:
      'EPIC 5 Self-Learning: agent_performance (per-agent score + decay) and reasoning_trajectories (ReasoningBank) tables',
    sql: `
      CREATE TABLE IF NOT EXISTS agent_performance (
        id           TEXT PRIMARY KEY,
        project_id   TEXT NOT NULL REFERENCES projects(id),
        agent_name   TEXT NOT NULL,
        task_kind    TEXT NOT NULL,
        harness_score REAL NOT NULL DEFAULT 0,
        samples      INTEGER NOT NULL DEFAULT 0,
        last_used_ts TEXT NOT NULL,
        decay_factor REAL NOT NULL DEFAULT 1.0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        UNIQUE (project_id, agent_name, task_kind)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_perf_project ON agent_performance(project_id);
      CREATE INDEX IF NOT EXISTS idx_agent_perf_kind    ON agent_performance(project_id, task_kind);

      CREATE TABLE IF NOT EXISTS reasoning_trajectories (
        id           TEXT PRIMARY KEY,
        project_id   TEXT NOT NULL REFERENCES projects(id),
        node_id      TEXT REFERENCES nodes(id),
        agent_name   TEXT NOT NULL,
        task_kind    TEXT NOT NULL,
        trajectory   TEXT NOT NULL,
        outcome_score REAL NOT NULL DEFAULT 0,
        samples      INTEGER NOT NULL DEFAULT 1,
        last_used_ts TEXT NOT NULL,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rt_project ON reasoning_trajectories(project_id);
      CREATE INDEX IF NOT EXISTS idx_rt_kind    ON reasoning_trajectories(project_id, task_kind);
      CREATE INDEX IF NOT EXISTS idx_rt_node    ON reasoning_trajectories(node_id);
    `,
  },
  {
    version: 69,
    description:
      'Hooks Sprint 3 — hook_handlers (runtime registrations) + hook_handler_stats (per-handler observability counters)',
    sql: `
      CREATE TABLE IF NOT EXISTS hook_handlers (
        id            TEXT PRIMARY KEY,
        channel       TEXT NOT NULL,
        kind          TEXT NOT NULL,           -- 'shell' | 'inline-unsafe' | 'module' (future)
        command       TEXT,                    -- shell command path
        command_args  TEXT,                    -- JSON array
        env           TEXT,                    -- JSON object {KEY:VALUE}
        timeout_ms    INTEGER NOT NULL DEFAULT 5000,
        priority      INTEGER NOT NULL DEFAULT 0,
        enabled       INTEGER NOT NULL DEFAULT 1,
        description   TEXT,
        origin        TEXT NOT NULL DEFAULT 'runtime',  -- 'runtime' | 'config' | 'builtin'
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hook_handlers_channel  ON hook_handlers(channel);
      CREATE INDEX IF NOT EXISTS idx_hook_handlers_origin   ON hook_handlers(origin);

      CREATE TABLE IF NOT EXISTS hook_handler_stats (
        handler_id    TEXT PRIMARY KEY,
        call_count    INTEGER NOT NULL DEFAULT 0,
        p50_duration  REAL,
        p95_duration  REAL,
        last_error    TEXT,
        circuit_state TEXT NOT NULL DEFAULT 'closed',
        updated_at    TEXT NOT NULL
      );
    `,
  },
  {
    version: 70,
    // §EPIC-16.2 — Creates llm_call_ledger (was referenced by BudgetLedger
    // and v66 schema-tests but never actually created in any prior migration —
    // see broken v66 tests). Adds provider_used + fallback_count for failover
    // observability. Task description named this "v74" but head was v69 at
    // implementation time; using v70 keeps versions monotonic.
    description: 'EPIC 16 LLM Failover — create llm_call_ledger with provider_used + fallback_count',
    sql: `
      CREATE TABLE IF NOT EXISTS llm_call_ledger (
        id                     TEXT PRIMARY KEY,
        ts                     INTEGER NOT NULL,
        project_id             TEXT,
        cell_id                TEXT,
        run_id                 TEXT,
        node_id                TEXT,
        caller                 TEXT,
        provider               TEXT NOT NULL,
        model                  TEXT NOT NULL,
        input_tokens           INTEGER NOT NULL DEFAULT 0,
        output_tokens          INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens    INTEGER,
        cache_creation_tokens  INTEGER,
        cost_usd               REAL NOT NULL DEFAULT 0,
        latency_ms             INTEGER,
        status                 TEXT NOT NULL,
        error_kind             TEXT,
        provider_used          TEXT,
        fallback_count         INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_llm_ledger_cell ON llm_call_ledger(cell_id);
      CREATE INDEX IF NOT EXISTS idx_llm_ledger_run  ON llm_call_ledger(run_id);
      CREATE INDEX IF NOT EXISTS idx_llm_ledger_ts   ON llm_call_ledger(ts);
    `,
  },
  {
    version: 71,
    // §EPIC-18.T01 — Evals + Golden Dataset.
    // eval_golden: persisted (input, expected) pairs per tool with scorer kind.
    // eval_run: per-row scoring outcome of running a golden through a model,
    // capturing pass/fail, latency, model_used and cost_usd for empirical
    // model routing (modelHint feedback loop, AC5).
    description: 'EPIC 18 Evals — create eval_golden + eval_run tables with indexes',
    sql: `
      CREATE TABLE IF NOT EXISTS eval_golden (
        id           TEXT PRIMARY KEY,
        input        TEXT NOT NULL,
        expected     TEXT NOT NULL,
        scorer_kind  TEXT NOT NULL,
        tool         TEXT NOT NULL,
        project_id   TEXT,
        metadata     TEXT,
        tags         TEXT,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_eval_golden_tool        ON eval_golden(tool);
      CREATE INDEX IF NOT EXISTS idx_eval_golden_project     ON eval_golden(project_id);
      CREATE INDEX IF NOT EXISTS idx_eval_golden_scorer_kind ON eval_golden(scorer_kind);

      CREATE TABLE IF NOT EXISTS eval_run (
        id          TEXT PRIMARY KEY,
        run_id      TEXT NOT NULL,
        golden_id   TEXT NOT NULL,
        score       REAL NOT NULL,
        passed      INTEGER NOT NULL,
        latency_ms  INTEGER,
        model_used  TEXT,
        cost_usd    REAL NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (golden_id) REFERENCES eval_golden(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_eval_run_run_id    ON eval_run(run_id);
      CREATE INDEX IF NOT EXISTS idx_eval_run_golden_id ON eval_run(golden_id);
      CREATE INDEX IF NOT EXISTS idx_eval_run_model     ON eval_run(model_used);
    `,
  },
  {
    version: 72,
    // §EPIC-19.T01 — Multi-Agent Topologies.
    // swarm_session: one row per swarm orchestration. swarm_member: one row
    // per agent participating in the session, with role (queen|worker|judge)
    // and status (idle|running|done|failed). The skeleton persists state so
    // a crashed coordinator can be resumed; topology-specific orchestration
    // (hierarchical/ring/majority) layers on top in T02-T04.
    description: 'EPIC 19 Swarm — create swarm_sessions + swarm_agents tables',
    sql: `
      CREATE TABLE IF NOT EXISTS swarm_sessions (
        id           TEXT PRIMARY KEY,
        topology     TEXT NOT NULL,
        consensus    TEXT NOT NULL,
        status       TEXT NOT NULL,
        max_agents   INTEGER NOT NULL,
        strategy     TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_swarm_sessions_status   ON swarm_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_swarm_sessions_topology ON swarm_sessions(topology);

      CREATE TABLE IF NOT EXISTS swarm_agents (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        role        TEXT NOT NULL,
        status      TEXT NOT NULL,
        result      TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT,
        FOREIGN KEY (session_id) REFERENCES swarm_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_swarm_agents_session ON swarm_agents(session_id);
      CREATE INDEX IF NOT EXISTS idx_swarm_agents_role    ON swarm_agents(role);
    `,
  },
  {
    version: 73,
    // §EPIC-20.T02 — A2A Direct Communication mailbox.
    // Ring-buffer-backed mailbox per recipient agent. Status flow:
    //   pending → delivered → acked. The mailbox is COURIER, never authoritative —
    //   real decisions still write to the graph (see §EPIC-20 design notes).
    description: 'EPIC 20 A2A — create a2a_mailbox table for agent-to-agent messages',
    sql: `
      CREATE TABLE IF NOT EXISTS a2a_mailbox (
        id            TEXT PRIMARY KEY,
        from_agent    TEXT NOT NULL,
        to_agent      TEXT NOT NULL,
        body          TEXT NOT NULL,
        status        TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        delivered_at  TEXT,
        acked_at      TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_a2a_mailbox_to       ON a2a_mailbox(to_agent);
      CREATE INDEX IF NOT EXISTS idx_a2a_mailbox_status   ON a2a_mailbox(status);
      CREATE INDEX IF NOT EXISTS idx_a2a_mailbox_to_status ON a2a_mailbox(to_agent, status);
    `,
  },
  {
    version: 76,
    // §EPIC-22.A1 — Autonomy 100% retry persistence.
    // retry_queue persiste falhas para que processo crashes não percam state.
    // RetryWorker (E22.A2) varre status='pending' AND next_retry_ms <= now,
    // re-executa com backoff exponencial. EventReactor (E22.A4) enqueue em
    // task:error. Status flow: pending → done | abandoned (após MAX_ATTEMPTS).
    description: 'EPIC 22 Autonomy — retry_queue table for persistent retry across crashes',
    sql: `
      CREATE TABLE IF NOT EXISTS retry_queue (
        id            TEXT PRIMARY KEY,
        task_id       TEXT NOT NULL,
        attempt       INTEGER NOT NULL DEFAULT 0,
        next_retry_ms INTEGER NOT NULL,
        last_error    TEXT,
        status        TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES nodes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_retry_queue_status     ON retry_queue(status);
      CREATE INDEX IF NOT EXISTS idx_retry_queue_next_retry ON retry_queue(next_retry_ms);
      CREATE INDEX IF NOT EXISTS idx_retry_queue_task       ON retry_queue(task_id);
    `,
  },
  {
    version: 77,
    // §EPIC-22.B1 — error_patterns table for recurring-error tracking.
    // recordError() hashes error.message + classifies via classifyError, then UPSERTs.
    // Adaptive retry policy (B2) reads count to decide escalation vs backoff.
    description: 'EPIC 22 Autonomy — error_patterns table for adaptive retry intelligence',
    sql: `
      CREATE TABLE IF NOT EXISTS error_patterns (
        id          TEXT PRIMARY KEY,
        error_hash  TEXT NOT NULL UNIQUE,
        category    TEXT NOT NULL,
        message     TEXT NOT NULL,
        count       INTEGER NOT NULL DEFAULT 1,
        first_seen  TEXT NOT NULL,
        last_seen   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_error_patterns_hash     ON error_patterns(error_hash);
      CREATE INDEX IF NOT EXISTS idx_error_patterns_category ON error_patterns(category);
      CREATE INDEX IF NOT EXISTS idx_error_patterns_count    ON error_patterns(count DESC);
    `,
  },
  {
    version: 78,
    // §EPIC-22.B2 — lessons_learned table for adaptive retry escalation memory.
    // RetryWorker insere lesson quando pattern.count>2 → abandon imediato.
    // Sprint 4 D5 lerá esta tabela em start_task para injetar no modelHint.
    description: 'EPIC 22 Autonomy — lessons_learned table for adaptive escalation memory',
    sql: `
      CREATE TABLE IF NOT EXISTS lessons_learned (
        id                  TEXT PRIMARY KEY,
        pattern_hash        TEXT NOT NULL,
        description         TEXT NOT NULL,
        recommended_action  TEXT NOT NULL,
        applied_count       INTEGER NOT NULL DEFAULT 1,
        confidence          REAL NOT NULL DEFAULT 0.5,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lessons_pattern ON lessons_learned(pattern_hash);
      CREATE INDEX IF NOT EXISTS idx_lessons_action  ON lessons_learned(recommended_action);
    `,
  },
  {
    version: 79,
    // §EPIC-22.D3 — lessons_learned source provenance + confidence index.
    // Add 'source' column so D4 lessons-persister sabe se veio de retry-worker
    // (B2), dream-engine wake (D4), ou outras origens.
    description: 'EPIC 22 Autonomy — lessons_learned source column + confidence index',
    sql: `
      ALTER TABLE lessons_learned ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown';
      CREATE INDEX IF NOT EXISTS idx_lessons_confidence ON lessons_learned(confidence DESC);
      CREATE INDEX IF NOT EXISTS idx_lessons_source     ON lessons_learned(source);
    `,
  },
  {
    version: 80,
    // §EPIC-9.T02 — decide tool dedicated table.
    // Stores intent + options_json + chosen + reasoning + outcome (success/result/summary).
    // Distinct from decision_log (v52) which is the confidence-scorer replay log;
    // here, the user/agent records actionable decisions for stats + audit.
    description: 'EPIC 9 Decision Intelligence — decisions table for record/outcome/stats/audit',
    sql: `
      CREATE TABLE IF NOT EXISTS decisions (
        id              TEXT PRIMARY KEY,
        intent          TEXT NOT NULL,
        options_json    TEXT NOT NULL,
        chosen          TEXT NOT NULL,
        reasoning       TEXT NOT NULL,
        node_id         TEXT,
        success         INTEGER,
        result_summary  TEXT,
        outcome_at      TEXT,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_intent  ON decisions(intent);
      CREATE INDEX IF NOT EXISTS idx_decisions_node    ON decisions(node_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_success ON decisions(success);
      CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at);
    `,
  },
]
