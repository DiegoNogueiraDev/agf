# Changelog

> **Nota.** O repositório público começa em v0.21.0, com um snapshot único e sem
> histórico. Os links de comparação de versões anteriores apontam para commits que
> não existem aqui — eles são o registro do desenvolvimento pré-publicação, mantido
> para leitura, não para navegação.

## [0.22.1] — 2026-07-10

**Por que atualizar:** o `agf retrieve-command` conhecia 163 dos 393 comandos e, quando não
sabia, respondia mesmo assim — inclusive sugerindo `agf node rm` para quem pediu para _ver_ um nó.
Agora ele conhece todos, recusa em voz alta quando não sabe, e nunca oferece um comando destrutivo
a uma intenção de leitura.

### Fixed

- `retrieve-command` indexa toda a superfície do CLI (393 comandos, 259 subcomandos), contra 163
  antes. `agf verify-ac`, `agf code impact`, `agf cycle-repair` e outros 218 eram irrecuperáveis.
- Metade dos comandos que ele conhecia era inexecutável (`agf node node show`) — o grupo aparecia
  duas vezes.
- Uma recuperação abaixo do limiar de confiança devolvia o palpite descartado como se fosse
  resposta. Agora devolve `command: null` e o fallback, e o perfil de saída para agentes carrega
  `decision` e `confidence`.
- Uma intenção de leitura nunca recebe comando destrutivo (`node rm`, `gc`, `prune`, `--force`);
  se você quer destruir, diga na intenção.
- Perguntas em português encontram comandos descritos em inglês, e vice-versa.
- `montar-output` entrega o **corpo** do scaffold, não o nome de um arquivo. Nove dos treze
  esqueletos não existiam em disco; foram escritos, e o reuso cross-language (React, FastAPI,
  Spring, Ktor, Flutter) funciona pela primeira vez.
- `agf savings` deixa de somar unidades diferentes no mesmo total, nomeia o baseline de cada
  número (`measured_fallback`, `measured_template`, `structural`), atribui cada economia à task e à
  sessão que a ganhou, e o total fecha com a soma das partes.
- Onze skills instruíam o agente a chamar ferramentas MCP num CLI que não monta servidor MCP. Um
  teste impede a reincidência.

## [0.22.0] — 2026-07-09

### Added

- Apache-2.0, replacing AGPL-3.0. See `LICENSE` and `NOTICE`.
- `THIRD-PARTY-NOTICES.md`: eleven upstream projects, their licences, their
  copyright holders, and the exact files of this project that derive from them.
- Public repository at github.com/DiegoNogueiraDev/agf.
- `src/tests/local-first-no-network.test.ts`: the build fails if any module reaches
  the network outside a named list, each entry reachable only by a command the user
  types. agf makes exactly two requests — installing, and `agf upgrade` — and
  `AGF_RELEASES_BASE` redirects both.

### Changed

- Installation is by command only. No binary or archive to download and click.
- The browser bridge is executor-agnostic (`AGF_BROWSER_AGENT_BIN`).

### Removed

- The startup update-notifier, which reached the release host on every invocation.
- The POST `agf done` sent on completion, carrying `{os, arch, nodeVersion,
agfVersion, terminal}`.
- The write token compiled into the binary; revoked server-side.
- `agf feedback`. The TUI's `/feedback` prints an issue URL for the human to open.
  agf transmits nothing on the user's behalf.

**Upgrade if you are on 0.21.0 or earlier**: those binaries made network requests
you did not ask for.

## [0.20.1] — 2026-06-25

### Init — idempotência & remoção da geração de skills

- **`agf init` deixa de gerar/sobrescrever skills** — removidos `generateAndWriteCodexSkills` e helpers de `init-project.ts`, o passo `codex-skills` de `runUpdate`, e o gerador `buildCodexSkill` (`codex-skill-specs.ts`). As skills em `.agents/skills/` passam a ser **conteúdo curado mantido manualmente**; o usuário configura skills por projeto.
- **Fim do churn diário** — `buildCodexSkill` carimbava `date: <hoje>` a cada execução, reescrevendo todos os `SKILL.md` mesmo sem mudança de conteúdo. Removido.
- **Bloco de instruções idempotente** — `applySection` substitui o bloco gerenciado in-place; novo teste de ponto-fixo garante que reaplicar N vezes mantém exatamente um par de marcadores (sem incremento).
- **Mantido** o índice de skills do ciclo (`buildSkillIndex` + `CODEX_SKILL_SPECS`) injetado em CLAUDE.md/AGENTS.md — referência situação→skill, sem geração de arquivos.

