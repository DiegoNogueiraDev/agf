# Visão: CLI de Lista de Tarefas (todo-cli)

Objetivo principal: entregar uma CLI mínima, local-first, para gerenciar uma lista de
tarefas em um arquivo JSON — adicionar, listar e concluir tarefas — com testes.

## Requisitos

- O sistema deve persistir as tarefas em um arquivo `tasks.json` no diretório atual.
- O comando deve retornar exit code 0 em sucesso e 1 em erro de uso.
- A CLI deve funcionar offline, sem nenhuma chamada de rede (local-first).

## Funcionalidades

### Implementar comando `add <texto>`

Cria uma tarefa com id incremental e status "aberta", persistindo em tasks.json.

- [ ] Dado um título, `add` grava a tarefa em tasks.json
- [ ] Rodar `add` duas vezes gera ids distintos e sequenciais

### Implementar comando `list`

Imprime as tarefas, uma por linha, com id e status.

- [ ] `list` num arquivo vazio imprime "(nenhuma tarefa)"
- [ ] `list` mostra "[x]" para concluídas e "[ ]" para abertas

### Implementar comando `concluir <id>`

Marca a tarefa como finalizada.

- [ ] `concluir` num id inexistente sai com código 1 e mensagem clara
- [ ] `concluir` num id válido muda o status para "finalizada"

## Restrições

- Restrição: não usar banco de dados externo — apenas o arquivo JSON local.
- Constraint: zero dependências de runtime além da biblioteca padrão do Node.

## Riscos

- Risco: corrupção do tasks.json por escrita concorrente. Mitigação: escrita atômica
  (arquivo temporário + rename) em cada gravação.
- Risk: ids duplicados se o arquivo for editado à mão. Mitigation: derivar o próximo id de
  `max(ids) + 1` na carga.
