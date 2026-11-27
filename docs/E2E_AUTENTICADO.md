# E2E autenticado (contas fictícias) — como rodar e o que prova

> **Preparação com bloqueio incondicional:** o cenário P continua bloqueado antes de consultar navegador/checkpoint ou criar a solicitação, inclusive com flags de escrita. A oferta, a reserva e os dois encontros têm vínculo explícito no código; os testes usam páginas simuladas e não comprovam o DOM real nem a jornada completa. O código recebeu revisão de protocolo e segurança, mas a execução autenticada deste runner não foi realizada e nenhuma flag remove o bloqueio. Não habilitar o cenário para obter PASS.

**Escopo:** `scripts/e2e/run.mjs` prepara a navegação Playwright/Chromium com contas **fictícias** e relatório PASS / FAIL / BLOQUEADO. O CI executa somente seus helpers e controles com mocks/fixtures, sem credenciais reais ou Playwright real. O CLI autenticado não é executado nesta agregação.
**Limite da evidência:** um ensaio histórico da pilha usou backend fictício local para login/telas/montagem sem enviar. Isso não homologa as proteções novas de origem/captura nem prova a jornada no app real. Os testes manuais do app registrados em `EXECUCAO_PARALELA_20261126.md` também não são execução deste runner. A contagem continua 0/16 integralmente homologadas.

## Pré-requisitos (feitos por quem tem acesso ao projeto de TESTE)
1. Contas fictícias no projeto de teste: Aluno, Instrutor (aprovado, com praia e idioma), Afiliado e, se quiser, Admin (com o autenticador já configurado).
2. Playwright/Chromium disponíveis em um executor isolado e com versão validada antes de executar o CLI. Esta agregação não instala navegador nem altera `package.json`/lockfile do app.
3. Nunca use contas reais. As capturas ficam em disco local (`E2E_OUT`, padrão `e2e-out/`); não as suba ao GitHub sem conferir.

## Variáveis (credenciais somente no ambiente; nunca no repositório)
| Variável | Para quê |
|---|---|
| `E2E_BASE_URL` | Origem HTTPS autorizada ou HTTP loopback, sem caminho, query, fragmento ou userinfo. **Obrigatória** |
| `E2E_ALLOWED_HOSTS` | Hosts aceitos (padrão: localhost, 127.0.0.1, `vento-kitesurf.onrender.com`). Qualquer outro é recusado |
| `E2E_STUDENT_EMAIL` / `_PASSWORD`, `E2E_INSTRUCTOR_*`, `E2E_AFFILIATE_*`, `E2E_ADMIN_*` | Contas fictícias. Perfil sem credencial fica BLOQUEADO |
| `E2E_ADMIN_TOTP_SECRET` | Chave base32 do autenticador da conta Admin **fictícia** (gera o código de 6 dígitos) |
| `E2E_WRITE=sim` | Registra a intenção de escrita; não remove o bloqueio incondicional do cenário P |
| `E2E_OUT` | Pasta do relatório e das capturas |

```bash
E2E_BASE_URL=https://<app-de-teste> E2E_INSTRUCTOR_EMAIL=... E2E_INSTRUCTOR_PASSWORD=... node scripts/e2e/run.mjs
```
Sem `E2E_WRITE=sim` o roteiro só lê (o cenário P fica BLOQUEADO). O resultado vai para `e2e-out/resultado.md` e `resultado.json`; o código de saída é 1 se houver FAIL.