## [0.20.0] — 2026-06-24

### Trilha SWE — Confiabilidade & Qualidade

- **Recompensa ACO em modo delegado** (`reward-strength.ts` + `task-reward-deposit.ts`) — `agf done` deposita feromônio nas tags da task concluída via `computeRewardStrength`; sinal não-zero mesmo com 0 tokens LLM (W_AC quando DoD passa). Comprovado e2e sem provider
- **Tags como trilhas ACO** (`normalize-tags.ts`) — `agf node add --tags` / `agf node update --tags` registram as trilhas que `agf done` reforça e `agf next --aco` lê (roulette feromônio-ponderada)
- **Evaporação de feromônio temporal** (`pheromone-store.ts`) — trails expiram por half-life (7 dias); roulette seleciona padrões mais recentes
- **Blast por raio de impacto** (`blast-test-resolver`, `blast-target-selector`) — `agf test --blast` roda só os testes afetados; fast-path no-op quando nada muda
- **Mutation gate** (`mutation-gate.ts` + `mutation-gate-runner.ts`) — `agf check --mutation --source <f> --test <f>` aplica mutantes → roda o teste → restaura a fonte; kill ratio configurável (default 60%). Driver injetável; restauração garantida em `finally`. Comprovado e2e
- **Hard-block detector** (`hard-block-detector.ts` + `available-runtimes.ts`) — `agf next` anexa `hardBlocks[]` ao envelope `NO_TASKS` explicando _por que_ o backlog travou (runtime/corpus ausente: java, go, corpus). Probe cross-platform (`where`/`which`)
- **Decision rationale store** (`rationale-store.ts`) — `agf node rationale set/get`: dual-write (metadata + description) garante que decisões (ADR-lite) sobrevivem à compactação de contexto

### Trilha RPA — Plugin Browser (o browser agent)

- **Compilador NL → plano de passos** (`nl-scenario-compiler.ts`) — converte linguagem natural em passos determinísticos mapeados para browser\_\*
- **Executor E2E de cenário** (`scenario-executor.ts`) — executa plano passo-a-passo com retry único; evidência (screenshot) após cada passo; para com falha honesta
- **Oráculo de resultado + eventos** (`scenario-oracle.ts`) — veredito determinístico (passed/failed) + sequência de eventos auditável
- **Reforço ACO cross-domínio** (`scenario-reinforcement.ts`) — cenários RPA depositam na mesma colônia SWE; cross-domain learning
- **Redação de credenciais + allowlist** (`credential-guard.ts`) — sem vazamento de secrets em evidências
- **CDP daemon lifecycle + recovery** (`daemon-lifecycle.ts`) — reinicia daemon CDP automaticamente após falha

### Packaging

- Bump para **v0.20.0**; `npm run pack:offline` produz tgz com deps nativas para instalação zero-network
- **Fix ship-blocker:** `ts-morph` (import runtime em `core/economy/code-ast-compress.ts`, lever de compressão AST) estava em `devDependencies` → o bundle offline travava no boot com `ERR_MODULE_NOT_FOUND`. Movido para `dependencies`; bundle reverificado (install isolado: `agf --version`, `doctor`, `node add`/`stats` rodam sem provider)
- **Harness de prova delegate-mode** (`scripts/prove-0.20.0-delegate.mjs`, `npm run prove:0.20`) — exercita as 6 capacidades 0.20.0 pelo CLI buildado com TODO crédito de provider removido do env; 8 asserts verdes
- Binários per-OS: `agf-offline-darwin-arm64-0.20.0.tgz` (Mach-O arm64) + `agf-offline-win32-x64-0.20.0.tgz` (better-sqlite3 PE32+ DLL x86-64, cross-pack ABI 137)
- `agf doctor` funciona imediatamente pós-instalação sem configuração adicional

## [0.13.1](https://github.com/DiegoNogueiraDev/agf/compare/v0.13.0...v0.13.1) (2026-06-07)

### Bug Fixes

- move release-please-config.json to repo root ([5fcc23d](https://github.com/DiegoNogueiraDev/agf/commit/5fcc23d984c249de0e64ec85b9a0a358f30acd64))
- update release-please-action SHA to v5.0.0 ([6215cb2](https://github.com/DiegoNogueiraDev/agf/commit/6215cb22aacac5e11dd4b0f49708a99572046117))
