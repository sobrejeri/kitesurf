# Acessos e cadastros — quem entra onde (11/11/2026)

## Os quatro tipos de conta

Cada conta tem **um único papel** em `profiles.role`: aluno (`student`),
instrutor (`instructor`), afiliado (`partner`) ou admin (`admin`). Uma pessoa
que for, por exemplo, instrutor e afiliado usa duas contas, com e-mails
diferentes.

A separação é conferida em quatro pontos:

1. **Cadastro** — cada app tem o seu. O banco (`handle_new_user`) só cria
   aluno, instrutor ou afiliado; qualquer outro pedido vira aluno. **Admin
   nunca nasce pelo cadastro**: é promovido no banco
   (`supabase/bootstrap-admin.sql`), com registro na auditoria. O usuário só
   altera o próprio nome e idioma, nunca o papel.
2. **Login** — cada app tem sua tela e sua sessão (cookie próprio). Uma conta
   de outro tipo é recusada com o nome do app certo. Só o admin entra em todos.
3. **Telas** — `requireRole` confere o papel de novo antes de mostrar qualquer
   coisa.
4. **Banco** — RLS em todas as tabelas e funções `SECURITY DEFINER` com
   `require_role`. Mesmo chamando a API direto, quem não tem o papel é recusado.

## Login

- **Todos entram com e-mail e senha.** CPF/CNPJ não é login: não é segredo,
  o Supabase Auth não aceita, e uma consulta "CPF → conta" antes do login
  permitiria descobrir quem tem cadastro. O e-mail continua necessário para
  confirmar a conta e recuperar a senha.
- **Admin usa também o código de um app autenticador** (verificação em duas
  etapas, Supabase Auth MFA/TOTP). Depois da senha, o app pede o código de 6
  números; no primeiro acesso, mostra o QR Code para cadastrar o app (Google
  Authenticator, Microsoft Authenticator, 1Password, Authy ou Senhas do iPhone).
  - No app: `requireRole` manda qualquer sessão de admin sem o código
    (`aal1`) para `/<app>/verificacao`.
  - No banco (migration 48): `is_admin()` e `require_role()` só reconhecem o
    admin com sessão `aal2`. Com só a senha, a conta não tem nenhum poder de
    administração, nem pela API.
  - Redefinir a senha de um admin: o link do e-mail leva à tela do código e
    depois à nova senha.
  - O TOTP vem ligado nos projetos Supabase. Se estiver desligado, ative em
    *Authentication › Multi-Factor* (a tela avisa).

### Admin perdeu o celular

Somente o responsável técnico, no **SQL Editor do Supabase**, remove o
autenticador da conta. No próximo login, o app pede para cadastrar de novo:

```sql
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'EMAIL-DO-ADMIN');
```

Recomendação: no cadastro, escanear o QR Code também num segundo aparelho ou
gerenciador de senhas.

## CPF ou CNPJ (instrutor e afiliado)

- Pedido no **Meu perfil** do instrutor e do afiliado: pessoa física informa
  CPF; empresa ou MEI, CNPJ (inclusive o **CNPJ alfanumérico** da Receita, em
  vigor desde julho de 2026).
- Conferido pelos dígitos verificadores no app e no banco
  (`public.tax_id_is_valid`), guardado só com números/letras.
- **Privado**: só o titular e o admin leem (tabela `account_tax_ids`, RLS).
  Aluno não informa documento.
- **Um por conta de cada tipo**: dois instrutores não usam o mesmo CPF, nem
  dois afiliados; a mesma pessoa pode ter uma conta de instrutor e uma de
  afiliado.
- **Exigido na primeira aprovação** (`set_instructor_status`,
  `set_partner_status`). Contas aprovadas antes continuam aprovadas e podem
  informar o documento uma vez.
- **Travado depois da aprovação**: só o admin corrige, em *Admin › Instrutores*
  ou *Admin › Afiliados*, com motivo. A auditoria registra o tipo (CPF/CNPJ),
  nunca o número. O número também não vai para os logs do app.

## Aplicar no Supabase (migrations 47 e 48)

O app publicado funciona antes e depois das migrations: sem a 47, o campo de
CPF/CNPJ aparece como "aguardando ativação" e não entra no progresso; sem a
48, o código do admin é exigido só pelo app.

Ordem recomendada:

1. Publicar o app.
2. Cada admin entra uma vez e cadastra o app autenticador.
3. No SQL Editor, aplicar `20261111140000_registration_47_account_tax_ids.sql`
   e depois `20261111150000_security_48_admin_second_factor.sql`. As duas não
   dependem das migrations 43–46 nem são alteradas por elas.

Testes: `scripts/test-db.sh` (no Linux sem locale UTF-8, rodar com
`LC_ALL=C.UTF-8`), `scripts/test-tax-id.mjs` e
`scripts/test-admin-second-factor.mjs`.