## Cenários
- **S0** as quatro telas de entrada abrem e cabem na tela (celular 390 px e PC 1280 px).
- **S1** login de cada perfil chega à própria área (Admin: passa pelo código do autenticador). **S1b** um perfil logado não acessa as outras áreas (cada app tem o seu cookie).
- **P (cenário prioritário, `scripts/e2e/cenario-4h.mjs`)**, atualmente bloqueado mesmo com `E2E_WRITE=sim` e `E2E_CONFIRM_NO_CHARGE=sim`: P1 monta 4 h em dois encontros; P2 aceita a oferta vinculada; P3 confirma sem cobrança e lê o código; P4 inicia o primeiro encontro; P5 registra minutos/competências; P6 confere evolução/saldo; P7–P9 preparam início/registro/validação do segundo com checkpoint. As variáveis `E2E_M1`/`E2E_M2` representam horários de Fortaleza, sem antecipação; `E2E_DONE_MINUTES` tem padrão 110 e `E2E_SECOND_DONE_MINUTES`, 115. O gate impede todos esses passos antes de usar navegador ou checkpoint.
- **M2** (fila A→B→C com 3 instrutores, #92) fica **BLOQUEADO** por desenho: depende de 3 instrutores aprovados e do agendador no projeto de teste.

## Segurança do próprio runner
Recusa BASE fora da lista/origem esperada e verifica a origem antes de preencher e-mail, senha e TOTP. O contexto inspeciona redirecionamentos HTTP com `route.fetch({maxRedirects:0})` antes de segui-los e fecha páginas/frames que naveguem para outra origem, inclusive esquemas não HTTP. Todas as requisições HTTP exigem a mesma origem e têm redirects inspecionados, inclusive GET/HEAD/OPTIONS e POST de Server Actions. Recursos, Auth/refresh e realtime diretos para Supabase externo ficam bloqueados no harness. WebSockets também são fechados; a capacidade `context.routeWebSocket` é obrigatória, e sua ausência impede criar uma sessão de teste. Essas restrições podem impedir telas que dependem de recursos externos e precisam de homologação isolada, sem afrouxar o bloqueio para obter PASS. Service workers ficam bloqueados neste harness para que suas navegações não contornem a interceptação; portanto ele não homologa PWA instalado/offline.

O registro central remove valores secretos conhecidos do ambiente E2E, JWT/Bearer, parâmetros de segredo e códigos TOTP. O crawler não copia mensagens brutas de login, console, falhas de requisição ou navegação; preserva contagens/status/caminhos sem query. Capturas de autenticação/configuração/conta/perfil são omitidas e as demais mascaram formulários, alertas, PINs, segredos conhecidos e imagens/QR. Essas máscaras reduzem a evidência visual: não usar as capturas como homologação de todos os campos/imagens.

As proteções de roteamento/captura foram verificadas somente com mocks, não em Playwright real. Os vetores RFC 6238 de TOTP e as recusas de origem/redaction/masking são regressões de CI; o gate de escrita P permanece intacto.

## Próximos passos para ampliar (em ordem)
1. Revisar o agregado e confirmar seu CI; homologar primeiro as proteções do próprio harness em ambiente isolado, sem remover o gate P.
2. Validar os seletores e vínculos no DOM real com contas fictícias e evidência por alvo antes de qualquer proposta de habilitação de escrita.
3. Fila A→B→C com 3 instrutores (#92), após o agendador do projeto de teste.

## Varredura de telas (`scripts/e2e/crawl.mjs`)
Visita **todas as telas estáticas** de cada área (descobertas em `src/app`; rotas com `[id]` são puladas) em 390 px e 1280 px, só por GET: não clica nem envia formulários. Por tela aponta erro HTTP, rolagem horizontal, erros de console, requisições que falharam, imagens quebradas ou sem `alt`, botões/links/campos sem nome acessível, alvos de toque menores que 40 px no celular, `lang` e título ausentes. Saída em `crawl-out/telas.md`. As mesmas variáveis do E2E valem. Tela sem sessão do perfil fica BLOQUEADO.
Na primeira rodada, contra o backend fictício, a varredura achou alvos de toque pequenos (corrigidos em outra PR). Avisos de `NaN` no console e o 404 de `/instrutor/checkin` vieram do backend fictício e da tela que exige parâmetro; confirme no app de teste.

## Regressões do protocolo de aceite e confirmação (#103)

`scripts/test-e2e-accept-once.mjs` usa relógio determinístico e páginas simuladas para provar que resposta tardia, ausência de resposta e exceção no clique nunca repetem o aceite. A confirmação exige a página da solicitação correta e um único link da reserva, com origem, rota e UUID validados. P3 exige estado exato `Confirmada` no voucher dessa reserva e códigos de presença consistentes; texto genérico ou ausência do botão não bastam.

`scripts/test-e2e-booking-targets.mjs` também confere que os dois encontros da reserva possuem UUIDs válidos e distintos antes do início. Ausência, duplicidade, identidade inválida e repetição do mesmo encontro em posições diferentes são recusadas. Esses testes não executam os formulários do app real.

O segundo encontro usa as etapas P7 (início), P8 (registro) e P9 (saldo final). Seu horário padrão é dois dias após o primeiro, podendo estar fora da janela permitida quando o roteiro for executado; nesse caso registra BLOQUEADO e preserva o checkpoint. Não adiantar datas nem contornar a regra para obter PASS.

## Segundo encontro e retomada explícita (implementado, ainda bloqueado para escrita)

O padrão do cenário passa a registrar 110 minutos no primeiro encontro e 115 no segundo: total 225/240, saldo 15. As variáveis são `E2E_DONE_MINUTES` e `E2E_SECOND_DONE_MINUTES`, ambas limitadas a 1–120 minutos por encontro.

O runner inicializa `E2E_OUT/priority-checkpoint.json` antes de tentar o segundo início. O checkpoint v2 contém versão, revisão CAS, origem, UUID da solicitação, UUID da reserva, UUIDs distintos dos dois encontros, data real UTC do segundo, minutos esperados e etapa; não contém PIN, senha, cookie ou token. Arquivos v1 não são promovidos automaticamente: faltam identidade da solicitação e journal verificável. A retomada é explícita por `E2E_RESUME_CHECKPOINT=/caminho/priority-checkpoint.json`. Ela não recria solicitação/reserva nem reexecuta P1–P6.

Antes de cada clique da retomada, o protocolo grava sua intenção por CAS em um journal autoritativo e depois no arquivo portátil. O journal é compartilhado por origem+reserva no mesmo executor, em diretório privado `vento-e2e-checkpoints-<uid>` sob o diretório temporário do sistema. Duas cópias do arquivo continuam disputando o mesmo lock exclusivo; outra execução falha fechada. O lock cobre revalidação, leitura e gravações P7/P8. Não possui expiração automática: um processo interrompido exige reconciliação somente leitura do estado e revisão do lock, jamais furto automático de lease. Journal ausente, arquivo público/symlink, identidade divergente e falha de CAS bloqueiam; copiar só o JSON para outra máquina não autoriza gravar. Preserve o journal e o checkpoint para retomar no mesmo executor. Se uma resposta se perder, a retomada primeiro consulta o mesmo encontro. Um início já comprovado não é repetido; um registro já comprovado somente é conferido. Se o resultado de uma tentativa continuar desconhecido, fica BLOQUEADO para reconciliação, sem novo clique automático. Falha ao persistir o checkpoint impede o clique.

A retomada reabre a solicitação original na sessão do aluno e exige novamente seu link único para a mesma reserva, inclusive antes de registrar o segundo encontro. O adaptador lê `data-meeting-starts-at` do encontro autorizado e compara o instante real com o checkpoint em todas as abas e antes do clique; mudança bilateral posterior exige reconciliação, não aceitação silenciosa de outra data. O segundo início exige primeiro encontro registrado com os minutos esperados, mesmos UUIDs, horário dentro de 24h **e** presença do formulário de início autorizado pelo próprio app. O formulário também precisa apontar ao UUID do segundo encontro. Essa verificação não troca datas, não altera agenda e não amplia permissões. O backend mantém a decisão final de elegibilidade.

`scripts/test-e2e-second-meeting.mjs` exerce com adaptador simulado: janela futura, formulário indisponível, reserva/encontro divergente, resposta perdida, retomada após início ou conclusão, resultado desconhecido, falha de persistência, minutos divergentes e saldo 225/15. Não representa execução real de formulário. O bloqueio global permanece antes de qualquer acesso ao navegador, inclusive com checkpoint de retomada.


## Concorrência, incerteza e relatório

`scripts/test-e2e-checkpoint-store.mjs` executa o store de arquivos real, dois processos concorrentes e duas cópias do checkpoint. Verifica um único início/registro, recusa de CAS antigo, identidade imutável de solicitação/data, journal ausente e falha de gravação do espelho. As leituras e cliques do aplicativo continuam simulados nesses testes; isto não é E2E autenticado. A implementação anterior foi reproduzida com duas chamadas simultâneas gerando dois inícios e dois registros; a regressão nova exige exclusão entre processos.

O relatório separa `escrita_solicitada_por_flags`, `gravacoes_comprovadas` e `tentativas_sem_confirmacao`. `gravou_dados` só fica true após observar o estado persistido do alvo correspondente a uma tentativa desta execução. Flags habilitadas com todos P bloqueados produzem false. Uma resposta perdida pode ter gravado mesmo sem comprovação: false não afirma ausência de escrita. Retomar e apenas reconciliar um registro antigo não conta como nova gravação. O PIN permanece somente em memória e não entra em evidências/checkpoint.

As proteções são de execução cooperativa no mesmo executor. Não substituem autorização, idempotência ou locks das RPCs do servidor. A preparação permanece filha da pilha E2E; o bloqueio global incondicional segue antes de qualquer acesso do cenário P ao navegador, arquivo ou checkpoint. Não habilitar para obter PASS.

O CLI passa um loader de retomada para o cenário, sem abrir o JSON no argumento da chamada. O gate é avaliado antes do loader. `scripts/test-e2e-run-report.mjs` executa o controle real do CLI com navegador/login simulados: arquivos de retomada ausentes ou corrompidos, mesmo com flags de escrita, ainda geram os relatórios JSON/Markdown com nove etapas P bloqueadas e nenhuma gravação comprovada ou tentativa de aplicação.

