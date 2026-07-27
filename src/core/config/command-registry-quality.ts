/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Quality & governance command entries — categories:
 *   qualidade, governanca, dev-tooling
 *
 * Part of the split registry. Imported and spread by command-registry.ts.
 */

import type { CommandDescriptor } from './command-registry.js'

export const REGISTRY_QUALITY: CommandDescriptor[] = [
  // ═══════════════════════════════════════════════════════════════════
  // Qualidade, harness, forecast
  // ═══════════════════════════════════════════════════════════════════
  {
    name: 'eval',
    description: 'Suíte de cenários reais → scorecard',
    usage: '[--suite --models --provider --live --repeat --out]',
    category: 'qualidade',
  },
  {
    name: 'harness',
    description: 'Scan de agent-readiness (8 dimensões, score A/B/C/D); --saturation anexa pivô determinístico',
    usage: '[--violations] [--saturation]',
    category: 'qualidade',
  },
  {
    name: 'scan-binaries',
    description:
      'Escreve SCANINFO.json (selo de confiança: sha256+assinatura+veredito VirusTotal) ao lado do BUILDINFO',
    usage: '[--out <dir>]',
    category: 'qualidade',
  },
  {
    name: 'session',
    description: 'Inspeciona o read-model unificado de sessão/runtime (identity·thread·mode·model·run·grants)',
    usage: '<show|grants|events>',
    category: 'qualidade',
  },
  {
    name: 'session show',
    parent: 'session',
    description: 'Monta e imprime o read-model de sessão a partir do grafo',
    category: 'qualidade',
  },
  {
    name: 'session grants',
    parent: 'session',
    description: 'Mostra o verdict do enforcer + status de aprovação por capability',
    category: 'qualidade',
  },
  {
    name: 'session events',
    parent: 'session',
    description: 'Lista os canais de evento upward da sessão (message-update, mode-changed, approval)',
    category: 'qualidade',
  },
  {
    name: 'session config',
    parent: 'session',
    description: 'Mostra o config harness-level da sessão (preset, provider, model pin, flags)',
    category: 'qualidade',
  },
  {
    name: 'session subagents',
    parent: 'session',
    description: 'Lista os subagents que o harness rastreia',
    category: 'qualidade',
  },
  {
    name: 'session dispatch',
    parent: 'session',
    description: 'Envia um comando DOWN para o loop da sessão e captura os eventos upward (comandos↓/eventos↑)',
    usage: '<set_mode|approve|interrupt|send_message> [--mode|--request-id|--text]',
    category: 'qualidade',
  },
  {
    name: 'preflight',
    description: 'Golden-rule guard: git-history + graph dedupe antes de implementar (zero MCP, ~0 token)',
    category: 'qualidade',
  },
  {
    name: 'tdd-score',
    description: 'Calcula o score de qualidade TDD (0–100) para uma task',
    category: 'qualidade',
  },
  {
    name: 'swarm',
    description: 'Coordenação multi-agente sobre o grafo (sessão/claim/mailbox/consensus) — opt-in',
    category: 'qualidade',
  },
  {
    name: 'swarm init',
    parent: 'swarm',
    description: 'Cria uma sessão de swarm (pending)',
    usage: '--topology <t> --consensus <c> [--max <n>]',
    category: 'qualidade',
  },
  {
    name: 'swarm claim',
    parent: 'swarm',
    description: 'Reivindica um recurso (lease+TTL) — exclusão mútua entre agentes',
    usage: '<resource> --agent <id> [--ttl <s>]',
    category: 'qualidade',
  },
  {
    name: 'swarm send',
    parent: 'swarm',
    description: 'Courier agente-a-agente (send/recv/ack sobre a2a_mailbox)',
    usage: '--from <id> --to <id> --body <json>',
    category: 'qualidade',
  },
  {
    name: 'swarm consensus',
    parent: 'swarm',
    description: 'Consolida votos por maioria simples (floor(N/2)+1)',
    usage: '--votes <json>',
    category: 'qualidade',
  },
  {
    name: 'provenance',
    description: 'Escada epistêmica (claim→cited→validated→proven): gates de honestidade, local',
    category: 'qualidade',
  },
  {
    name: 'provenance promote',
    parent: 'provenance',
    description: 'Valida a evidência exigida para promover um node a um tier',
    usage: '--node <id> --to <tier> [--citation|--test-run|--receipt]',
    category: 'qualidade',
  },
  {
    name: 'provenance downgrade',
    parent: 'provenance',
    description: 'Reverte o tier quando a evidência cai (forget-gate)',
    usage: '--node <id> --from <tier> --test-run <id> --cause <text>',
    category: 'qualidade',
  },
  {
    name: 'provenance hash',
    parent: 'provenance',
    description: 'Recibo determinístico local (sha256 canônico) — habilita o tier proven sem rede',
    usage: '[--content <s>|--file <p>]',
    category: 'qualidade',
  },
  { name: 'hooks', description: 'Inspeciona a taxonomia de 28 hooks (list/test/discover)', category: 'qualidade' },
  {
    name: 'hooks list',
    parent: 'hooks',
    description: 'Lista os 28 pontos: ponto → canal → módulo-owner',
    category: 'qualidade',
  },
  {
    name: 'hooks test',
    parent: 'hooks',
    description: 'Dry-fire de um canal com payload de fixture',
    usage: '<channel>',
    category: 'qualidade',
  },
  {
    name: 'hooks discover',
    parent: 'hooks',
    description: 'Lista canais da taxonomia sem handler registrado',
    category: 'qualidade',
  },
  { name: 'code index', parent: 'code', description: 'Re-indexa o projeto (tree-sitter + LSP)', category: 'qualidade' },
  {
    name: 'code search',
    parent: 'code',
    description: 'Busca semântica de símbolos via FTS5',
    usage: '<symbol>',
    category: 'qualidade',
  },
  {
    name: 'code callers',
    parent: 'code',
    description: 'Lista callers de um símbolo (incoming calls)',
    usage: '<symbol>',
    category: 'qualidade',
  },
  {
    name: 'code callees',
    parent: 'code',
    description: 'Lista símbolos chamados (outgoing calls)',
    usage: '<symbol>',
    category: 'qualidade',
  },
  {
    name: 'code def',
    parent: 'code',
    description: 'Go-to-definition via LSP',
    usage: '<symbol>',
    category: 'qualidade',
  },
  {
    name: 'code refs',
    parent: 'code',
    description: 'Lista todas as referências via LSP',
    usage: '<symbol>',
    category: 'qualidade',
  },
  {
    name: 'code impact',
    parent: 'code',
    description: 'Blast radius: símbolos afetados por mudança',
    usage: '<file>',
    category: 'qualidade',
  },
  {
    name: 'code affected',
    parent: 'code',
    description: 'Testes afetados por mudanças no arquivo',
    usage: '<file>',
    category: 'qualidade',
  },
  {
    name: 'gaps',
    description: 'Detecta lacunas de completude (~0 token)',
    usage: '[--kind --severity --limit --json]',
    category: 'qualidade',
  },
  {
    name: 'scan-repos',
    description: 'Explora repos vizinhos: fingerprint + insights',
    usage: '[root] [--report --ingest --json]',
    category: 'qualidade',
  },
  { name: 'quality', description: 'Gate 95/95 (testes + logs sobre src/)', category: 'qualidade' },
  { name: 'forecast', description: 'Previsão de ETA do backlog com 95% CI', category: 'qualidade' },

  // ═══════════════════════════════════════════════════════════════════
  // Spec-kit & governança
  // ═══════════════════════════════════════════════════════════════════
  {
    name: 'adr create',
    parent: 'adr',
    description: 'Cria um Architecture Decision Record no grafo',
    category: 'governanca',
  },
  { name: 'adr list', parent: 'adr', description: 'Lista ADRs existentes no grafo', category: 'governanca' },
  { name: 'constitution', description: 'Princípios governantes: --create|--list|--check', category: 'governanca' },
  {
    name: 'preset',
    description: 'Presets de workflow: --list|--show|--apply',
    usage: '--list|--show|--apply <name>',
    category: 'governanca',
  },
  {
    name: 'spec',
    description: 'Geração/validação de specs por fase',
    usage: '--generate|--validate|--list-templates',
    category: 'governanca',
  },
  {
    name: 'spec-sync register',
    parent: 'spec-sync',
    description: 'Registra uma spec versionada',
    category: 'governanca',
  },
  { name: 'spec-sync list', parent: 'spec-sync', description: 'Lista specs registradas', category: 'governanca' },
  { name: 'spec-sync status', parent: 'spec-sync', description: 'Status de sync das specs', category: 'governanca' },
  {
    name: 'spec-sync link',
    parent: 'spec-sync',
    description: 'Linka spec a um nó do grafo',
    usage: '<specId> <nodeId>',
    category: 'governanca',
  },
  { name: 'principles', description: 'Doctrine: lista e exibe princípios', category: 'governanca' },
  { name: 'plugin', description: 'Gerencia plugins (--install, --remove, --list)', category: 'governanca' },
  { name: 'profile', description: 'Perfis de configuração (list, show)', category: 'governanca' },

  // ═══════════════════════════════════════════════════════════════════
  // Dev tooling
  // ═══════════════════════════════════════════════════════════════════
  {
    name: 'test',
    description: 'Vitest: --blast|--changed|--file|--node',
    usage: '[--blast|--changed|--file <path>|--node <id>]',
    category: 'dev-tooling',
  },
  {
    name: 'lint',
    description: 'ESLint: --fix|--file|--all',
    usage: '[--fix|--file <path>|--all]',
    category: 'dev-tooling',
  },
  {
    name: 'usage report',
    parent: 'usage',
    description: 'Top comandos usados + sugestão de wrappers',
    usage: '[--top <n>]',
    category: 'dev-tooling',
  },
  {
    name: 'usage wrap',
    parent: 'usage',
    description: 'Auto-gera wrapper agf para comando nativo',
    usage: '<command> [--apply]',
    category: 'dev-tooling',
  },
  {
    name: 'changelog generate',
    parent: 'changelog',
    description: 'Gera seção Keep-a-Changelog a partir de commits convencionais num range git',
    usage: '--release <v> [--from <ref>] [--to <ref>]',
    category: 'dev-tooling',
  },
]
