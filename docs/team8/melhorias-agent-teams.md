# Melhorias para o team8 à luz da documentação de agent teams

Fonte: https://code.claude.com/docs/en/agent-teams (lida em 2026-09-15), comparada com
as skills do plugin (`plan`, `tasks`, `run`, `setup`, `console`) e com as medições
dos runs de hoje (console-liveness, solo-lab, todo-lab, pdf-lab).

## O que o team8 já faz certo

- Cria teammates pelo `Agent` com `name`, sem `isolation`, que é exatamente o
  mecanismo que a doc descreve para formar um time.
- Isola trabalho paralelo por posse de arquivos, não por branch. A doc recomenda o
  mesmo ("dois teammates no mesmo arquivo se sobrescrevem").
- Passa o modelo por task na chamada do `Agent`, que é a primeira fonte na ordem
  de escolha de modelo da doc.
- O `team8:setup` já grava `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` no settings.

## Melhorias, em ordem de retorno

### 1. Fazer o contrato valer com hooks, não com prosa

A doc oferece três hooks que, ao sair com código 2, bloqueiam a ação e devolvem
feedback ao agente. O plugin não registra nenhum deles.

- **`TaskCreated`**: recusar uma task sem `metadata.model` e `effort`. A skill
  `tasks` diz que o quarto campo "é o que sempre pulam"; um hook torna impossível
  pular.
- **`TaskCompleted`**: recusar a conclusão quando o comando de verificação da task
  não rodou ou os arquivos do dono não estão commitados. A própria doc lista
  "status de task atrasa" como limitação, e hoje o track-b marcou concluído antes
  da revisão.
- **`TeammateIdle`**: não usar. Um teammate ocioso já acorda com uma mensagem, então
  "ficar disponível" é exatamente ficar idle; bloquear o idle faria o teammate rodar
  em círculos gastando tokens enquanto espera a revisão. O `TaskCompleted` cobre o
  caso real, porque também dispara quando um teammate encerra o turno com tasks
  `in_progress`.

### 2. Definir `subagentPromptCacheTtl: "1h"` no `team8:setup`

O cache de um teammate dura cinco minutos por padrão. Hoje os executores ficaram
parados de 3 a 10 minutos entre rodadas de revisão, então cada rodada de correção
releu o contexto do zero. As três rodadas do track-e custaram ≈$4,35 contra uma
estimativa de ≈$1,15. É uma chave de settings.

### 3. Parar de reportar em dobro

A doc diz que a notificação de idle já leva a resposta final do teammate ao lead.
O team8 exige também um `SendMessage` de relatório, então o lead recebeu cada
resultado duas vezes hoje, e o track-b interpretou uma atribuição reentregue como
duplicada. A parte 7 deveria dizer: sua resposta final é o relatório, sem mensagem
separada.

### 4. Manter os turnos do lead curtos

Mensagens só chegam ao lead entre turnos. Medido hoje: a entrega tem mediana de
0,5 s, mas um relatório esperou 5 minutos enquanto eu estava no meio de uma
investigação. O "fique livre" da skill `run` precisa de dente: nada de trabalho
pesado em ferramentas enquanto há tracks vivos; investigue antes do dispatch ou em
um subagent.

### 5. Definir executor e revisor como subagent definitions

A doc aplica a lista `tools` de uma definition ao teammate. Uma definition
`team8-reviewer` sem `Edit` e `Write` torna o "somente leitura" garantido em vez de
pedido. Uma `team8-executor` carrega o contrato de sete partes uma vez, em vez de
em cada prompt.

### 6. Adicionar um caminho de resume ao `team8:run`

`/resume` derruba os teammates in-process mas mantém a lista de tasks. A skill
deveria ler a lista, tratar tasks `in_progress` com dono morto como livres e
respawnar, em vez de o lead mandar mensagem para fantasmas.

### 7. Deixar teammates pegarem tasks sozinhos dentro do track

A doc recomenda 5 a 6 tasks por teammate com auto-claim. O team8 atribui um dono por
task à mão, o que custa uma ida e volta do lead por task.

### 8. Duas checagens para o `team8:doctor`

- Avisar se `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` está definido: ele ignora em
  silêncio todo modelo por task.
- Registrar que sessões `claude -p` nunca criam teammates, o que explica por que os
  briefs do próprio console voltam como subagents.

## Números de hoje que sustentam isso

| Medição | Valor |
|---|---|
| Entrega de mensagem teammate → lead, mediana | 0,5 s |
| Pior caso (lead ocupado num turno longo) | 5 min 19 s |
| Track-e, 3 rodadas de revisão | ≈$4,35 vs ≈$1,15 estimado |
| pdf-lab, Workflow parado no diálogo de permissão | 9 min 21 s de 15 min |
| Batch console-liveness, do primeiro dispatch ao último track limpo | 52 min |
