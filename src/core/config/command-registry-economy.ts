/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Economy, memory & setup command entries — categories:
 *   modelo-metricas, memoria, setup
 *
 * Part of the split registry. Imported and spread by command-registry.ts.
 */

import type { CommandDescriptor } from './command-registry.js'

export const REGISTRY_ECONOMY: CommandDescriptor[] = [
  // ═══════════════════════════════════════════════════════════════════
  // Modelo, métricas, custo
  // ═══════════════════════════════════════════════════════════════════
  {
    name: 'calibrate',
    description: 'Calibra o limiar do portão RAG por score×saved (lê o lever ledger)',
    usage: '[--lever <name>] [--band <n>]',
    category: 'modelo-metricas',
  },
  {
    name: 'model list',
    parent: 'model',
    description: 'Lista tiers do tier-router (cheap/build/frontier/fallback)',
    category: 'modelo-metricas',
  },
  {
    name: 'model current',
    parent: 'model',
    description: 'Mostra o modelo ativo configurado',
    category: 'modelo-metricas',
  },
  {
    name: 'model set',
    parent: 'model',
    description: 'Fixa um modelo ou volta para auto',
    usage: '<id|auto>',
    category: 'modelo-metricas',
  },
  {
    name: 'model route',
    parent: 'model',
    description: 'Mostra qual modelo o tier-router usaria',
    usage: '<kind>',
    category: 'modelo-metricas',
  },
  {
    name: 'provider list',
    parent: 'provider',
    description: 'Lista providers LLM disponíveis',
    category: 'modelo-metricas',
  },
  {
    name: 'provider use',
    parent: 'provider',
    description: 'Seleciona o provider ativo',
    usage: '<id> [--base-url <url>]',
    category: 'modelo-metricas',
  },
  {
    name: 'provider current',
    parent: 'provider',
    description: 'Mostra provider ativo + fallback chain',
    category: 'modelo-metricas',
  },
  {
    name: 'provider set-url',
    parent: 'provider',
    description: 'Define/limpa o endpoint do provider ativo',
    usage: '[url]',
    category: 'modelo-metricas',
  },
  {
    name: 'provider failover',
    parent: 'provider',
    description: 'Configura cadeia de failover',
    usage: '[chain] [--clear]',
    category: 'modelo-metricas',
  },
  {
    name: 'metrics',
    description: 'Tokens/$ por task e sessão (llm_call_ledger)',
    usage: '[--session --baseline --simulate --economy-report]',
    category: 'modelo-metricas',
  },
  {
    name: 'compress',
    description: 'Compressor de saída de ferramenta',
    usage: '<filters|discover|test>',
    category: 'modelo-metricas',
  },
  {
    name: 'compress filters',
    parent: 'compress',
    description: 'Lista filtros de compressão ativos',
    category: 'modelo-metricas',
  },
  {
    name: 'compress discover',
    parent: 'compress',
    description: 'Saídas sem filtro registradas',
    usage: '[--ledger]',
    category: 'modelo-metricas',
  },
  {
    name: 'compress test',
    parent: 'compress',
    description: 'Testa qual filtro casaria com um arquivo',
    usage: '<file>',
    category: 'modelo-metricas',
  },
  {
    name: 'savings',
    description: 'Economia cumulativa de tokens (ledger)',
    usage: '[--reset]',
    category: 'modelo-metricas',
  },
  {
    name: 'retrieve',
    description: 'Resgata original CCR por hash',
    usage: '<hash> [--query --limit]',
    category: 'modelo-metricas',
  },
  {
    name: 'learning stats',
    parent: 'learning',
    description: 'Performance por-agente + routing',
    category: 'modelo-metricas',
  },
  {
    name: 'learning route',
    parent: 'learning',
    description: 'Decisão de roteamento de agente baseada no histórico',
    usage: '<agentId>',
    category: 'modelo-metricas',
  },
  {
    name: 'learning explain',
    parent: 'learning',
    description: 'Explica a decisão de roteamento (breakdown)',
    usage: '<agentId>',
    category: 'modelo-metricas',
  },
  {
    name: 'learning export',
    parent: 'learning',
    description: 'Exporta todos os registros de learning (JSON)',
    category: 'modelo-metricas',
  },
  { name: 'status', description: 'Painel unificado: provider/model/cache + tokens/$', category: 'modelo-metricas' },
  {
    name: 'colony-health',
    description: 'Colony health: snapshot/list (monitora saúde do sistema)',
    usage: '[list|snapshot]',
    category: 'modelo-metricas',
  },
  {
    name: 'caste',
    description: 'Colony caste taxonomy: list|show (modelo tier, max complexity, task types)',
    usage: '[list|show]',
    category: 'modelo-metricas',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Memória, snapshot, heal
  // ═══════════════════════════════════════════════════════════════════
  {
    name: 'memory write',
    parent: 'memory',
    description: 'Escreve uma memória do projeto',
    usage: '<name> [--content <c>|--file <f>]',
    category: 'memoria',
  },
  {
    name: 'memory read',
    parent: 'memory',
    description: 'Lê uma memória do projeto',
    usage: '<name>',
    category: 'memoria',
  },
  { name: 'memory list', parent: 'memory', description: 'Lista todas as memórias do projeto', category: 'memoria' },
  {
    name: 'memory rm',
    parent: 'memory',
    description: 'Remove uma memória do projeto',
    usage: '<name>',
    category: 'memoria',
  },
  {
    name: 'memory search',
    parent: 'memory',
    description: 'Busca textual nas memórias do projeto',
    usage: '"<query>" [--limit <n>]',
    category: 'memoria',
  },
  {
    name: 'snapshot create',
    parent: 'snapshot',
    description: 'Cria um snapshot do grafo (backup)',
    category: 'memoria',
  },
  { name: 'snapshot list', parent: 'snapshot', description: 'Lista snapshots disponíveis', category: 'memoria' },
  {
    name: 'snapshot restore',
    parent: 'snapshot',
    description: 'Restaura o grafo a partir de um snapshot',
    usage: '<id>',
    category: 'memoria',
  },
  { name: 'heal', description: 'Self-healing do grafo (MAPE-K)', usage: '[--apply] [--log]', category: 'memoria' },
  { name: 'gc', description: 'Coleta de lixo (worktrees/branches órfãos)', category: 'memoria' },
  {
    name: 'immune',
    description: 'Danger Theory immune memory — ledger de erros recorrentes + resposta adaptativa',
    usage: '[--ledger] [--stats] [--clear]',
    category: 'memoria',
  },
  {
    name: 'dream',
    description: 'REM-inspired knowledge consolidation cycles (start/status/history/cancel)',
    category: 'memoria',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Setup & ambiente
  // ═══════════════════════════════════════════════════════════════════
  { name: 'init', description: 'Inicializa o projeto: DB, gitignore, context files, docs', category: 'setup' },
  {
    name: 'install-neural',
    description: 'Instala ONNX runtime + modelo para ativar embeddings neurais no RAG',
    usage: '[--dry-run]',
    category: 'setup',
  },
  {
    name: 'doctor',
    description: 'Diagnóstico do ambiente + contexto LLM + drift detection',
    usage: '[--json --providers]',
    category: 'setup',
  },
  {
    name: 'daemon start',
    parent: 'daemon',
    description: 'Inicia o serviço local em background',
    usage: '[-p <port>]',
    category: 'setup',
  },
  { name: 'daemon stop', parent: 'daemon', description: 'Para o serviço local deste workspace', category: 'setup' },
  { name: 'daemon status', parent: 'daemon', description: 'Verifica se o daemon está rodando', category: 'setup' },
  {
    name: 'daemon prune',
    parent: 'daemon',
    description: 'Mata daemons órfãos + limpa state dirs',
    usage: '[--dry-run]',
    category: 'setup',
  },
  { name: 'daemon list', parent: 'daemon', description: 'Lista daemons e seus status', category: 'setup' },
  { name: 'login', description: 'Autentica no GitHub Copilot (device-flow)', category: 'setup' },
  { name: 'logout', description: 'Remove o token do GitHub Copilot', category: 'setup' },
  { name: 'skill list', parent: 'skill', description: 'Lista skills do ciclo de vida', category: 'setup' },
  {
    name: 'skill show',
    parent: 'skill',
    description: 'Exibe o conteúdo de uma skill',
    usage: '<name>',
    category: 'setup',
  },
  {
    name: 'skill new',
    parent: 'skill',
    description: 'Scaffold a new skill — creates SKILL.md in the discovered skill dir and auto-lists it',
    usage: '<name>',
    category: 'setup',
  },
  {
    name: 'agent create',
    parent: 'agent',
    description: 'Scaffold a new AgentRole TOML entry in .agf/agents.toml — validated before writing',
    usage: '<name> --model <m> --tools <t1,t2> --permissions <p>',
    category: 'setup',
  },
  {
    name: 'agent list',
    parent: 'agent',
    description: 'List all agent roles (built-in + project-local)',
    category: 'setup',
  },
  {
    name: 'hooks add',
    parent: 'hooks',
    description: 'Add a new hook entry to .agf/hooks.toml (scaffold + register in native format)',
    usage: '<channel> --cmd <shell-cmd>',
    category: 'setup',
  },
  { name: 'tui', description: 'TUI interativa (Ink) — agf sem args num TTY', category: 'setup' },
  {
    name: 'ui',
    description: 'Web mínima de progresso: grafo + tokens + logs',
    usage: '[--port <n>]',
    category: 'setup',
  },
]
