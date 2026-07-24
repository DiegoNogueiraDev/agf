# Instalação — agent-graph-flow

`agf` é um assistente de linha de comando. Você digita `agf` no Terminal (ou no
PowerShell, no Windows) e ele conduz o trabalho — não precisa saber programar
para instalar.

**A instalação é sempre por comando.** Não há binário nem arquivo compactado para
baixar e clicar. Isso não é uma limitação: um executável baixado pelo navegador chega sem
procedência, dispara o Gatekeeper (macOS) ou o SmartScreen (Windows), e treina
você a ignorar exatamente os avisos que existem para te proteger. Um comando que
você lê antes de rodar é mais honesto que um botão que você clica sem ler.

O instalador é um script curto e legível. Antes de executá-lo, abra a URL no
navegador e leia — são ~90 linhas. Ele não usa `sudo`, não escreve no seu
`.zshrc`/`.bashrc`, e não envia nada a lugar nenhum.

**O `agf` não te observa.** Ele não faz **nenhuma** chamada de rede que você não
tenha pedido: sem verificação de atualização em segundo plano, sem telemetria,
sem identificação da sua máquina, sem token embutido. Isso é verificado por teste
automatizado (`src/tests/local-first-no-network.test.ts`), que quebra o build se
alguém reintroduzir uma chamada — não é uma promessa de README.

Há exatamente **duas** requisições de rede em todo o `agf`, e as duas você digita:
a instalação e o `agf upgrade`. Ambas buscam o binário em `graph-flow.cloud`, que
portanto vê o seu IP — como qualquer download veria. Esse host não guarda
`access_log` de `/releases/` e não registra quem instalou o quê. Se você preferir
não confiar nisso, aponte `AGF_RELEASES_BASE` para um espelho seu; os dois
instaladores e o `agf upgrade` respeitam essa variável.

---

## macOS

### Opção 1 (recomendada) — 1 comando, sem instalar nada antes

Abra o **Terminal** (Spotlight → digite "Terminal" → Enter) e cole:

```bash
curl -fsSL https://graph-flow.cloud/install.sh | bash
```

Instala em `~/.local/bin` — sua pasta, sem senha de administrador.

Se o `agf` não for encontrado depois, adicione a pasta ao PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

### Opção 2 — sua rede bloqueia `curl`? Use o npm

Requer Node.js 20+.

```bash
npm install -g agent-graph-flow
agf --version
```

### Opção 3 — instalador gráfico

Um `.pkg` de duplo-clique está **em breve**. Enquanto não existe, ele não é
oferecido aqui: prometer um artefato que não shipou é pior do que não tê-lo.

---

## Linux

### Opção 1 (recomendada) — 1 comando

```bash
curl -fsSL https://graph-flow.cloud/install.sh | bash
```

Instala em `~/.local/bin`, sem `sudo`.

### Opção 2 — via npm

Requer Node.js 20+.

```bash
npm install -g agent-graph-flow
agf --version
```

### Opção 3 — pacotes de distribuição

`AppImage` e `.deb` estão **em breve**. Ainda não existem; use a Opção 1.

---

## Windows

### Opção 1 (recomendada) — 1 comando

Abra o **PowerShell** normal (não precisa ser como administrador) e cole:

```powershell
irm https://graph-flow.cloud/install.ps1 | iex
```

Instala em `%LOCALAPPDATA%\agf` e adiciona ao PATH **do seu usuário** — nunca ao
do sistema. Abra um **novo** terminal depois de instalar.

### Opção 2 — via npm

Requer Node.js 20+.

```powershell
npm install -g agent-graph-flow
agf --version
```

---

## Por que não existe download direto

O instalador verifica o `SHA256` do binário antes de colocá-lo no seu PATH, e
aborta se não bater. Ele também remove o atributo de quarentena (macOS
`com.apple.quarantine`) e a Mark-of-the-Web (Windows `Zone.Identifier`) — não
para burlar o **Gatekeeper** ou o **SmartScreen**, mas porque um arquivo obtido
por `curl` com checksum conferido não passou pela zona de internet que esses
avisos sinalizam.

Se você contornar o instalador e baixar o binário à mão, esses avisos vão
aparecer: o macOS dirá "desenvolvedor não identificado" e o SmartScreen dirá "O
Windows protegeu o computador". Nesse caso os avisos estão **certos** — você tem
um executável sem procedência verificada. Não os ignore. Use o instalador, que
confere o checksum por você.

## Atualizar

```bash
agf upgrade
```

Só age quando você digita o comando. O `agf` **nunca** verifica atualizações
sozinho — não há checagem em segundo plano nem no encerramento do processo.

---

## Pronto — primeiro uso

Digite, sem nenhum argumento:

```bash
agf
```

Você verá a **tela de boas-vindas**, que explica o próximo passo. A partir dali,
`agf start` puxa a próxima tarefa e conduz o trabalho.

## Se algo der errado

| Sintoma                            | O que fazer                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `agf: command not found`           | A pasta de instalação não está no PATH. Veja a Opção 1 do seu sistema.                     |
| `Checksum mismatch`                | O instalador **recusou** o binário. Não force. Rode de novo; se persistir, abra uma issue. |
| `ERR! cannot read property` (npm)  | Node.js < 20 — atualize com `nvm install 22` ou baixe de [nodejs.org](https://nodejs.org). |
| `better-sqlite3` falha (npm)       | Rode `npm install -g agent-graph-flow --build-from-source`.                                |
| Rede corporativa bloqueia o GitHub | Use a Opção 2 (npm), ou peça liberação de `github.com`.                                    |
