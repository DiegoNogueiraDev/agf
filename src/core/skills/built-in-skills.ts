/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Built-in Skills Registry — 54 skills mapped to lifecycle phases.
 * Each skill is a structured instruction set for agentic workflows.
 */

import type { LifecyclePhase } from '../planner/lifecycle-phase.js'

export interface BuiltInSkill {
  name: string
  description: string
  category: string
  phases: LifecyclePhase[]
  instructions: string
}

export const BUILT_IN_SKILLS: readonly BuiltInSkill[] = [
  // ── ANALYZE ──────────────────────────────────
  {
    name: 'create-prd-chat-mode',
    description: 'Guia interativo para criação de PRD a partir de conversa com o usuário',
    category: 'analyze',
    phases: ['ANALYZE'],
    instructions:
      'Conduza uma conversa estruturada para extrair requisitos do usuário. ' +
      'Pergunte sobre problema, usuários-alvo, critérios de sucesso e restrições. ' +
      'Gere um PRD markdown com seções: Problema, Solução, Requisitos Funcionais, ' +
      'Requisitos Não-Funcionais, Critérios de Aceitação, Riscos.',
  },
  {
    name: 'business-analyst',
    description: 'Análise de negócio para requisitos e viabilidade',
    category: 'analyze',
    phases: ['ANALYZE'],
    instructions:
      'Analise a proposta de negócio do ponto de vista de viabilidade técnica e comercial. ' +
      'Identifique stakeholders, mapeie processos AS-IS/TO-BE, defina KPIs mensuráveis. ' +
      'Output: relatório de análise com recomendações priorizadas.',
  },
  {
    name: 'product-manager',
    description: 'Visão de produto, roadmap e priorização',
    category: 'analyze',
    phases: ['ANALYZE'],
    instructions:
      'Assuma o papel de PM sênior. Defina visão do produto, personas, jobs-to-be-done. ' +
      'Priorize features via RICE ou MoSCoW. Garanta alinhamento entre valor de negócio ' +
      'e esforço técnico. Output: roadmap priorizado com justificativas.',
  },

  // ── DESIGN ──────────────────────────────────
  {
    name: 'breakdown-epic-arch',
    description: 'Decomposição de epic em componentes arquiteturais',
    category: 'design',
    phases: ['DESIGN'],
    instructions:
      'Receba um epic e decomponha em componentes arquiteturais. Identifique bounded contexts, ' +
      'defina interfaces entre módulos, documente decisões via ADR. Considere escalabilidade, ' +
      'manutenibilidade e testabilidade. Output: diagrama de componentes + ADRs.',
  },
  {
    name: 'context-architect',
    description: 'Arquitetura de contexto e dependências entre módulos',
    category: 'design',
    phases: ['DESIGN'],
    instructions:
      'Mapeie o contexto do sistema: dependências externas, integrações, fluxos de dados. ' +
      'Use C4 model para documentar system context e container views. Identifique pontos ' +
      'de acoplamento e proponha abstrações. Output: diagrama C4 + dependency map.',
  },
  {
    name: 'backend-architect',
    description: 'Design de arquitetura backend e APIs',
    category: 'design',
    phases: ['DESIGN'],
    instructions:
      'Projete a arquitetura backend: API design (REST/GraphQL), data model, ' +
      'autenticação, cache strategy, error handling. Siga princípios SOLID e clean architecture. ' +
      'Documente contratos via OpenAPI. Output: API spec + data model + ADR.',
  },

  // ── PLAN ────────────────────────────────────
  {
    name: 'breakdown-feature-prd',
    description: 'Decomposição de feature PRD em tasks atômicas',
    category: 'plan',
    phases: ['PLAN'],
    instructions:
      'Receba um PRD e decomponha cada feature em tasks atômicas (≤2h cada). ' +
      'Defina dependências entre tasks, estime complexidade, atribua a sprints. ' +
      'Cada task deve ter acceptance criteria testáveis. Output: lista de tasks com deps.',
  },
  {
    name: 'track-with-mcp-graph',
    description: 'Sincronizar trabalho com o grafo de execução mcp-graph',
    category: 'plan',
    phases: ['PLAN'],
    instructions:
      'Use as tools do mcp-graph para manter o grafo sincronizado com o trabalho real. ' +
      'Workflow: import_prd → decompose → plan_sprint → edge (dependências). ' +
      'Garanta que cada node tem AC, sprint e prioridade definidos antes de IMPLEMENT.',
  },

  // ── IMPLEMENT ────────────────────────────────
  {
    name: 'subagent-driven-development',
    description: 'Desenvolvimento orientado por sub-agentes especializados',
    category: 'implement',
    phases: ['IMPLEMENT'],
    instructions:
      'Decomponha a implementação em sub-tasks que podem ser delegadas a agentes especializados. ' +
      'Cada sub-agente recebe contexto mínimo (via `context` tool) e entrega código testado. ' +
      'Orquestre: next → context → implement (TDD) → update_status. Anti-one-shot obrigatório.',
  },
  {
    name: 'xp-bootstrap',
    description: 'Bootstrap de projeto seguindo metodologia XP anti-vibe-coding',
    category: 'implement',
    phases: ['IMPLEMENT'],
    instructions:
      'Siga o workflow XP sequencial: Isolation → Foundation → TDD → Implementation → ' +
      'Optimization → Interface → Deploy. Cada fase tem gates de qualidade. ' +
      'TDD obrigatório em todas as fases. Skeleton & Organs: dev define arquitetura, AI implementa.',
  },

  // ── VALIDATE ─────────────────────────────────
  {
    name: 'playwright-explore-website',
    description: 'Exploração automatizada de website via Playwright',
    category: 'validate',
    phases: ['VALIDATE'],
    instructions:
      'Use Playwright MCP para navegar no site/app, capturar screenshots, verificar elementos. ' +
      'Explore fluxos de usuário, verifique responsividade, identifique broken links. ' +
      'Documente findings com screenshots anotados. Output: relatório de exploração.',
  },
  {
    name: 'playwright-generate-test',
    description: 'Geração de testes E2E a partir de exploração Playwright',
    category: 'validate',
    phases: ['VALIDATE'],
    instructions:
      'A partir dos acceptance criteria, gere testes E2E com Playwright. ' +
      'Cada AC deve ter pelo menos 1 teste. Use page objects, fixtures e assertions robustas. ' +
      'Testes devem ser determinísticos e independentes. Output: test files prontos para CI.',
  },
  {
    name: 'playwright-tester-mode',
    description: 'Modo de teste interativo com Playwright',
    category: 'validate',
    phases: ['VALIDATE'],
    instructions:
      'Execute testes E2E em modo interativo usando Playwright MCP tools. ' +
      'Navegue, clique, preencha forms, valide snapshots. Reporte falhas com contexto ' +
      'completo (screenshot, DOM state, console errors). Output: test results + evidence.',
  },
  {
    name: 'e2e-testing',
    description: 'Framework completo de testes end-to-end',
    category: 'validate',
    phases: ['VALIDATE'],
    instructions:
      'Implemente cobertura E2E completa: happy paths, edge cases, error scenarios. ' +
      'Use test pyramid: unit → integration → E2E. Configure CI pipeline para executar ' +
      'testes em cada PR. Defina thresholds de cobertura. Output: test suite + CI config.',
  },

  // ── REVIEW ──────────────────────────────────
  {
    name: 'code-reviewer',
    description: 'Code review estruturado com checklist de qualidade',
    category: 'review',
    phases: ['REVIEW'],
    instructions:
      'Revise o código contra checklist: correctness, security (OWASP top 10), performance, ' +
      'readability, test coverage, error handling. Use Code Intelligence para blast radius. ' +
      'Comente inline com severity (blocker/major/minor/nit). Output: review com action items.',
  },
  {
    name: 'code-review-checklist',
    description: 'Checklist detalhado para code review',
    category: 'review',
    phases: ['REVIEW'],
    instructions:
      'Aplique checklist sistemático: [ ] Testes escritos antes (TDD)? [ ] Sem mocks desnecessários? ' +
      '[ ] Logger em paths críticos? [ ] Error handling tipado? [ ] Sem dead code? ' +
      '[ ] Build + typecheck + tests passam? Documente cada item com evidência.',
  },
  {
    name: 'review-and-refactor',
    description: 'Review com foco em refatoração e melhoria contínua',
    category: 'review',
    phases: ['REVIEW'],
    instructions:
      'Analise o código para oportunidades de refatoração: DRY violations, complex conditionals, ' +
      'missing abstractions, code smells. Proponha refactors com justificativa e impacto. ' +
      'Garanta non-regression via testes antes e depois. Output: refactor plan + PRs.',
  },
  {
    name: 'log-standardization-framework',
    description: 'Padronização de logs e observabilidade',
    category: 'review',
    phases: ['REVIEW'],
    instructions:
      'Audite logs do projeto: [ ] Logger usado (nunca console.log)? [ ] Structured logging? ' +
      '[ ] Entry points logados (info)? [ ] Error paths com stack trace? [ ] External calls ' +
      'com timing (debug)? Corrija violações. Output: log audit report + fixes.',
  },
  {
    name: 'observability-engineer',
    description: 'Engenharia de observabilidade — métricas, traces, alertas',
    category: 'review',
    phases: ['REVIEW'],
    instructions:
      'Configure observabilidade: métricas de aplicação, distributed tracing, health checks. ' +
      'Defina SLIs/SLOs para endpoints críticos. Configure alertas para anomalias. ' +
      'Garanta que logs são queryable (structured, not free-text). Output: observability setup.',
  },

  // ── DEPLOY ──────────────────────────────────
  {
    name: 'deployment-engineer',
    description: 'Validação de pipeline CI/CD, smoke tests e rollback plan',
    category: 'deploy',
    phases: ['DEPLOY'],
    instructions:
      'Valide o pipeline CI/CD antes do release: todos os checks verdes, build reproduzível. ' +
      'Execute smoke tests pós-deploy em staging. Documente rollback plan com passos concretos. ' +
      'Verifique semantic versioning (breaking changes = major). Confirme changelog atualizado. ' +
      'Post-deploy: monitore métricas de erro por 30min, valide health checks.',
  },
  {
    name: 'devops-deploy',
    description: 'Paridade de ambientes, secret rotation e estratégias de deploy',
    category: 'deploy',
    phases: ['DEPLOY'],
    instructions:
      'Garanta paridade entre staging e produção (versões, configs, secrets). ' +
      'Verifique rotação de secrets antes do release. Escolha estratégia de deploy: ' +
      'blue-green para zero downtime, canary para validação gradual. ' +
      'Configure monitoring dashboards para o release. Valide auto-scaling policies.',
  },
  {
    name: 'git-pushing',
    description: 'Branch hygiene, PR completeness e tags de release',
    category: 'deploy',
    phases: ['DEPLOY'],
    instructions:
      'Verifique branch hygiene: squash commits sem valor, rebase sobre main. ' +
      'PR deve estar completo: descrição, link para tasks, test evidence. ' +
      'Respeite protected branch rules. Crie tag semântica para o release (v1.2.3). ' +
      'Confirme que CI passou na branch de release antes de merge.',
  },

  // ── HANDOFF ─────────────────────────────────
  {
    name: 'delivery-checklist',
    description: 'Checklist de entrega: snapshot, ADRs e doc completeness',
    category: 'handoff',
    phases: ['HANDOFF'],
    instructions:
      'Execute checklist de entrega: 1) Exporte snapshot do grafo via `snapshot`. ' +
      '2) Verifique que todos os ADRs estão documentados. 3) Use `analyze(handoff_ready)` ' +
      'para validar gate de entrega. 4) Atualize README com instruções de setup. ' +
      '5) Confirme que knowledge base está atualizada com decisões técnicas.',
  },
  {
    name: 'pr-documentation',
    description: 'Estrutura de PR, evidências de teste e breaking changes',
    category: 'handoff',
    phases: ['HANDOFF'],
    instructions:
      'Estruture o PR: título conciso (<70 chars), body com Summary (bullets), ' +
      'Test Plan (checklist), Breaking Changes (se houver). Link para tasks/epics no grafo. ' +
      'Inclua evidências: screenshots, coverage reports, test results. ' +
      'Defina reviewers com base no blast radius (use Code Intelligence).',
  },
  {
    name: 'knowledge-capture',
    description: 'Captura de decisões técnicas e lessons learned via write_memory',
    category: 'handoff',
    phases: ['HANDOFF'],
    instructions:
      'Use `write_memory` para persistir: 1) Decisões arquiteturais e trade-offs. ' +
      '2) Lessons learned durante a implementação. 3) Limitações conhecidas e workarounds. ' +
      '4) Padrões de erro descobertos e suas prevenções (healing memories). ' +
      'Essas memórias alimentam o RAG para contexto futuro via `context(action:rag)`.',
  },

  // ── LISTENING ───────────────────────────────
  {
    name: 'feedback-collector',
    description: 'Coleta e classificação de feedback como nodes no grafo',
    category: 'listening',
    phases: ['LISTENING'],
    instructions:
      'Adicione feedback como nodes no grafo via `node` (type: idea ou requirement). ' +
      'Classifique por tipo (bug, feature, improvement) e prioridade. ' +
      'Link feedback a epics/requirements existentes via `edge`. ' +
      'Use `analyze(backlog_health)` para avaliar impacto no backlog.',
  },
  {
    name: 'iteration-planner',
    description: 'Planejamento de próxima iteração a partir de feedback e tech debt',
    category: 'listening',
    phases: ['LISTENING'],
    instructions:
      'Revise indicadores de tech debt e feedback coletado. Priorize itens contra o roadmap. ' +
      'Crie novos epics para feedback aprovado via `node` (type: epic). ' +
      'Quando o escopo justificar, inicie novo ciclo ANALYZE com `set_phase`. ' +
      'Use `plan_sprint` para projetar capacidade da próxima iteração.',
  },
  {
    name: 'metrics-retrospective',
    description: 'Retrospectiva baseada em métricas: velocity, burndown e bottlenecks',
    category: 'listening',
    phases: ['LISTENING'],
    instructions:
      'Use `metrics` para revisar velocity trends e sprint burndown. ' +
      'Identifique bottlenecks via `analyze(blockers)` e tarefas que ficaram stuck. ' +
      'Documente melhorias para o próximo ciclo via `write_memory`. ' +
      'Compare velocity planejada vs realizada. Ajuste estimativas futuras com base no histórico.',
  },

  // ── SOFTWARE DESIGN PRINCIPLES ────────────────────
  {
    name: 'kiss',
    description: 'Keep It Simple, Stupid — simplicidade como princípio de design',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Aplique o princípio KISS em todas as decisões de design e implementação. ' +
      'Prefira soluções simples e diretas. Evite abstrações prematuras, generalizações desnecessárias ' +
      "e complexidade acidental. Pergunte: 'Qual é a forma mais simples de resolver isso?' " +
      'Se a solução precisa de um diagrama para ser entendida, simplifique.',
  },
  {
    name: 'yagni',
    description: "You Aren't Gonna Need It — não implemente o que não é necessário agora",
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      "Aplique YAGNI rigorosamente. Não adicione features, configurações ou abstrações 'para o futuro'. " +
      'Implemente apenas o que é explicitamente necessário para o requisito atual. ' +
      'Se não há user story ou AC pedindo, não implemente. Código não escrito é código sem bugs.',
  },
  {
    name: 'dry',
    description: "Don't Repeat Yourself — elimine duplicação de conhecimento",
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Identifique e elimine duplicação de conhecimento (não apenas código). ' +
      'Cada conceito deve ter uma única representação autoritativa no sistema. ' +
      'Atenção: DRY é sobre conhecimento, não sintaxe — duas funções com código similar ' +
      'mas razões de mudança diferentes NÃO são duplicação.',
  },
  {
    name: 'solid-srp',
    description: 'Single Responsibility Principle — uma razão para mudar',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Cada módulo/classe/função deve ter uma única razão para mudar. ' +
      'Identifique os atores (stakeholders) que podem solicitar mudanças e separe responsabilidades ' +
      'por ator. Se uma classe muda por mais de uma razão, extraia responsabilidades em módulos separados.',
  },
  {
    name: 'solid-ocp',
    description: 'Open/Closed Principle — aberto para extensão, fechado para modificação',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Projete módulos que possam ser estendidos sem modificação do código existente. ' +
      'Use abstrações (interfaces, strategy pattern, plugins) para pontos de extensão previsíveis. ' +
      'Quando um novo requisito chega, prefira adicionar código novo a alterar código estável.',
  },
  {
    name: 'solid-lsp',
    description: 'Liskov Substitution Principle — subtipos devem ser substituíveis',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Garanta que subtipos podem substituir seus tipos base sem quebrar o comportamento esperado. ' +
      'Verifique: pré-condições não são fortalecidas, pós-condições não são enfraquecidas, ' +
      "invariantes são preservados. Se uma subclasse precisa de um 'if instanceof', há violação de LSP.",
  },
  {
    name: 'solid-isp',
    description: 'Interface Segregation Principle — interfaces coesas e específicas',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Prefira interfaces pequenas e específicas a interfaces grandes e genéricas. ' +
      'Nenhum cliente deve ser forçado a depender de métodos que não usa. ' +
      'Quando uma interface tem muitos métodos, divida por coesão funcional.',
  },
  {
    name: 'solid-dip',
    description: 'Dependency Inversion Principle — dependa de abstrações',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Módulos de alto nível não devem depender de módulos de baixo nível — ambos devem depender de abstrações. ' +
      'Abstrações não devem depender de detalhes. Use injeção de dependência e interfaces ' +
      'para desacoplar camadas. A direção de dependência deve apontar para políticas, não para detalhes.',
  },
  {
    name: 'tell-dont-ask',
    description: "Tell, Don't Ask — peça ao objeto que faça, não pergunte seu estado",
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Em vez de perguntar o estado de um objeto para decidir o que fazer, diga ao objeto o que fazer. ' +
      'Evite getters seguidos de lógica condicional externa. Encapsule comportamento junto com dados. ' +
      'Se você faz obj.getX() para decidir algo, considere mover a decisão para dentro do obj.',
  },
  {
    name: 'law-of-demeter',
    description: 'Lei de Demeter — fale apenas com seus amigos próximos',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Cada módulo deve ter conhecimento limitado sobre outros módulos. ' +
      'Evite cadeias de chamadas como a.getB().getC().doSomething(). ' +
      'Um método deve chamar apenas: seus próprios métodos, métodos de seus parâmetros, ' +
      'métodos de objetos que ele cria, e métodos de suas dependências diretas.',
  },
  {
    name: 'composition-over-inheritance',
    description: 'Composição sobre Herança — favoreça composição de comportamento',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Prefira composição (has-a) sobre herança (is-a) para reutilização de código. ' +
      'Herança cria acoplamento forte e hierarquias rígidas. Use composição com interfaces ' +
      'para combinar comportamentos flexivelmente. Reserve herança para relações genuínas de subtipo.',
  },
  {
    name: 'fail-fast',
    description: 'Fail Fast — detecte e reporte erros imediatamente',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Valide inputs e pré-condições no ponto de entrada, não no meio do processamento. ' +
      'Use assertions, guards e validação Zod nas fronteiras. Falhe com mensagens claras ' +
      'e stack traces preservados. Nunca engula erros silenciosamente — log + rethrow ou handle explicitamente.',
  },
  {
    name: 'clean-architecture',
    description: 'Clean Architecture — camadas com direção de dependência controlada',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Organize o código em camadas concêntricas: Entities → Use Cases → Adapters → Frameworks. ' +
      'Dependências apontam para dentro (regra de dependência). O core de negócio não conhece ' +
      'frameworks, DB ou UI. Use interfaces para inverter dependências nas fronteiras.',
  },
  {
    name: 'separation-of-concerns',
    description: 'Separação de Responsabilidades — cada módulo faz uma coisa',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Separe o sistema em módulos distintos com responsabilidades claras e sobreposição mínima. ' +
      'Cada camada (CLI, API, Core, Store) tem um papel definido. Não misture lógica de apresentação ' +
      'com lógica de negócio. Não misture acesso a dados com regras de domínio.',
  },
  {
    name: 'boy-scout-rule',
    description: 'Regra do Escoteiro — deixe o código melhor do que encontrou',
    category: 'software-design',
    phases: ['DESIGN', 'IMPLEMENT', 'REVIEW'],
    instructions:
      'Ao tocar em código existente, faça pequenas melhorias incrementais: renomeie variáveis ' +
      'mal nomeadas, extraia funções longas, remova dead code, adicione tipagem faltante. ' +
      'Não refatore tudo de uma vez — melhorias pequenas e consistentes acumulam qualidade.',
  },

  // ── DDD ──────────────────────────────────────────
  {
    name: 'domain-driven-design',
    description: 'Domain-Driven Design — modelagem orientada ao domínio de negócio',
    category: 'ddd',
    phases: ['DESIGN', 'PLAN'],
    instructions:
      'Modele o software em torno do domínio de negócio. Identifique bounded contexts, ' +
      'entidades, value objects, aggregates e domain events. Use linguagem ubíqua — ' +
      'termos do domínio no código. Separe subdomínios (core, supporting, generic). ' +
      'Context maps para definir relacionamentos entre bounded contexts.',
  },

  // ── SECURITY ─────────────────────────────────────
  {
    name: 'owasp-web-security',
    description: 'OWASP Top 10 — segurança web essencial',
    category: 'security',
    phases: ['DESIGN', 'REVIEW', 'VALIDATE'],
    instructions:
      'Verifique contra OWASP Top 10: Injection (SQL, NoSQL, OS), Broken Auth, ' +
      'Sensitive Data Exposure, XXE, Broken Access Control, Security Misconfiguration, ' +
      'XSS, Insecure Deserialization, Using Components with Known Vulns, Insufficient Logging. ' +
      'Para cada item: identifique superfície de ataque, aplique mitigação, documente.',
  },
  {
    name: 'auth-and-secrets',
    description: 'Autenticação, autorização e gestão de segredos',
    category: 'security',
    phases: ['DESIGN', 'REVIEW', 'VALIDATE'],
    instructions:
      'Nunca hardcode secrets — use variáveis de ambiente ou vault. Tokens JWT com expiração curta. ' +
      'Hash de senhas com bcrypt/argon2 (nunca MD5/SHA). RBAC ou ABAC para autorização. ' +
      'Valide tokens em cada request. Revogue sessões ativas em caso de compromisso. ' +
      'Audite acessos a recursos sensíveis. .env nunca no git.',
  },
  {
    name: 'database-and-deps-security',
    description: 'Segurança de banco de dados e dependências',
    category: 'security',
    phases: ['DESIGN', 'REVIEW', 'VALIDATE'],
    instructions:
      'Use prepared statements / parameterized queries para prevenir SQL injection. ' +
      'Princípio do menor privilégio para acessos ao DB. Audite dependências com npm audit. ' +
      'Lock files commitados. Mantenha deps atualizadas. Nunca exponha stack traces em produção. ' +
      'Encrypt dados sensíveis at rest. Backup strategy com testes de restore.',
  },

  // ── FRONTEND DESIGN ──────────────────────────────
  {
    name: 'ui-ux-patterns',
    description: 'Padrões de UI/UX para interfaces eficazes',
    category: 'frontend-design',
    phases: ['DESIGN', 'IMPLEMENT'],
    instructions:
      'Aplique padrões de UX comprovados: loading states para toda operação assíncrona, ' +
      'error states com ações de recovery, empty states informativos, feedback visual imediato. ' +
      'Acessibilidade: ARIA labels, keyboard navigation, contraste mínimo WCAG AA. ' +
      'Responsividade: mobile-first, breakpoints consistentes. Performance: lazy loading, ' +
      'virtualização para listas longas, debounce em inputs.',
  },

  // ── TESTING ──────────────────────────────────────
  {
    name: 'comprehensive-testing-reference',
    description: 'Referência completa de estratégia de testes',
    category: 'testing',
    phases: ['IMPLEMENT', 'VALIDATE'],
    instructions:
      'Siga a pirâmide de testes: muitos unit tests, integration tests moderados, poucos E2E. ' +
      'Unit: isolados, rápidos, uma assertion por conceito, factory functions para fixtures. ' +
      'Integration: real DB (in-memory), real file I/O (tmp), mock apenas fronteiras externas. ' +
      'E2E: fluxos reais do usuário, Playwright para browser. Cobertura: 80%+ para core, ' +
      '100% para paths críticos (auth, payments, data integrity). TDD: Red → Green → Refactor.',
  },

  // ── RESEARCH ─────────────────────────────────────
  {
    name: 'research-methodology',
    description: 'Metodologia de pesquisa estruturada para decisões técnicas',
    category: 'research',
    phases: ['ANALYZE'],
    instructions:
      'Para pesquisa técnica: 1) Defina a pergunta central claramente. ' +
      '2) Liste opções candidatas (mín. 3). 3) Defina critérios de avaliação objetivos ' +
      '(performance, manutenibilidade, comunidade, licença, custo). ' +
      '4) Avalie cada opção contra cada critério com evidência. ' +
      '5) Documente trade-offs e decisão final em ADR. ' +
      '6) Prototipe a opção vencedora antes de comprometer. Use Context7 para docs atualizados.',
  },

  // ── COST REDUCER ─────────────────────────────────
  {
    name: 'cloud-infra-cost',
    description: 'Otimização de custos de infraestrutura cloud',
    category: 'cost-reducer',
    phases: ['DESIGN', 'REVIEW'],
    instructions:
      'Audite custos de infra: right-sizing de instâncias (CPU/memory utilization), ' +
      'reserved/spot instances, auto-scaling policies, storage tiering (hot/warm/cold). ' +
      'Identifique recursos ociosos (unused EIPs, unattached volumes, idle load balancers). ' +
      'CDN para assets estáticos. Serverless para workloads intermitentes. ' +
      'Budget alerts e cost anomaly detection. FinOps: tag resources por team/project.',
  },
  {
    name: 'code-level-savings',
    description: 'Economias a nível de código — performance e eficiência',
    category: 'cost-reducer',
    phases: ['DESIGN', 'REVIEW'],
    instructions:
      'Otimize código para reduzir custo computacional: queries N+1 → batch/join, ' +
      'caching estratégico (Redis/in-memory) para dados lidos frequentemente, ' +
      'connection pooling, lazy loading de recursos pesados, pagination para datasets grandes. ' +
      'Compressão de responses (gzip/brotli). Índices de DB otimizados para queries frequentes. ' +
      'Elimine computações redundantes. Profile antes de otimizar.',
  },
  {
    name: 'finops-services',
    description: 'FinOps para serviços gerenciados e APIs externas',
    category: 'cost-reducer',
    phases: ['DESIGN', 'REVIEW'],
    instructions:
      'Gerencie custos de serviços gerenciados e APIs externas: rate limiting para proteger budget, ' +
      'caching de responses de APIs pagas, batch requests quando possível. ' +
      'LLM costs: prompt compression, response caching, model tiering (use modelos menores ' +
      'para tasks simples). Monitore spend por serviço. Defina budgets por team/feature. ' +
      'Alertas quando spend excede threshold.',
  },

  // ── SELF-HEALING ─────────────────────────────────
  {
    name: 'self-healing-awareness',
    description: 'Consulta memórias de auto-correção antes de executar tarefas',
    category: 'implement',
    phases: ['IMPLEMENT', 'VALIDATE'],
    instructions:
      'Antes de executar uma tarefa, consulte context(action:rag) para verificar memórias de self-healing ' +
      'relacionadas ao contexto atual. Padrões de erro conhecidos e suas prevenções estão ' +
      'armazenados em workflow-graph/memories/healing-*.md. Se encontrar uma memória relevante, ' +
      'aplique a regra de prevenção ANTES de implementar. Isso evita repetição de erros ' +
      'já cometidos e corrigidos anteriormente.',
  },

  // ── INTERDISCIPLINARY KNOWLEDGE ─────────────────
  {
    name: 'interdisciplinary-knowledge-intersector',
    description: 'Discover cross-domain intersections in knowledge store to generate novel skill ideas',
    category: 'analyze',
    phases: ['ANALYZE', 'DESIGN', 'LISTENING'],
    instructions:
      "Use knowledge(action:'search') to find cross-domain knowledge intersections. " +
      'Review the generated insights for novel skill ideas. Filter by concept for targeted discovery. ' +
      'Use rag_context for deep semantic search across knowledge sources. ' +
      'Combine with write_memory to save promising intersection patterns.',
  },
  {
    name: 'self-healing-engine',
    description: 'MAPE-K self-healing engine — proactive graph scanning, diagnosis, and auto-repair',
    category: 'validate',
    phases: ['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING'],
    instructions:
      "Use graph_health(action:'scan') to proactively scan the execution graph for issues. " +
      "Use analyze(mode:'blockers') and analyze(mode:'cycles') to detect stuck tasks and dependency problems. " +
      'Review the report and use update_status to fix status inconsistencies. ' +
      'Always run before sprint planning and after bulk imports.',
  },
] as const

/**
 * Get all built-in skills.
 */
export function getBuiltInSkills(): readonly BuiltInSkill[] {
  return BUILT_IN_SKILLS
}

/**
 * Get built-in skills filtered by lifecycle phase.
 */
export function getSkillsByPhase(phase: LifecyclePhase): BuiltInSkill[] {
  return BUILT_IN_SKILLS.filter((s) => s.phases.includes(phase))
}

/**
 * Get a built-in skill by name.
 */
export function getSkillByName(name: string): BuiltInSkill | undefined {
  return BUILT_IN_SKILLS.find((s) => s.name === name)
}
