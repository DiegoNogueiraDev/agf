/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SQLite migration definitions for versions 1–20.
 * Pure data — no runtime logic. Imported and merged by index.ts.
 */

export interface Migration {
  version: number
  description: string
  sql: string
}

export const migrationsV001_V020: Migration[] = [
  {
    version: 1,
    description: 'Initial schema — projects, nodes, edges, snapshots, import_history',
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id                  TEXT PRIMARY KEY,
        project_id          TEXT NOT NULL REFERENCES projects(id),
        type                TEXT NOT NULL,
        title               TEXT NOT NULL,
        description         TEXT,
        status              TEXT NOT NULL DEFAULT 'backlog',
        priority            INTEGER NOT NULL DEFAULT 3,
        xp_size             TEXT,
        estimate_minutes    INTEGER,
        tags                TEXT, -- JSON array
        parent_id           TEXT,
        sprint              TEXT,
        source_file         TEXT,
        source_start_line   INTEGER,
        source_end_line     INTEGER,
        source_confidence   REAL,
        acceptance_criteria TEXT, -- JSON array
        blocked             INTEGER NOT NULL DEFAULT 0,
        metadata            TEXT, -- JSON object
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS edges (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL REFERENCES projects(id),
        from_node     TEXT NOT NULL REFERENCES nodes(id),
        to_node       TEXT NOT NULL REFERENCES nodes(id),
        relation_type TEXT NOT NULL,
        weight        REAL,
        reason        TEXT,
        metadata      TEXT, -- JSON object
        created_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id  TEXT NOT NULL REFERENCES projects(id),
        data        TEXT NOT NULL, -- JSON dump of GraphDocument
        created_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS import_history (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id     TEXT NOT NULL REFERENCES projects(id),
        source_file    TEXT NOT NULL,
        nodes_created  INTEGER NOT NULL DEFAULT 0,
        edges_created  INTEGER NOT NULL DEFAULT 0,
        imported_at    TEXT NOT NULL
      );

      -- Indexes for common query patterns
      CREATE INDEX IF NOT EXISTS idx_nodes_project     ON nodes(project_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_type        ON nodes(project_id, type);
      CREATE INDEX IF NOT EXISTS idx_nodes_status      ON nodes(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent      ON nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_edges_project     ON edges(project_id);
      CREATE INDEX IF NOT EXISTS idx_edges_from        ON edges(from_node);
      CREATE INDEX IF NOT EXISTS idx_edges_to          ON edges(to_node);
      CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project_id);
      CREATE INDEX IF NOT EXISTS idx_imports_project   ON import_history(project_id);
    `,
  },
  {
    version: 2,
    description: 'FTS5 full-text search index on nodes',
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
        title, description, tags,
        content='nodes', content_rowid='rowid'
      );

      -- Populate FTS from existing nodes
      INSERT INTO nodes_fts(rowid, title, description, tags)
        SELECT rowid, title, COALESCE(description, ''), COALESCE(tags, '')
        FROM nodes;

      -- Sync triggers: keep FTS in sync with nodes table
      CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
        INSERT INTO nodes_fts(rowid, title, description, tags)
          VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
        INSERT INTO nodes_fts(nodes_fts, rowid, title, description, tags)
          VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
        INSERT INTO nodes_fts(nodes_fts, rowid, title, description, tags)
          VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''));
        INSERT INTO nodes_fts(rowid, title, description, tags)
          VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''));
      END;
    `,
  },
  {
    version: 3,
    description: 'Docs cache table with FTS5 index for Context7 documentation',
    sql: `
      CREATE TABLE IF NOT EXISTS docs_cache (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        lib_id       TEXT NOT NULL,
        lib_name     TEXT NOT NULL,
        version      TEXT,
        content      TEXT NOT NULL,
        fetched_at   TEXT NOT NULL,
        UNIQUE(lib_id)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
        lib_name, content,
        content='docs_cache', content_rowid='id'
      );

      -- Sync triggers: keep FTS in sync with docs_cache table
      CREATE TRIGGER IF NOT EXISTS docs_fts_insert AFTER INSERT ON docs_cache BEGIN
        INSERT INTO docs_fts(rowid, lib_name, content)
          VALUES (NEW.id, NEW.lib_name, NEW.content);
      END;

      CREATE TRIGGER IF NOT EXISTS docs_fts_delete AFTER DELETE ON docs_cache BEGIN
        INSERT INTO docs_fts(docs_fts, rowid, lib_name, content)
          VALUES ('delete', OLD.id, OLD.lib_name, OLD.content);
      END;

      CREATE TRIGGER IF NOT EXISTS docs_fts_update AFTER UPDATE ON docs_cache BEGIN
        INSERT INTO docs_fts(docs_fts, rowid, lib_name, content)
          VALUES ('delete', OLD.id, OLD.lib_name, OLD.content);
        INSERT INTO docs_fts(rowid, lib_name, content)
          VALUES (NEW.id, NEW.lib_name, NEW.content);
      END;
    `,
  },
  {
    version: 4,
    description: 'Knowledge documents table with FTS5 index for unified knowledge store',
    sql: `
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id            TEXT PRIMARY KEY,
        source_type   TEXT NOT NULL,
        source_id     TEXT NOT NULL,
        title         TEXT NOT NULL,
        content       TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        chunk_index   INTEGER NOT NULL DEFAULT 0,
        metadata      TEXT, -- JSON object
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_source_type ON knowledge_documents(source_type);
      CREATE INDEX IF NOT EXISTS idx_knowledge_source_id ON knowledge_documents(source_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_content_hash ON knowledge_documents(content_hash);

      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        title, content,
        content='knowledge_documents', content_rowid='rowid'
      );

      -- Sync triggers: keep FTS in sync with knowledge_documents table
      CREATE TRIGGER IF NOT EXISTS knowledge_fts_insert AFTER INSERT ON knowledge_documents BEGIN
        INSERT INTO knowledge_fts(rowid, title, content)
          VALUES (NEW.rowid, NEW.title, NEW.content);
      END;

      CREATE TRIGGER IF NOT EXISTS knowledge_fts_delete AFTER DELETE ON knowledge_documents BEGIN
        INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content)
          VALUES ('delete', OLD.rowid, OLD.title, OLD.content);
      END;

      CREATE TRIGGER IF NOT EXISTS knowledge_fts_update AFTER UPDATE ON knowledge_documents BEGIN
        INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content)
          VALUES ('delete', OLD.rowid, OLD.title, OLD.content);
        INSERT INTO knowledge_fts(rowid, title, content)
          VALUES (NEW.rowid, NEW.title, NEW.content);
      END;
    `,
  },
  {
    version: 5,
    description: 'Project settings key-value store for lifecycle overrides',
    sql: `
      CREATE TABLE IF NOT EXISTS project_settings (
        project_id  TEXT NOT NULL REFERENCES projects(id),
        key         TEXT NOT NULL,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (project_id, key)
      );
    `,
  },
  {
    version: 6,
    description: 'Code Intelligence — symbols, relations, FTS5 index, index metadata',
    sql: `
      CREATE TABLE IF NOT EXISTS code_symbols (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        name        TEXT NOT NULL,
        kind        TEXT NOT NULL,
        file        TEXT NOT NULL,
        start_line  INTEGER NOT NULL,
        end_line    INTEGER NOT NULL,
        exported    INTEGER NOT NULL DEFAULT 0,
        module_path TEXT,
        signature   TEXT,
        metadata    TEXT,
        indexed_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS code_relations (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        from_symbol TEXT NOT NULL REFERENCES code_symbols(id),
        to_symbol   TEXT NOT NULL REFERENCES code_symbols(id),
        type        TEXT NOT NULL,
        file        TEXT,
        line        INTEGER,
        metadata    TEXT,
        indexed_at  TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS code_symbols_fts USING fts5(
        name, file, signature,
        content='code_symbols', content_rowid='rowid'
      );

      -- FTS5 sync triggers
      CREATE TRIGGER IF NOT EXISTS code_fts_insert AFTER INSERT ON code_symbols BEGIN
        INSERT INTO code_symbols_fts(rowid, name, file, signature)
          VALUES (NEW.rowid, NEW.name, NEW.file, COALESCE(NEW.signature, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS code_fts_delete AFTER DELETE ON code_symbols BEGIN
        INSERT INTO code_symbols_fts(code_symbols_fts, rowid, name, file, signature)
          VALUES ('delete', OLD.rowid, OLD.name, OLD.file, COALESCE(OLD.signature, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS code_fts_update AFTER UPDATE ON code_symbols BEGIN
        INSERT INTO code_symbols_fts(code_symbols_fts, rowid, name, file, signature)
          VALUES ('delete', OLD.rowid, OLD.name, OLD.file, COALESCE(OLD.signature, ''));
        INSERT INTO code_symbols_fts(rowid, name, file, signature)
          VALUES (NEW.rowid, NEW.name, NEW.file, COALESCE(NEW.signature, ''));
      END;

      CREATE TABLE IF NOT EXISTS code_index_meta (
        project_id    TEXT PRIMARY KEY,
        last_indexed  TEXT NOT NULL,
        file_count    INTEGER DEFAULT 0,
        symbol_count  INTEGER DEFAULT 0,
        relation_count INTEGER DEFAULT 0,
        git_hash      TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_code_sym_project ON code_symbols(project_id);
      CREATE INDEX IF NOT EXISTS idx_code_sym_name ON code_symbols(name);
      CREATE INDEX IF NOT EXISTS idx_code_sym_file ON code_symbols(file);
      CREATE INDEX IF NOT EXISTS idx_code_rel_from ON code_relations(from_symbol);
      CREATE INDEX IF NOT EXISTS idx_code_rel_to ON code_relations(to_symbol);
      CREATE INDEX IF NOT EXISTS idx_code_rel_type ON code_relations(type);
    `,
  },
  {
    version: 7,
    description: 'Tool token usage tracking for benchmark analytics',
    sql: `
      CREATE TABLE IF NOT EXISTS tool_token_usage (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id    TEXT NOT NULL REFERENCES projects(id),
        tool_name     TEXT NOT NULL,
        input_tokens  INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        called_at     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ttu_project ON tool_token_usage(project_id);
      CREATE INDEX IF NOT EXISTS idx_ttu_tool    ON tool_token_usage(tool_name);
      CREATE INDEX IF NOT EXISTS idx_ttu_called  ON tool_token_usage(called_at);
    `,
  },
  {
    version: 8,
    description: 'Global mode — fs_path on projects, project_id on knowledge_documents',
    sql: `
      ALTER TABLE projects ADD COLUMN fs_path TEXT;
      CREATE INDEX IF NOT EXISTS idx_projects_fs_path ON projects(fs_path);

      ALTER TABLE knowledge_documents ADD COLUMN project_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge_documents(project_id);
    `,
  },
  {
    version: 9,
    description: 'Skill preferences and custom skills tables',
    sql: `
      CREATE TABLE IF NOT EXISTS skill_preferences (
        project_id  TEXT NOT NULL,
        skill_name  TEXT NOT NULL,
        enabled     INTEGER NOT NULL DEFAULT 1,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (project_id, skill_name)
      );

      CREATE TABLE IF NOT EXISTS custom_skills (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT 'know-me',
        phases      TEXT NOT NULL,
        instructions TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        UNIQUE(project_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_custom_skills_project ON custom_skills(project_id);
    `,
  },
  {
    version: 10,
    description: 'Edge deduplication — remove duplicates, add UNIQUE constraint',
    sql: `
      DELETE FROM edges WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM edges GROUP BY project_id, from_node, to_node, relation_type
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique
        ON edges(project_id, from_node, to_node, relation_type);
    `,
  },
  {
    version: 11,
    description: 'Journey maps + Knowledge quality scoring, usage tracking, and cross-source relations',
    sql: `
      CREATE TABLE IF NOT EXISTS journey_maps (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id),
        name        TEXT NOT NULL,
        url         TEXT,
        description TEXT,
        metadata    TEXT, -- JSON object
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS journey_screens (
        id          TEXT PRIMARY KEY,
        map_id      TEXT NOT NULL REFERENCES journey_maps(id) ON DELETE CASCADE,
        project_id  TEXT NOT NULL REFERENCES projects(id),
        title       TEXT NOT NULL,
        description TEXT,
        screenshot  TEXT, -- filename relative to journey-screenshots/
        url         TEXT,
        screen_type TEXT NOT NULL DEFAULT 'page',
        fields      TEXT, -- JSON array
        ctas        TEXT, -- JSON array
        metadata    TEXT, -- JSON object
        position_x  REAL DEFAULT 0,
        position_y  REAL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS journey_edges (
        id          TEXT PRIMARY KEY,
        map_id      TEXT NOT NULL REFERENCES journey_maps(id) ON DELETE CASCADE,
        project_id  TEXT NOT NULL REFERENCES projects(id),
        from_screen TEXT NOT NULL REFERENCES journey_screens(id) ON DELETE CASCADE,
        to_screen   TEXT NOT NULL REFERENCES journey_screens(id) ON DELETE CASCADE,
        label       TEXT,
        edge_type   TEXT NOT NULL DEFAULT 'navigation',
        metadata    TEXT, -- JSON object
        created_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS journey_variants (
        id          TEXT PRIMARY KEY,
        map_id      TEXT NOT NULL REFERENCES journey_maps(id) ON DELETE CASCADE,
        project_id  TEXT NOT NULL REFERENCES projects(id),
        name        TEXT NOT NULL,
        description TEXT,
        path        TEXT NOT NULL, -- JSON array of screen IDs
        created_at  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_journey_maps_project ON journey_maps(project_id);
      CREATE INDEX IF NOT EXISTS idx_journey_screens_map ON journey_screens(map_id);
      CREATE INDEX IF NOT EXISTS idx_journey_edges_map ON journey_edges(map_id);
      CREATE INDEX IF NOT EXISTS idx_journey_edges_from ON journey_edges(from_screen);
      CREATE INDEX IF NOT EXISTS idx_journey_edges_to ON journey_edges(to_screen);
      CREATE INDEX IF NOT EXISTS idx_journey_variants_map ON journey_variants(map_id);

      ALTER TABLE knowledge_documents ADD COLUMN quality_score REAL DEFAULT 0.5;
      ALTER TABLE knowledge_documents ADD COLUMN usage_count INTEGER DEFAULT 0;
      ALTER TABLE knowledge_documents ADD COLUMN last_accessed_at TEXT;
      ALTER TABLE knowledge_documents ADD COLUMN staleness_days INTEGER DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_knowledge_quality ON knowledge_documents(quality_score);
      CREATE INDEX IF NOT EXISTS idx_knowledge_usage ON knowledge_documents(usage_count);

      CREATE TABLE IF NOT EXISTS knowledge_relations (
        id          TEXT PRIMARY KEY,
        from_doc_id TEXT NOT NULL,
        to_doc_id   TEXT NOT NULL,
        relation    TEXT NOT NULL,
        score       REAL DEFAULT 1.0,
        created_at  TEXT NOT NULL,
        UNIQUE(from_doc_id, to_doc_id, relation)
      );

      CREATE INDEX IF NOT EXISTS idx_krel_from ON knowledge_relations(from_doc_id);
      CREATE INDEX IF NOT EXISTS idx_krel_to ON knowledge_relations(to_doc_id);

      CREATE TABLE IF NOT EXISTS knowledge_usage_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id      TEXT NOT NULL,
        query       TEXT NOT NULL,
        action      TEXT NOT NULL,
        context     TEXT,
        created_at  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_kusage_doc ON knowledge_usage_log(doc_id);
      CREATE INDEX IF NOT EXISTS idx_kusage_action ON knowledge_usage_log(action);
    `,
  },
  {
    version: 12,
    description: 'Knowledge Graph — entities, relations, mentions with FTS5 index',
    sql: `
      CREATE TABLE IF NOT EXISTS kg_entities (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        type            TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        aliases         TEXT DEFAULT '[]',
        description     TEXT,
        metadata        TEXT DEFAULT '{}',
        mention_count   INTEGER DEFAULT 0,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(type);
      CREATE INDEX IF NOT EXISTS idx_kg_entities_normalized ON kg_entities(normalized_name);

      CREATE VIRTUAL TABLE IF NOT EXISTS kg_entities_fts USING fts5(
        name, aliases, description
      );

      CREATE TABLE IF NOT EXISTS kg_relations (
        id              TEXT PRIMARY KEY,
        from_entity_id  TEXT NOT NULL REFERENCES kg_entities(id),
        to_entity_id    TEXT NOT NULL REFERENCES kg_entities(id),
        relation_type   TEXT NOT NULL,
        weight          REAL DEFAULT 1.0,
        source_doc_id   TEXT,
        created_at      TEXT NOT NULL,
        UNIQUE(from_entity_id, to_entity_id, relation_type)
      );

      CREATE INDEX IF NOT EXISTS idx_kg_relations_from ON kg_relations(from_entity_id);
      CREATE INDEX IF NOT EXISTS idx_kg_relations_to ON kg_relations(to_entity_id);

      CREATE TABLE IF NOT EXISTS kg_mentions (
        id          TEXT PRIMARY KEY,
        entity_id   TEXT NOT NULL REFERENCES kg_entities(id),
        doc_id      TEXT NOT NULL,
        context     TEXT,
        position    INTEGER DEFAULT 0,
        created_at  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_kg_mentions_entity ON kg_mentions(entity_id);
      CREATE INDEX IF NOT EXISTS idx_kg_mentions_doc ON kg_mentions(doc_id);
    `,
  },
  {
    version: 13,
    description: 'LSP cache — language server result caching with mtime invalidation',
    sql: `
      CREATE TABLE IF NOT EXISTS lsp_cache (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id      TEXT NOT NULL,
        cache_key       TEXT NOT NULL,
        operation       TEXT NOT NULL,
        language_id     TEXT NOT NULL,
        file_path       TEXT NOT NULL,
        result_json     TEXT NOT NULL,
        file_mtime      TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        UNIQUE(project_id, cache_key)
      );

      CREATE INDEX IF NOT EXISTS idx_lsp_cache_file ON lsp_cache(project_id, file_path);
      CREATE INDEX IF NOT EXISTS idx_lsp_cache_lang ON lsp_cache(project_id, language_id);
    `,
  },
  {
    version: 14,
    description: 'Recreate code_symbols_fts with signature column (replaces kind)',
    sql: `
      -- Drop old FTS table and triggers (schema mismatch: had 'kind', needs 'signature')
      DROP TRIGGER IF EXISTS code_fts_insert;
      DROP TRIGGER IF EXISTS code_fts_delete;
      DROP TRIGGER IF EXISTS code_fts_update;
      DROP TABLE IF EXISTS code_symbols_fts;

      CREATE VIRTUAL TABLE code_symbols_fts USING fts5(
        name, file, signature,
        content='code_symbols', content_rowid='rowid'
      );

      CREATE TRIGGER code_fts_insert AFTER INSERT ON code_symbols BEGIN
        INSERT INTO code_symbols_fts(rowid, name, file, signature)
          VALUES (NEW.rowid, NEW.name, NEW.file, COALESCE(NEW.signature, ''));
      END;

      CREATE TRIGGER code_fts_delete AFTER DELETE ON code_symbols BEGIN
        INSERT INTO code_symbols_fts(code_symbols_fts, rowid, name, file, signature)
          VALUES ('delete', OLD.rowid, OLD.name, OLD.file, COALESCE(OLD.signature, ''));
      END;

      CREATE TRIGGER code_fts_update AFTER UPDATE ON code_symbols BEGIN
        INSERT INTO code_symbols_fts(code_symbols_fts, rowid, name, file, signature)
          VALUES ('delete', OLD.rowid, OLD.name, OLD.file, COALESCE(OLD.signature, ''));
        INSERT INTO code_symbols_fts(rowid, name, file, signature)
          VALUES (NEW.rowid, NEW.name, NEW.file, COALESCE(NEW.signature, ''));
      END;
    `,
  },
  {
    version: 15,
    description: 'Translation jobs + UCR (Universal Construct Registry) tables',
    sql: `
      CREATE TABLE IF NOT EXISTS translation_jobs (
        id                TEXT PRIMARY KEY,
        project_id        TEXT NOT NULL,
        source_language   TEXT NOT NULL,
        target_language   TEXT NOT NULL,
        source_code       TEXT NOT NULL,
        target_code       TEXT,
        status            TEXT NOT NULL DEFAULT 'pending',
        scope             TEXT NOT NULL DEFAULT 'snippet',
        constraints       TEXT,
        analysis          TEXT,
        result            TEXT,
        evidence          TEXT,
        confidence_score  REAL,
        warnings          TEXT,
        error_message     TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tj_project ON translation_jobs(project_id);
      CREATE INDEX IF NOT EXISTS idx_tj_status ON translation_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_tj_lang_pair ON translation_jobs(source_language, target_language);

      CREATE TABLE IF NOT EXISTS ucr_categories (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS ucr_constructs (
        id              TEXT PRIMARY KEY,
        category_id     TEXT NOT NULL,
        canonical_name  TEXT NOT NULL UNIQUE,
        description     TEXT,
        semantic_group  TEXT,
        metadata        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ucr_constructs_category ON ucr_constructs(category_id);
      CREATE INDEX IF NOT EXISTS idx_ucr_constructs_group ON ucr_constructs(semantic_group);

      CREATE TABLE IF NOT EXISTS ucr_language_mappings (
        id              TEXT PRIMARY KEY,
        construct_id    TEXT NOT NULL,
        language_id     TEXT NOT NULL,
        syntax_pattern  TEXT NOT NULL,
        ast_node_type   TEXT,
        confidence      REAL NOT NULL DEFAULT 1.0,
        is_primary      INTEGER NOT NULL DEFAULT 1,
        constraints     TEXT,
        UNIQUE(construct_id, language_id, syntax_pattern)
      );
      CREATE INDEX IF NOT EXISTS idx_ucr_mapping_construct ON ucr_language_mappings(construct_id);
      CREATE INDEX IF NOT EXISTS idx_ucr_mapping_language ON ucr_language_mappings(language_id);

      CREATE TABLE IF NOT EXISTS ucr_equivalence_classes (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        description       TEXT,
        equivalence_type  TEXT NOT NULL DEFAULT 'exact'
      );

      CREATE TABLE IF NOT EXISTS ucr_translation_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        source_lang     TEXT NOT NULL,
        target_lang     TEXT NOT NULL,
        construct_id    TEXT NOT NULL,
        mapping_id      TEXT NOT NULL,
        success         INTEGER NOT NULL DEFAULT 1,
        feedback        TEXT,
        created_at      TEXT NOT NULL
      );
    `,
  },
  {
    version: 16,
    description: 'Tool call log for prerequisite enforcement',
    sql: `
      CREATE TABLE IF NOT EXISTS tool_call_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        node_id    TEXT,
        tool_name  TEXT NOT NULL,
        tool_args  TEXT,
        called_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tool_call_log_lookup
        ON tool_call_log (project_id, node_id, tool_name);
    `,
  },
  {
    version: 17,
    description: 'Cleanup duplicate project_settings rows (defensive fix for NEW-1)',
    sql: `
      DELETE FROM project_settings
      WHERE rowid NOT IN (
        SELECT MAX(rowid) FROM project_settings GROUP BY project_id, key
      );
    `,
  },
  {
    version: 18,
    description: 'Add pre-computed recency_score column to knowledge_documents',
    sql: `
      ALTER TABLE knowledge_documents ADD COLUMN recency_score REAL DEFAULT 1.0;
      CREATE INDEX IF NOT EXISTS idx_knowledge_recency ON knowledge_documents(recency_score);
    `,
  },
  {
    version: 19,
    description: 'Add missing performance indexes for knowledge_documents, tool_call_log, code_symbols',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_knowledge_project_id ON knowledge_documents(project_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_source_type ON knowledge_documents(source_type);
      CREATE INDEX IF NOT EXISTS idx_tool_call_node ON tool_call_log(project_id, node_id);
      CREATE INDEX IF NOT EXISTS idx_code_symbols_file ON code_symbols(file);
    `,
  },
  {
    version: 20,
    description: 'Translation projects + project files tables for full project conversion',
    sql: `
      CREATE TABLE IF NOT EXISTS translation_projects (
        id                  TEXT PRIMARY KEY,
        project_id          TEXT NOT NULL,
        name                TEXT NOT NULL,
        source_language     TEXT,
        target_language     TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'uploading',
        total_files         INTEGER NOT NULL DEFAULT 0,
        processed_files     INTEGER NOT NULL DEFAULT 0,
        overall_confidence  REAL,
        deterministic_pct   REAL,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tp_project ON translation_projects(project_id);
      CREATE INDEX IF NOT EXISTS idx_tp_status ON translation_projects(status);

      CREATE TABLE IF NOT EXISTS translation_project_files (
        id                      TEXT PRIMARY KEY,
        translation_project_id  TEXT NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
        file_path               TEXT NOT NULL,
        source_code             TEXT NOT NULL,
        source_language         TEXT,
        status                  TEXT NOT NULL DEFAULT 'pending',
        job_id                  TEXT REFERENCES translation_jobs(id) ON DELETE SET NULL,
        deterministic           INTEGER,
        analysis                TEXT,
        confidence_score        REAL,
        error_message           TEXT,
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tpf_project ON translation_project_files(translation_project_id);
      CREATE INDEX IF NOT EXISTS idx_tpf_job ON translation_project_files(job_id);
      CREATE INDEX IF NOT EXISTS idx_tpf_status ON translation_project_files(status);
    `,
  },
]
