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

## Mods (Claude Code 2.1.296)

Fonte: os tipos da API de mods (early access) e o binário do Claude Code 2.1.296,
lidos em 2026-10-11, comparados com o plugin e com os run logs de setembro e
outubro. Do lado dos mods nada foi rodado: o que está dito sobre eles vem dos tipos
e do binário. Dois pontos sem mod foram testados no mesmo dia com teammates
descartáveis: o `effort` do `Agent` e a entrega no meio do turno.

Um mod é um plugin cujo `hooks.json` aponta para um módulo TypeScript ou JavaScript
que roda dentro do processo do Claude Code: hooks nos eventos do engine, chamadas
em `$` (tasks, mensagens, prompt, modelo, UI) e elementos de UI.

Em resumo: os mods deixariam o team8 trabalhar dentro da sessão em vez de em volta
dela. Hoje, porém, acrescentariam um segundo caminho de código em vez de substituir
um, e cada dor medida tem uma correção mais barata, sem mod, que funciona em
qualquer conta.

### O que um mod dá que um command hook não dá

- **Visibilidade exata, dentro do processo.** Cada `tool.call`, `turn.step` e
  `turn.complete` (uso) e `session.send`/`session.receive` (correio) de um teammate
  in-process chega marcado com `agentId`, e `$.agent.list()` dá a identidade. Isso
  dispensaria o sh+curl por evento (cerca de 29 ms de bloqueio por chamada de
  ferramenta), a regex sobre `agent_id`, a espera de 22–33 s pelo sidecar e a caça
  aos re-keys de time.
- **Agir por código.** `$.prompt.submit` acorda um lead ocioso. O `context` no
  resultado de um `tool.call` leva até 100k caracteres ao próximo passo de um
  teammate ocupado (o `additionalContext` clássico para em 10k). `$.session.send`
  entrega pelo mesmo caminho do `SendMessage`: o próprio Claude Code grava a
  entrada no inbox, em vez de o console escrever direto no arquivo. `TaskStop` via
  `$.tool.call` encerra o agente de verdade.
- **UI dentro do Claude Code, com testes.** Linha de status, faixa acima do prompt e
  painéis, no terminal e no desktop. `claude plugin test` testa o comportamento dos
  hooks, o que os gates em shell não têm hoje.

### Onde compensa, em ordem

1. **Aviso de desbloqueio, se for fazer algum mod.** Cerca de 60 linhas, só observa.
   Um hook `tool.call` em `TaskUpdate` vê a task concluída; um minuto depois procura
   tasks que ficaram desbloqueadas e seguem sem dono, e chama `$.prompt.submit` (sem
   `await`) para o lead despachar a próxima onda, no lugar dos loops de Monitor. O
   ganho é pequeno: alguns minutos por onda, só quando uma task que bloqueia outro
   track é concluída no meio do próprio track (2 casos em setembro, nenhum medido
   em outubro). Uma frase no `executor.md` cobre quase o mesmo sem mod: ao concluir
   uma task cujo `TaskGet` mostra `blocks`, mandar ao lead "#N concluída; desbloqueia
   #M". Antes de construir, observar o auto-claim do 2.1.296 (ver os achados): um
   teammate ocioso pode pegar a task desbloqueada antes do minuto, mesmo sendo de
   outro track. O mod vem primeiro porque, se falhar, fica o comportamento de hoje,
   e prova a base de que os outros precisam.
2. **Entrega no meio do turno.** O 2.1.296 não faz isso (teste de 2026-10-11, ver os
   achados). Um hook em `session.send` segura a mensagem do lead e a entrega no
   `context` da próxima chamada de ferramenta do teammate. Não é mais rápido que o
   branch `delivery`: os dois entregam quando a chamada atual do teammate termina.
   Ganha só no custo (sem spawn de bash+node por chamada) e no limite de 100k. Sem
   mod há outro caminho: o console já responde a cada PostToolUse e às vezes devolve
   `additionalContext` (o lembrete de progresso em
   `src/server/ingest/hooks.ts:140-156`); pode devolver ali as mensagens não lidas,
   sem o spawn extra do branch, mas só com o console no ar: se ele cair, a mensagem
   volta a chegar no fim do turno. Isso cobre também mensagens escritas pelo
   console. Teammates em painel só entram se o console aprender a reconhecer a
   sessão do painel: hoje ele descarta hooks sem `agent_id` de sessões que não são a
   do lead (`hooks.ts:116`).
3. **Só a linha de status, e sem dor medida que a justifique.** Um `$.ui.status`
   alimentado pelos `tool.call` observados, não por polling de `TaskList`, que
   dispararia os curl hooks do próprio team8. Painel e faixa reimplementariam o
   console em Box/Text, uma segunda UI para manter em dia com a primeira, e um
   painel que ninguém pediu só aparece a partir de 144 colunas. Sem mod quase dá o
   mesmo: o `subagentStatusLine` que o setup grava termina em `printf ''` e não
   desenha nada; ele pode imprimir a task e o progresso que o console já sabe.
