# A fórmula do agf — explicada pra qualquer pessoa

> Sem matemática. Só analogias. Se você sabe seguir uma receita de bolo, você entende o agf.

## A fórmula em uma linha

```
        ( Mapa fixo  ×  Qualquer cérebro )
agf  =  ─────────────────────────────────  , e cada volta aprende com a anterior
              Desperdício de tokens
```

Em português de gente:

> **agf = um mapa que nunca se perde, dirigido por qualquer motorista, gastando o mínimo de
> combustível — e que fica mais esperto a cada viagem.**

---

## As 4 peças (com analogia)

### 1. O mapa fixo = o grafo 🗺️

Imagine uma **receita de bolo numerada**: passo 1, passo 2, passo 3. Você nunca fica perdido
pensando "e agora?". O agf guarda o trabalho como um mapa de passos com dependências: ele sempre
sabe **qual é o próximo passo liberado** (`next`) e **quando um passo está realmente pronto**
(`done`). O mapa é a "fonte da verdade" — não a memória, que esquece.

> Analogia: um **GPS**. Você pode trocar de carro, de motorista, de humor — o GPS continua sabendo
> o caminho e o próximo retorno.

### 2. Qualquer cérebro = bring-your-own-IA 🧠

O bolo precisa de um **cozinheiro**. O agf não exige um cozinheiro específico: serve o que você já
tem. Se você usa Claude, Copilot, Codex — **esse** é o cozinheiro (modo _delegado_, custo de IA = 0
pro agf, porque a sua CLI já pensa). Se você não tem nenhum, o agf **contrata um** (modo _autônomo_,
com um provider). Ele **detecta sozinho** qual caso é o seu.

> Analogia: uma **cozinha que funciona com qualquer chef**. Trouxe o seu? Ótimo. Não trouxe? A casa
> chama um. A receita (o mapa) é a mesma.

### 3. Desperdício de tokens (no denominador = quanto menor, melhor) 💸

Token é o "combustível" que a IA gasta. O agf corta desperdício de quatro jeitos, todos sem inventar
nada — só **reaproveitando**:

- **Não recomprar o que já está na despensa** — se um comando ou um pedaço de código já foi feito,
  ele **reusa** em vez de pedir pra IA gerar de novo (rag-in, rag-out, reuso de artefato, cache).
- **Carregar só o que precisa pra viagem** — a sua **fórmula de flow** entra aqui: quando o trabalho
  está fluindo (vários acertos seguidos), o agf **esquece os detalhes periféricos** e leva só o
  essencial — provado: **cortou 88% do contexto** sem jogar fora o que é sagrado (regras, riscos,
  critérios de aceite ficam **sempre** na mala).
- **Guardar os recibos** — tudo que economizou vira número auditável (`savings`). Promessa vira dado.

> Analogia: um **viajante experiente**. Não leva a casa inteira na mochila; leva o essencial, reusa o
> que já tem, e anota cada gasto.

### 4. "Cada volta aprende" = a espiral 🌀 (o segredo)

Aqui está o pulo do gato. Um loop que só repete é **burro** (roda em círculo, hamster na rodinha).
O agf não fecha um **círculo** — ele desenha uma **espiral**: cada volta **mede** (savings), **aprende**
(o que deu certo vira atalho de quase-custo-zero) e **se ajusta** (a fórmula de flow esquece mais
quando você está acertando, e **re-lembra tudo na hora que erra**). A próxima volta começa mais
esperta que a anterior.

> Analogia: **juros compostos** — cada ciclo rende sobre o anterior. Ou um **atleta** que revê o jogo
> e melhora no próximo; não repete os mesmos erros.

---

## Por que é a natureza

Tudo que dura na natureza é um **loop com retorno** (a água, as estações, o metabolismo). Mas o que
**evolui** é a **espiral**: o loop + o aprendizado a cada volta. O agf é isso aplicado a fazer
software: entrega rápido, com disciplina de engenharia, gastando pouco — e melhorando sozinho a cada
tarefa. _O truque nunca foi fechar o ciclo; é fazer cada volta aprender com a anterior._

## A promessa, traduzida

| Pilar (técnico)                                 | Em gente                              |
| ----------------------------------------------- | ------------------------------------- |
| Rápido (grafo determinístico)                   | o GPS sempre sabe o próximo passo     |
| Best-practice SWE (TDD/DoD/gates)               | a receita não deixa servir bolo cru   |
| Custo de token brutalmente baixo (reuso + flow) | o viajante esperto que não desperdiça |
| Espiral (savings → learning)                    | juros compostos: melhora a cada volta |

> Prova real (dogfood, 2026-06-18): entregou 2 módulos com testes verdes, **custo de IA = 0** (modo
> delegado), a fórmula de flow **cortou 88%** do contexto preservando o essencial, e ficou mais
> esperta a cada tarefa (Φ subiu 0 → 0.91). Detalhes em `docs/notes/dogfood-loop-proof.md`.
