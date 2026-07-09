# A Árvore Forte — a analogia viva do agent-graph-flow

> **Tese:** o sistema cresce como uma árvore de floresta madura — **raízes** que ancoram
> e absorvem, uma **rede subterrânea** que compartilha entre árvores, **frutos** (produtos)
> que carregam **sementes** (padrões), e **pássaros** que as semeiam em novas gerações.
> Quase toda a energia vem de reuso determinístico (crescimento provado); só a **novidade
> adaptativa** custa "energia" (tokens). Inspiração biológica fundamentada — não alegação literal.

## Mapa botânico ↔ arquitetura

| Biologia                                               | Função natural                                                                                        | No sistema                                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Raízes**                                             | ancoragem + absorção de água/nutrientes + estoque de carboidrato [1]                                  | **corpus roots** — ancoram o agente no código real e absorvem padrões                                                                     |
| **Taproot** (raiz principal) vs **laterais** [1]       | profundidade + alcance                                                                                | o **próprio projeto** (taproot) + **raízes registradas/irmãs** (laterais)                                                                 |
| **Solo**                                               | onde os nutrientes vivem                                                                              | o **código existente** dos projetos — a matéria de onde se extrai                                                                         |
| **Rede micorrízica / "wood wide web" / mother tree**   | árvores trocam carbono/nutrientes no subsolo; a árvore-mãe nutre as mudas e reconhece parentesco [2]  | **corpus multi-projeto / federation** — projetos compartilham padrões "no subsolo", deterministicamente; um projeto maduro nutre os novos |
| **Anéis de crescimento / cerne**                       | registro acumulado que dá rigidez                                                                     | **padrões aprendidos** (`artifact_cache`, `success_patterns`) — o histórico que dá força                                                  |
| **Frutos**                                             | recompensa que carrega a próxima geração                                                              | os **produtos/artefatos gerados** (scaffold, boilerplate, código)                                                                         |
| **Sementes dentro do fruto**                           | a informação reprodutível                                                                             | os **padrões reutilizáveis** (signatures) dentro de cada artefato                                                                         |
| **Banco de sementes do solo** (dormência)              | sementes persistem e germinam décadas depois [3]                                                      | `artifact_cache` persistido — sementes que esperam e germinam (reuso `exact`) muito depois                                                |
| **Pássaros — ornitocoria / endozoocoria** (mutualismo) | a ave come o fruto e dispersa a semente; **a passagem pelo trato digestivo aumenta a germinação** [4] | o **dogfooding/disseminação** — levar padrões a novos projetos; passar pelo **coupler** deixa o padrão mais pronto para "germinar"        |
| **Polinização / mutação / variação**                   | introduz novidade no pool genético                                                                    | a **borda criativa** (o único uso de LLM) — gera o que o corpus não cobre; o que vinga vira **nova semente**                              |
| **Seleção natural / fitness**                          | o que sobrevive se propaga                                                                            | o **ranking determinístico** + `sona-router` — padrões mais bem-sucedidos ganham preferência                                              |
| **Fenologia** (estações)                               | regula quando crescer, frutificar, economizar                                                         | **λ_flow** — o ritmo que governa alocação de energia/tokens                                                                               |

## O ciclo de vida (a evolução da árvore forte)

1. **Enraizar** — o agente lança raízes nos projetos (corpus). Quanto mais fundas e largas,
   mais forte a árvore. (raízes = ancoragem + absorção [1])
2. **Conectar** — as raízes se entrelaçam numa rede subterrânea entre projetos; o maduro
   nutre o novo, como a _mother tree_ nutre a muda [2].
3. **Crescer** — cada padrão aprendido é um anel; o cerne acumulado dá rigidez (reuso = 0 token).
4. **Frutificar** — a árvore gera frutos (produtos) determinísticos a partir das sementes
   que já tem.
5. **Semear** — os pássaros (dogfooding) carregam as sementes a solos novos; a passagem
   pelo coupler melhora a germinação [4]; sementes dormem no banco até germinar [3].
6. **Adaptar (raro e caro)** — quando o ambiente exige algo inédito, há **mutação/polinização**
   (a borda criativa, único gasto de tokens). O que tem _fitness_ vira semente nova → na
   próxima estação já é determinístico.

> **Economia como ecologia:** uma floresta gasta quase toda a energia em crescimento provado
> (reuso) e só uma fração em novidade adaptativa. É exatamente o λ⋆: **decidir com o mínimo,
> construir com o que já germinou.** `tokens → 0`.

## Honestidade científica

A metáfora da "wood-wide web" é **inspiração**, não prova. Em 2023, especialistas alertaram
que parte da narrativa popular sobre redes micorrízicas excedeu as observações de campo
(viés de citação) [2]. Adotamos o **mecanismo** (compartilhamento determinístico de recursos
entre nós conectados) sem antropomorfizar — no nosso caso o "subsolo" é o `artifact_cache`
e o corpus, e o compartilhamento é código, não carbono.

## Fontes

- [1] Funções das raízes (ancoragem, absorção, estoque): UC Davis, _The Root System_;
  CSU Extension, _Understanding Tree Roots_.
- [2] Redes micorrízicas / mother trees / wood wide web: Suzanne Simard (research) e
  Wikipedia; crítica 2023 em _Trends in Ecology & Evolution_ (ScienceDirect).
- [3] Banco de sementes do solo / dormência: estudos em _PMC_ sobre persistência e
  recrutamento tardio.
- [4] Ornitocoria / endozoocoria / frugivoria como mutualismo (passagem pelo trato ↑
  germinação): Britannica, _Seed dispersal_; Wikipedia, _Seed dispersal_.
