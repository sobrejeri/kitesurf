# Roteiro de homologação autenticada: #89, #93 e #103 (e o que repetir de #90, #91, #94)

**Por que existe:** o ambiente de automação não alcança `*.supabase.co` (`curl: (56) CONNECT tunnel failed, response 403`), não tem contas de teste nem
dispositivos. Os testes automatizados do repositório são **evidência técnica**; só a execução abaixo, com sessões reais, é **homologação**.
Use **somente o projeto de teste** e **cobranças reais desativadas** (pagamento é o simulado). Migrations nesta ordem (ver `docs/HOMOLOGACAO_MIGRACOES_88.md`):
`20261115100000` (se faltar), `20261116160000`, `20261116170000`, `20261117190000`, `20261119120000`, `20261119130000`, `20261119140000`.

## Como registrar a evidência (um bloco por cenário, na issue correspondente)
```
Cenário:            <nome>
Perfil / sessão:    Aluno | Instrutor | Admin | Afiliado
Dispositivo:        desktop <navegador> | iPhone Safari/PWA | Android Chrome
Versão do app:      <SHA do /api/version ou do deploy no Render>
Ambiente:           <projeto Supabase de teste>
Resultado observado: <o que a tela mostrou, com horário>
Evidência:          <captura sem dados pessoais> e o SQL somente leitura que confirma
Estado:             homologado | parcial | bloqueado (+ mensagem exata do erro)
```

## #89: autenticação, perfis e documentos (4 perfis, sessões separadas)
Use um navegador/perfil diferente por papel (ou janelas anônimas), nunca a mesma sessão.
| Passo | Aluno | Instrutor | Admin | Afiliado/Pousada |
|---|---|---|---|---|
| Cadastro em `/<papel>/criar-conta` (Admin não se cadastra: conta criada pela operação) | e-mail de confirmação chega e o link abre o app certo | idem; CPF/CNPJ obrigatório | n/a | idem; CPF/CNPJ obrigatório |
| Login e logout | entra em `/aluno/…` | `/instrutor/…` | `/admin/…` com código do app autenticador (2FA) | `/afiliado/…` |
| Recuperação de senha (e-mail → redefinir → entrar) | ok | ok | ok | ok |
| Foto aparece onde deve (início, perfil, e para a outra parte) | enviar e ver | enviar e ver | ver as fotos | enviar e ver |
| Acesso cruzado: colar uma URL de outro papel | redireciona ao login/home do papel | idem | idem | idem |
Documentos (instrutor, com arquivos **fictícios**): enviar identidade e certificação → Admin **reprova** com motivo → instrutor vê o motivo e **reenvia** →
Admin **aprova** → instrutor passa a poder ser aprovado. Confirmar que **outro instrutor** não consegue abrir o arquivo (URL assinada/Storage) e que o aluno não vê documentos.
Evidência SQL (somente leitura): `select status, count(*) from instructor_documents group by 1;` e `select id, public from storage.buckets order by 1;` (buckets de documentos/avatares/anexos: `public = false`).

## #93: presença, minutos e evolução (reserva de teste VNT-1008, se ainda válida)
1. Conferir o ponto de partida (somente leitura): `select code, status, total_hours from bookings where code = 'VNT-1008';` e `select position, status, starts_at, minutes, done_minutes from booking_meetings where booking_id = (select id from bookings where code = 'VNT-1008') order by position;` — esperado: encontro 1 `done` com 110, encontro 2 `scheduled`.
2. **Regra de início: divergência documentada.** As issues #93/#103 falam em "início 24h antes". O banco libera pelo **dia do calendário em Fortaleza** (`start_ordered_meeting`): encontro de **hoje** pode iniciar a qualquer hora do dia; encontro de **amanhã** (mesmo 00:05) **não** inicia, mesmo faltando poucas horas. Fixado em `supabase/tests/89e_meeting_start_window.test.sql`. **Decisão pendente do responsável:** manter "no dia" ou trocar por 24h reais (mudança de uma linha na função). Registre no app o que foi observado.
3. Se o encontro 2 for de outro dia: aguarde o dia **ou**, em teste, antecipe só o horário (`update booking_meetings set starts_at = … where id = …`) e anote que foi antecipado.
4. Instrutor: abrir a aula, **PIN errado** (deve recusar), **PIN certo** (inicia), tentar iniciar o encontro 2 **antes** do 1 (deve recusar), registrar **115 min** com habilidades; tentar **registrar de novo** (deve recusar) e **minutos inválidos** (ex.: 121; deve recusar).
5. Aluno: abrir a reserva → esperado **225 min realizados e 15 de saldo**, habilidades no encontro certo (110: encontro 1; 115: encontro 2), avaliação do instrutor só na conclusão elegível, e o pedido de **reposição de 15 min** (instrutor aceita/recusa; confirmar o prazo de 48h do pedido).
6. SQL somente leitura de conferência: `select position, done_minutes, status from booking_meetings where booking_id = (…) order by position;` e `select public.booking_balance_minutes('<id da reserva>');` (como o aluno) → `15`.

## #103: ponta a ponta nos quatro perfis
Para cada cenário, rodar em **desktop**, **iPhone Safari/PWA** e **Android**, e registrar o bloco de evidência acima.
1. Aluno pede 4h em 2 dias → instrutor aceita → confirmação de validação (ver #90/#93).
2. A recusa, B expira, C aceita (ver `docs/HOMOLOGACAO_FILA_92.md`, Passo 3, com navegadores fechados).
3. Instrutor inicia no dia, registra minutos e conclui (ver #93).
4. Remarcar / cancelar / repassar ao próximo com prazos e saldo (ver `docs/HOMOLOGACAO_FILA_92.md`, Passo 4) e **ocorrência**: aluno relata → a outra parte é notificada → Admin vê a ocorrência aberta e revisa → reserva, valores e saldo **não** mudam.
5. **Duas conversas em paralelo com anexos e contadores:** abrir duas reservas com chat; enviar texto e anexo em cada; conferir que o contador de não lidas de cada conversa é independente, que a "bolinha" some ao abrir e **volta** com nova mensagem.
6. Admin aprova documentos, **ajusta preço** (publica nova versão; reservas já confirmadas **não** mudam de valor; novas usam o novo) e gera aulas de teste.
7. **Afiliado/Pousada indica:** aluno entra por `?ref=CODIGO`, contrata; a **primeira** contratação paga gera **uma única** comissão elegível; a segunda contratação do mesmo aluno **não** gera nova.
8. **Perda e retomada de conexão** (em cada dispositivo): com uma tela aberta (lista de aulas ou chat), ligar o modo avião por ~30 s e desligar; esperado: o app avisa a falta de conexão, **não** perde o que foi digitado, e retoma/recarrega os dados sem duplicar envio.
9. PWA: instalar em iPhone e Android; abrir como app; sair e voltar; sessão permanece (cookie por app).

## Totais
Conte como **homologado** apenas o cenário com bloco de evidência autenticado, em dispositivo e versão identificados. Teste automatizado verde **não** conta.