4. **Quando os mods saírem do early access: empurrar eventos para o console.** É o
   ganho de longo prazo, porque parte do trabalho de setembro no console brigou com
   atribuição: uns 20 de 124 commits (re-key de time, ancestrais de `/branch`, hooks
   de outras sessões, sidecars). Só compensa quando os curl hooks puderem ser
   apagados. A leitura de arquivos fica de qualquer jeito, porque o console lê todas
   as sessões da máquina, faz a leitura inicial e guarda o histórico. Enquanto os
   dois caminhos convivem, nada sai. Mandar os controles do console pela sessão
   fica de fora: nenhum run log mostra a necessidade, e isso abriria um caminho
   local do console até o `$.prompt.submit` de qualquer sessão.

### Não fazer como mod

| Ideia | Correção mais barata |
|---|---|
| Gates de task (melhoria 1) | Um PreToolUse clássico (matcher `TaskCreate\|TaskUpdate`) que lê só o input da chamada: o `TaskCreate` precisa trazer `complexity`, `model`, `effort` e `why`, e o `TaskUpdate` que conclui a task precisa trazer `metadata.verified` na mesma chamada. Sem caminho de arquivo, some o bug de diretório errado dos dois scripts atuais (cerca de 30 stops bloqueados em 09-29) e o segundo `TaskUpdate` por conclusão. |
| Relatórios inteiros (efeito colateral da melhoria 3) | A notificação de idle corta a resposta final em 4.000 caracteres, com 16.000 no total por entrega. Uma regra no `executor.md`, no `reviewer.md` e na `run` (parte 7 e o pedido de revisão): resposta final com até ~3.500 caracteres, e o resto num arquivo que o relatório nomeia. Isso elimina as 3 a 6 idas e voltas "manda o resto" nos batches afetados; 7 das 9 registradas foram pedidas a revisores. |
| Conferir modelo e effort de cada agente | O console já recebe, pelos curl hooks, o resultado de cada `Agent` (com o `resolvedModel`) e o `effort` aplicado em todo PreToolUse e PostToolUse. Effort errado já custou 2–4× (delay log de 09-29). Desde o PR #36 (09-30) o effort vem da definição: o run log do plaud-folder (10-02) ainda diz "session effort", mas os transcripts mostram todo executor em medium, com o lead em xhigh. |
| Guardas de git e do revisor | PreToolUse clássico por `agent_id`/`agent_type`. Arquivos de agente de plugin ignoram `hooks:`, então a guarda tem de ficar nos hooks do plugin. |
| NEEDS YOU como notificação | O Warp não é um dos canais de `$.ui.notify`. Um hook de Notification do usuário com `osascript`/`say` funciona. |
| Recuperação no resume (melhoria 6) | Umas 10 linhas no `console-hint.sh`, que hoje descarta o payload: com `source` igual a `resume`, um `additionalContext` dizendo que, se esta sessão liderava um time, os teammates in-process morreram e que é preciso rodar `TaskList`, resetar as tasks `in_progress` e respawnar antes de mandar mensagem. Disparar só em sessões com time exigiria a resolução de time do `console-launch.sh`, bem mais que 10 linhas. |
| Brief via `$.model.complete`, comandos sem turno, supressão de eco, histórico de tasks | Valor pequeno. O histórico de tasks já fica no log do time (`logs/<team>.jsonl`); falta o console lê-lo depois que o time acaba, e o branch `finished-team-history` (5d3573f) só tem o spec disso. |

### O porém

- **Flag de rollout.** Módulos de plugins instalados só carregam com a flag
  `tengu_plugin_hooks_modules` ligada, que o GrowthBook entrega a cada sessão (ou o
  cache em disco da sessão anterior). Nesta conta, o cache local já a mostrou
  ligada e desligada no mesmo dia; para outras contas, não se sabe. Builds antigos,
  como o 2.1.76, descartam `modules` do `hooks.json` em silêncio. Toda feature em
  mod precisa manter o caminho clássico até a disponibilidade geral, então no curto
  prazo é mais código, não menos.
- **Só in-process.** Um mod no lead só vê loops in-process: teammates em painel
  (tmux) rodam em outro processo, e agentes de Workflow não aparecem em
  `$.agent.list()`.
- **Ordem da cadeia.** Os hooks `classic.*` de um mod rodam antes dos command hooks
  do team8 e dos do usuário. Um hook que não chama `next()` pula todos eles em
  silêncio.
- **Decisão pendente.** Se o team8 é, na prática, uma ferramenta pessoal, features
  só em mod servem, ao custo de um terceiro runtime, com build e testes próprios,
  sobre uma API early access que pode mudar entre releases sem aviso. Se é para
  outras pessoas, os mods ficam como adição até a disponibilidade geral.

