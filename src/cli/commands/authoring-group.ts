/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * authoring-group — os três scaffolders de autoria, num ponto só
 * (node_6449e6b57857).
 *
 * PORQUÊ: "qualquer pessoa opera o agf" inclui AUTORAR — criar uma skill, um
 * agente, um hook. Os três comandos já existiam e nenhum aparecia no índice,
 * então só quem lesse o código sabia que podia criá-los. Capacidade que
 * ninguém encontra entrega zero, mesmo shipada e testada.
 *
 * DECISÃO: o grupo é DERIVADO do registro de comandos, não escrito à mão. Uma
 * lista fixa passaria a mentir no dia em que um scaffolder fosse renomeado ou
 * removido — e mentiria em silêncio, que é o pior modo de falhar num índice.
 * Derivar também é o que dá sentido à regra de indisponibilidade abaixo.
 *
 * GOTCHA conhecido (node_a287463cb115): `--dir` NÃO significa o mesmo nos dois
 * lados — em `skill new` é o diretório de DESTINO, em `skill list` é a raiz do
 * projeto. Criar com uma raiz e listar com a mesma raiz devolve lista vazia.
 * Por isso as descrições abaixo dizem "liste com" em vez de prometer que a
 * criação aparece automaticamente: a promessa seria falsa hoje.
 *
 * Ausência é DECLARADA, não omitida: um scaffolder que não está registrado
 * aparece marcado como indisponível. Sumir com a entrada faria o operador
 * concluir que a capacidade não existe; derrubar a lista inteira trocaria uma
 * lacuna pequena por cegueira total.
 */

export interface HelpItem {
  cmd: string
  desc: string
}

export interface HelpGroup {
  title: string
  items: HelpItem[]
}

export const AUTHORING_GROUP_TITLE = 'Autoria (criar seus próprios artifacts)'

/**
 * Os três scaffolders. `registryName` é o comando-raiz que precisa estar
 * registrado para a entrada valer — é por ele que a disponibilidade é checada.
 */
export const AUTHORING_SCAFFOLDERS: ReadonlyArray<{
  registryName: string
  cmd: string
  desc: string
}> = [
  {
    registryName: 'skill',
    cmd: 'skill new <nome>',
    desc: 'cria uma skill (instruções que qualquer CLI-agente lê); liste com agf skill list',
  },
  {
    registryName: 'agent',
    cmd: 'agent create <nome>',
    desc: 'cria um papel de agente (TOML) com prompt e ferramentas; liste com agf agent list',
  },
  {
    registryName: 'hooks',
    cmd: 'hooks add <canal>',
    desc: 'cria um hook num dos canais do ciclo (pre/post gate); liste com agf hooks list',
  },
]

/**
 * Monta o grupo de autoria contra os comandos realmente registrados.
 * Sempre devolve as três entradas: as ausentes vêm marcadas.
 */
export function buildAuthoringGroup(registeredCommands: ReadonlySet<string>): HelpGroup {
  return {
    title: AUTHORING_GROUP_TITLE,
    items: AUTHORING_SCAFFOLDERS.map((s) => ({
      cmd: s.cmd,
      desc: registeredCommands.has(s.registryName)
        ? s.desc
        : `indisponível nesta instalação (comando ${s.registryName} não registrado)`,
    })),
  }
}
