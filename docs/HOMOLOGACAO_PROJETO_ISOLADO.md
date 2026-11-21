# Projeto Supabase ISOLADO para a homologação autenticada (E2E)

**Por quê:** o único projeto conhecido (`qadkqjfmmnxvovyyhqxw`, "kitesurf") recebe o app publicado e tem dados reais; o retorno de 19/11 (PR #300) confirmou que o
histórico oficial só tem as migrations 39 a 42 e que as migrations 01 a 38 foram aplicadas à mão. Para rodar Aluno → Instrutor → Admin com sessões
autenticadas sem arriscar esse projeto, use um projeto **novo e descartável**. Nenhuma migration é aplicada no projeto existente por este roteiro.

## Avisos
- **NUNCA rode `supabase db push` (nem `migration up`) no projeto existente.** O histórico dele não tem 01 a 38; a CLI tentaria reaplicá-las.
  No projeto **novo** (vazio) é o caminho certo: todas as migrations entram em ordem e o histórico fica completo.
- Não copie dados reais de usuários para o projeto novo. Contas e dados são fictícios.
- Cobranças reais permanecem desativadas (o pagamento é o simulado). Não configure nenhum provedor de pagamento no projeto novo.
- Nada aqui toca em Protege 3B nem nas migrations 39 a 42 do projeto existente.

## Passo a passo
1. **Criar** um projeto Supabase novo (ex.: `kitesurf-homolog`). Anote a URL e a chave `anon` (públicas). Não use a chave `service_role` em lugar nenhum do app.
2. **Aplicar todas as migrations** do repositório, na ordem, a partir de uma cópia limpa da branch a homologar (PR #300 mais a #303):
   ```bash
   supabase link --project-ref <REF_DO_PROJETO_NOVO>     # confira duas vezes que é o NOVO
   supabase db push
   ```
   Alternativa sem CLI: SQL Editor, um arquivo de `supabase/migrations/` por vez, em ordem de nome. Cada arquivo é uma transação; se algum falhar, **copie a mensagem exata, pare e registre na issue #88**.
3. **Conferir** com o pacote `docs/CONSULTAS_HOMOLOGACAO_SOMENTE_LEITURA.sql`. Resultado esperado no projeto novo: Q3 com `tem_trava_283 = true` e `tem_revalidacao_283 = true` na de 6 args e
   `delega_a_de_6_args = true` na de 5 args; `pronargdefaults = 0` na de 6 args (consulta de assinaturas do roteiro #88); Q4 com as 2 guardas; Q10 com as 14 funções presentes; Q5 e Q6 com 0 linhas; Q9 com buckets privados.
4. **Contas fictícias** (painel Authentication, e-mail confirmado): 1 aluno, 3 instrutores, 1 admin, 1 afiliado. O perfil `admin` é definido por SQL pelo responsável (admin nunca é autoatribuído no cadastro):
   `update public.profiles set role = 'admin' where id = '<id da conta admin>';` e o Admin usa o código do app autenticador (2FA). Aprove os instrutores com documentos fictícios, na mesma praia (ex.: Preá), idioma Português, agenda aberta.
5. **Rodar o app apontando para o projeto novo**, sem publicar nada: crie um `.env.local` **local e não versionado** com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, e rode `pnpm install && pnpm dev`
   (ou um serviço Render separado, só de homologação, com essas três variáveis). Nunca altere as variáveis do serviço de produção.
6. **Agendador** (só no projeto novo): `docs/HOMOLOGACAO_FILA_92.md`, Passo 1.
7. **Executar os roteiros:** `docs/HOMOLOGACAO_FILA_92.md` (A→B→C com navegadores fechados) e `docs/ROTEIRO_HOMOLOGACAO_FRENTES_89_93_103.md` (quatro perfis, VNT/reserva nova, dispositivos), registrando o bloco de evidência em cada issue.
8. **Ao terminar:** `cron.unschedule(...)`, e pause ou apague o projeto.

## Variante B: ensaio da atualização com uma CÓPIA do projeto existente (recomendada antes de aplicar em qualquer lugar)
Reproduz o caminho real de atualização (ledger só com 39 a 42, migrations 01 a 38 aplicadas à mão, assinatura legada de 5 args):
1. Faça o dump do projeto existente (comando no fim de `docs/HOMOLOGACAO_MIGRACOES_88.md`, seção Backup).
2. Crie um projeto **novo e vazio**, restaure o dump nele (`pg_restore --no-owner -d "<URL do novo>" arquivo.dump`) e confira com `docs/CONSULTA_DERIVA_ANTES_DE_APLICAR.sql` que o estado é o mesmo do original.
3. **Nesta variante NÃO use `supabase db push`** (o ledger copiado só tem 39 a 42 e a CLI tentaria reaplicar 01 a 38). Aplique **só** as migrations da ordem do roteiro #88, uma por vez, pelo SQL Editor, e confira a verificação de cada uma.
4. Os dados copiados são os do projeto atual (contas fictícias de teste, segundo os registros das issues): confirme que não há dados pessoais reais antes de copiar.
Na variante A (projeto vazio) o `supabase db push` é o caminho; na variante B nunca.

## Quem executa o E2E
Sessões de Aluno, Instrutor e Admin são feitas por pessoas (ou por um navegador automatizado) com as contas do passo 4, em navegadores separados.
O ambiente de automação do Claude **não** alcança `*.supabase.co` (`curl: (56) CONNECT tunnel failed, response 403`); se o responsável quiser que ele rode o app e um navegador automatizado
contra o projeto isolado, é preciso liberar o host do projeto novo na rede do ambiente (ação do responsável, com aprovação) e fornecer as credenciais **das contas fictícias** de forma segura.