### Achados no caminho, sem mod

- **No 2.1.296, teammates in-process pegam tasks sozinhos, ao nascer e quando ficam
  ociosos**: a primeira task pendente, sem dono e desbloqueada, de qualquer track.
  Ao nascer, o teammate marca essa task como sua e `in_progress` antes de ler o
  prompt do spawn, sem mandar texto ao modelo. Ocioso, recebe "Complete all open
  tasks. Start with task #N". Como o lead só define o dono da primeira task de cada
  track, logo antes do spawn, um executor novo pode nascer dono da task de outro
  track, com o modelo ou effort errado. É o auto-claim da melhoria 7, mas do lado
  do Claude Code e sem respeitar track. Definir o dono de toda task antes do
  primeiro spawn evita isso.
- **Lead → teammate ocupado é a maior dor medida entre as que um mod atacaria.** No
  delay log de 09-29 ela vem em 8º, sobreposta às outras linhas, atrás de pensar em
  max (27% das track-min) e das checagens do app empacotado (14%). Em 09-29, 24 de
  44 mensagens do lead chegaram com mais de 5 min de atraso, e essas levaram
  mediana de 23 min, até 75. Em outubro a mediana foi 0,0 min nos seis batches que
  medem atraso, mas os máximos chegaram a 9,4 min (drop-import) e 21,2 min
  (session-detail-transcript), as duas vezes com o teammate testando o app. Apesar
  da string `[InboxPoller] … delivered mid-turn` no binário, o teste de 2026-10-11
  mostrou que o 2.1.296 não entrega no meio do turno: a mensagem ficou sem ler
  pelas cinco chamadas do teammate (67 s), como no teste do branch `delivery` em
  09-30. O branch (51cae23) continua necessário.
- **O `Agent` agora aceita `effort`, mas o valor não chega a teammates.** Testado em
  2026-10-11: um `team8:executor` criado com `effort: "high"` rodou em `medium`, o
  do arquivo, e um teammate general-purpose criado com `effort: "low"` rodou em
  `max`, o da sessão. O binário confirma: o ramo do `Agent` que cria um teammate
  com nome ignora o `effort` da chamada; só subagents o recebem. Então
  `executor-low/high/xhigh` e `src/server/agent-variants.ts` ficam. `reviewer-light`
  só poderia sair se o revisor fosse sempre um subagent sem nome e o parâmetro
  vencesse o `effort:` do arquivo, o que não foi testado. `agent-variants.ts:5`,
  `run/SKILL.md:229` e `specs/2026-09-30-team8-speed-design.md:74` dizem que o
  parâmetro não existe; deveriam dizer que ele não chega a teammates.
- **A melhoria 2 está no comando, mas ele se contradiz.**
  `plugin/commands/setup.md:25` lista `subagentPromptCacheTtl: "1h"` entre as três
  coisas que o comando faz, mas o passo 3 ("Write only these two keys", linha 86)
  só mostra `env` e `subagentStatusLine`. Em 10-07 o `/team8:setup` gravou a chave
  mesmo assim, guiado pela linha 25; um modelo que siga o passo 3 à risca deixa o
  cache de 5 minutos. O ganho também é menor do que a melhoria 2 diz: no track-e só
  uma pausa passou de 5 minutos (8,5 min), e a releitura fria de 141k tokens foi
  uns 9% do custo do track. O resto dos ≈$4,35, contra ≈$1,15 estimado, foi o
  trabalho das três rodadas, a maior parte no teste.
- **Opcional: `autoCompactWindow` no `executor.md`.** Arquivos de agente de plugin
  aceitam a chave, e o binário mostra que ela vale para teammates in-process: a
  cada mensagem nova, o runner compacta o histórico que passa do
  `autoCompactWindow` do arquivo de agente. Em 09-29, dois teammates chegaram a
  690k e 620k de contexto e pagaram cerca de $53 cada em leitura de cache. Falta
  testar se compacta no meio de um turno longo.
- **`asyncRewake: true`.** Command hooks do 2.1.296 aceitam essa opção: o hook roda
  em background e acorda o modelo quando sai com código 2. É um jeito sem mod de
  acordar o lead a partir de um `TaskCompleted`, mas não está documentado qual loop
  ele acorda quando dispara da chamada de um teammate.

### Como fechar as dúvidas

Um mod descartável, carregado com `claude --plugin-dir` (cerca de uma hora),
responde o que os tipos não respondem: quando `session.send` e `session.receive`
disparam e se `$.session.append` entra num teammate em execução. Os tipos já dizem
que os command hooks enxergam `$.env.set`: a chamada vale para o processo e para
tudo que ele inicia depois. Sem mod, dois testes curtos: o loop que o `asyncRewake`
acorda e o `autoCompactWindow` num turno longo de teammate.
