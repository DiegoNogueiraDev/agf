# Documentação

O que um leitor externo precisa para entender, auditar e estender o `agf`.
Planejamento interno, backlogs e diagnósticos não vivem aqui — eles envelhecem em
semanas e mentem em silêncio quando o código muda.

| Diretório                        | O que é                                                                                                             | Quando ler                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [`adr/`](adr/)                   | Architecture Decision Records: uma decisão por arquivo, com o contexto que a produziu e as alternativas descartadas | Antes de reverter uma decisão que parece arbitrária |
| [`architecture/`](architecture/) | O mapa das camadas e como elas compõem                                                                              | Ao começar a mexer em `src/core`                    |
| [`decisions/`](decisions/)       | Decisões menores que um ADR, grandes demais para um comentário                                                      | Ao esbarrar num limite estranho                     |
| [`contracts/`](contracts/)       | Contratos de dados publicados (formato, campos, garantias)                                                          | Ao consumir um artefato do `agf` de fora            |
| [`reference/`](reference/)       | Referência: fórmulas, limiares, cálculos                                                                            | Ao interpretar um número que o `agf` reporta        |
| [`runbooks/`](runbooks/)         | Procedimentos operacionais reproduzíveis                                                                            | Quando algo precisa ser feito, não entendido        |
| [`examples/`](examples/)         | Exemplos executáveis, incluindo um PRD de amostra                                                                   | Nos primeiros cinco minutos                         |
| [`proof/`](proof/)               | Evidência de que uma capacidade entrega o que promete, medida em repositório real                                   | Ao duvidar de uma afirmação do README               |

A instalação está em [INSTALL.md](../INSTALL.md). A política de segurança, em
[SECURITY.md](../SECURITY.md). As atribuições de terceiros, em
[THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).
