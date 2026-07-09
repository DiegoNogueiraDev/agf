<div align="center">

# agent-graph-flow (`agf`)

**Um agente de engenharia de software que trabalha como uma colônia: grafo de execução persistente, TDD inegociável, e custo de token medido por task.**

[![Licença](https://img.shields.io/badge/licen%C3%A7a-Apache--2.0-blue)](LICENSE)
[![Local-first](https://img.shields.io/badge/local--first-verificado%20por%20teste-2ea44f)](src/tests/local-first-no-network.test.ts)
[![Site](https://img.shields.io/badge/site-graph--flow.cloud-f5a623)](https://graph-flow.cloud)

[**graph-flow.cloud**](https://graph-flow.cloud) · [Instalação](INSTALL.md) · [Segurança](SECURITY.md) · [Atribuições](THIRD-PARTY-NOTICES.md)

</div>

---

## O problema

Um agente de codificação sem estrutura produz duas falhas caras, e as duas são invisíveis até tarde.

A primeira é **trabalho não rastreado**. O agente escreve código que ninguém pediu, marca como pronto o que nunca rodou, e reporta o próprio progresso — um relatório que ele mesmo alucina. A segunda é **custo imprevisível**. Tokens de saída custam de três a cinco vezes a entrada, a entrada é cacheável e ninguém mede, e a fatura chega no fim do mês sem dizer qual tarefa a gerou.

Documentação melhor não resolve nenhuma das duas, porque documentação não se corrige quando o comportamento muda.

## A ideia

O `agf` trata a execução como um **grafo persistente** em SQLite, não como uma conversa. Cada tarefa é um nó com critérios de aceite testáveis; cada dependência é uma aresta; cada transição de estado é validada. Nada é implementado sem um nó, e nenhum nó fecha sem que o critério, o código no disco e o teste no disco concordem entre si.

Sobre esse grafo roda um segundo mecanismo, emprestado da biologia: **Ant Colony Optimization**.

### Por que formigas

Uma formiga sozinha não sabe onde está a comida. A colônia sabe, porque cada formiga que volta de um caminho bom deposita feromônio, e cada caminho ruim evapora. Nenhuma formiga planeja; o caminho ótimo **emerge** do rastro que o sucesso deixa. Isso se chama estigmergia: coordenação através de marcas no ambiente, sem comunicação direta.

Um agente escolhendo qual skill usar tem exatamente o mesmo problema. Ele não sabe, de antemão, qual rota funciona para qual intenção. Mas o grafo lembra.

| Colônia                                         | `agf`                                                           |
| ----------------------------------------------- | --------------------------------------------------------------- |
| A formiga percorre um caminho até o recurso     | Uma skill ou comando é executado para uma intenção              |
| Feromônio é depositado no caminho que deu certo | `agf done` registra a taxa de aprovação dos critérios de aceite |
| Feromônio evapora nos caminhos ruins            | `agf learning route` penaliza rotas que falham                  |
| A colônia converge no caminho ótimo             | `agf learning stats` mostra o score de roteamento               |
| A colônia monitora a própria saúde              | `agf colony-health` emite uma nota de A a F                     |
| Recurso saturado → a colônia muda de alvo       | `agf harness --saturation` aponta a dimensão mais fraca         |

O feromônio só é depositado quando há evidência. `agf provenance` classifica cada afirmação de qualidade em três níveis — `claim` (alegado), `validated` (teste passou), `proven` (hash determinístico) — e o rastro só recebe peso no último. É o que impede a colônia de convergir para uma alucinação: um agente que afirma sucesso sem prova não deixa marca.

A seleção por feromônio é **opt-in** (`agf next --aco`). O padrão é determinístico, e continua sendo — porque um sistema que aprende também erra, e você deve poder desligá-lo.

## De MCP-Graph a Agent Graph Flow

O projeto nasceu como **MCP-Graph**: um servidor MCP que expunha um grafo de tarefas como ferramentas para o agente chamar.

Funcionava, e tinha um teto. O MCP obriga o grafo a ser um _serviço_, atrás de um protocolo, disponível apenas para o agente que o configurou. Um segundo agente — Copilot, Codex, Cursor, Gemini — precisava de outra ponte. Pior: o protocolo empurrava contexto para dentro da conversa, e contexto é a coisa mais cara que existe.

A inversão que dá nome ao projeto foi tirar o grafo de trás do protocolo e colocá-lo atrás de um **CLI**. Um comando é universal: qualquer agente que saiba rodar um processo sabe usar o `agf`. O grafo virou a fonte de verdade, o agente virou o executor, e o MCP virou o que sempre deveria ter sido — um transporte opcional.

`agf` roda com **zero MCP**. O servidor MCP continua no repositório, desligado por padrão, para quem quiser.

## Local-first, e isso é um teste

O `agf` não faz **nenhuma** requisição de rede que você não tenha pedido. Sem verificação de atualização em segundo plano, sem telemetria, sem identificação da sua máquina, sem token embutido no binário.

Isso não é uma promessa de README. É [`src/tests/local-first-no-network.test.ts`](src/tests/local-first-no-network.test.ts), que quebra o build se qualquer módulo alcançar a rede fora de uma lista nomeada de módulos, cada um acionado por um comando que **você** digita.

Existem exatamente duas requisições em todo o programa, e as duas você inicia: instalar, e `agf upgrade`. Ambas buscam o binário em `graph-flow.cloud`, que portanto vê o seu IP — como qualquer download veria. Esse host não guarda `access_log` de `/releases/` e não registra quem instalou o quê. Se preferir não confiar nisso, `AGF_RELEASES_BASE` aponta os dois para onde você quiser.

## Instalação

Sempre por comando. Não há binário nem arquivo compactado para baixar e clicar — um executável obtido pelo navegador chega sem procedência, dispara o Gatekeeper ou o SmartScreen, e treina você a ignorar exatamente os avisos que existem para te proteger.

```bash
# macOS e Linux
curl -fsSL https://graph-flow.cloud/install.sh | bash
```

```powershell
# Windows (PowerShell comum, sem administrador)
irm https://graph-flow.cloud/install.ps1 | iex
```

```bash
# Alternativa: via npm (requer Node.js 20+)
npm install -g agent-graph-flow
```

O instalador tem ~90 linhas legíveis, confere o `SHA256` antes de colocar qualquer coisa no seu `PATH`, instala em `~/.local/bin` sem `sudo`, e não edita o seu shell. Leia antes de rodar. Detalhes em [INSTALL.md](INSTALL.md).

## Primeiros cinco minutos

```bash
agf init                 # cria o grafo (SQLite) neste projeto
agf import-prd docs/prd.md   # ou: agf node add --title "..." --type task

agf start                # puxa a próxima tarefa desbloqueada e a marca em progresso
#   … você implementa com TDD: teste vermelho → código → verde …
agf done <id>            # Definition of Done, gate de testes, fecha o nó

agf metrics              # tokens e custo, por task e por sessão
agf harness              # nota de qualidade em 9 dimensões
```

Sem argumento nenhum, `agf` abre uma tela de boas-vindas. Sem grafo, `agf init` cria um.

## Como o grafo se protege

Cinco invariantes, cada uma cobrada por um gate determinístico e não por disciplina humana:

- **WIP = 1.** Uma tarefa em progresso por vez. Lei de Little: `tempo de ciclo = WIP ÷ vazão`.
- **Puxar, nunca empurrar.** `agf next` puxa a próxima tarefa desbloqueada; ninguém empurra trabalho para dentro.
- **Sem nó, sem código.** Trabalho não rastreado não existe.
- **Triangulação anti-alucinação.** Um nó só fecha quando o critério de aceite, o arquivo de código e o arquivo de teste existem no disco e concordam. `agf gaps --kind phantom_done` cruza o status contra o filesystem, porque status auto-reportado é alucinável.
- **TDD.** O teste vem antes. Sem teste, não há implementação.

## Custo de token como cidadão de primeira classe

Cada chamada de modelo entra no `llm_call_ledger` com o nó que a originou, os tokens cacheados e o custo. `agf metrics` mostra o que cada tarefa custou; `agf metrics --simulate` reprecifica a mesma fatura sob outros modelos; `agf savings` mostra a economia acumulada.

As alavancas agem no gateway, sem comando: diff-edits que enviam só a região alterada, um repo-map ranqueado por PageRank, compressão de saída de ferramenta reversível, e um roteador de conteúdo que escolhe a compressão pelo tipo do dado. Alavancas experimentais — fundamentadas em ACT-R, complexidade de Kolmogorov, o teorema do valor marginal de Charnov, a lei de Kleiber — ficam **desligadas por padrão** (`agf economy on <lever>`). Ligadas ou não, cada byte economizado entra no ledger. A promessa é auditável ou não é promessa.

## Arquitetura

```
src/
├── cli/        comandos (um arquivo por comando; envelope JSON estável)
├── core/       domínio: grafo, gaps, harness, economia, colônia, providers
├── skills/     as skills do ciclo de vida (PLAN · BUILD · HARDEN)
├── tui/        interface de terminal (Ink)
├── mcp/        transporte MCP — opcional, desligado por padrão
└── tests/      todos os testes, em um diretório plano
```

Dez provedores de LLM são detectados por variável de ambiente (`agf doctor --providers`). Nenhum é obrigatório: sem provedor configurado, os comandos `--live` devolvem `mode: delegated` com um brief pronto para o **seu** agente executar com o **seu** modelo. O `agf` foi desenhado para ser dirigido, não para ser o motorista.

## Contribuindo

```bash
git clone https://github.com/DiegoNogueiraDev/agf && cd agf
npm ci && npm run build
npm test
```

Rode `npm run dev -- <comando>` durante o desenvolvimento — nunca o binário instalado, que fica velho em relação ao código que você está editando.

Pull requests são bem-vindos. Abra uma issue antes de mudanças grandes. O projeto é mantido por uma pessoa, e revisão não é garantida.

## Licença e atribuição

Apache-2.0. Veja [LICENSE](LICENSE) e [NOTICE](NOTICE).

Este trabalho incorpora porções de projetos open-source de terceiros sob MIT e Apache-2.0. Cada um está nomeado, com sua licença, seu titular de copyright e os arquivos exatos deste projeto que derivam dele, em [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). A obra original é minha; o resto é creditado, porque esse é o preço da concessão — e um `NOTICE` que afirma propriedade exclusiva sobre código de outra pessoa é uma mentira, não um descuido.

Vulnerabilidades: [SECURITY.md](SECURITY.md).

---

<div align="center">

**Um projeto de Diego Lima Nogueira de Paula**

[graph-flow.cloud](https://graph-flow.cloud)

</div>
