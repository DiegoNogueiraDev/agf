# PRD: Serviço de Upload de Arquivos

PRD **deliberadamente incompleto** — material de demonstração do harness `agf gaps`.
Importe e rode `agf gaps` para ver as lacunas de completude que o harness detecta.

## Requisitos

### REQ-1: Upload de arquivo

O usuário deve poder enviar um arquivo pelo formulário e o sistema deve respondê-lo de forma rápida.

**Critérios de aceite:**

- O usuário seleciona um arquivo e clica em enviar
- O arquivo aparece na lista após o upload

### REQ-2: Performance

A resposta do upload deve ter latência baixa e a interface deve ser intuitiva.

### REQ-3: Listagem

O usuário pode ver os arquivos que enviou.

**Critérios de aceite:**

- A lista exibe os arquivos do usuário

## Tasks

### TASK-1: Implementar endpoint de upload (XL)

Implementa o endpoint HTTP de upload, validação e armazenamento.

**Critérios de aceite:**

- Recebe o arquivo via multipart e o salva no storage

### TASK-2: Tela de listagem

Renderiza a lista de arquivos.

**Critérios de aceite:**

- Mostra os arquivos enviados pelo usuário
