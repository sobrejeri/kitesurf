# Storage HTTP: leitura autenticada com fixture fictícia

Companheiro de `supabase/tests/95_storage_private_buckets.test.sql`. O SQL existente verifica a estrutura dos buckets/policies; este runner verifica respostas HTTP usando clientes Supabase de usuários de teste, sem chave privilegiada. Não substitui os demais cenários de Storage nem a revisão mobile.

## Pré-requisitos

- Projeto Kitesurf `qadkqjfmmnxvovyyhqxw`, URL exata `https://qadkqjfmmnxvovyyhqxw.supabase.co`; outro projeto é recusado.
- Duas contas **Aluno fictícias distintas**, com sessões válidas, sem vínculo administrativo. O servidor Auth verifica os tokens e a consulta de perfil exige `student` para ambas.
- Uma imagem PNG inteiramente fictícia, já existente em `vento-student-avatars`, na pasta do primeiro aluno. Conhecer o SHA256 dos bytes originais. A criação dessa fixture é uma atividade separada e deve seguir o fluxo autorizado de upload; o runner não a cria.
- Chave publishable ou anon do mesmo projeto. Nunca fornecer service_role/secret key.
- Dependências do repositório instaladas (`pnpm install --frozen-lockfile`).
- Fornecer variáveis por mecanismo local seguro; não colocar valores em Git, issues, logs, capturas ou histórico compartilhado.

Variáveis obrigatórias: `STORAGE_TEST_CONFIRM_SYNTHETIC=sim`, `STORAGE_TEST_URL`, `STORAGE_TEST_PUBLISHABLE_KEY`, `STORAGE_TEST_OWNER_JWT`, `STORAGE_TEST_OTHER_JWT`, `STORAGE_TEST_FIXTURE_PATH` e `STORAGE_TEST_FIXTURE_SHA256`. JWTs precisam continuar válidos por ao menos 60 segundos no início. O caminho deve ser PNG na pasta UUID do owner, sem travessia de diretórios.

Com os valores já fornecidos no ambiente:

```sh
node scripts/e2e/storage-readonly.mjs
```

Não autentica por senha, não extrai sessões do navegador e não busca arquivos para escolher uma fixture. Se faltar o segundo aluno ou a fixture conhecida, o cenário fica pendente. Não contornar essa exigência com token administrativo.

## Sete verificações HTTP

1. Owner baixa a fixture; tamanho e hash correspondem ao PNG fictício conhecido.
2. Outro aluno não consegue baixar o mesmo objeto.
3. Cliente anônimo não consegue baixar o objeto.
4. Outro aluno não consegue gerar URL assinada para o objeto.
5. Cliente anônimo não consegue gerar URL assinada para o objeto.
6. Owner gera URL assinada e o download sem sessão preserva o hash conhecido.
7. Nova URL assinada, nunca acessada antes, é recusada após vencimento; a requisição inclui cacheNonce e no-cache.

Cada negação deve ter resposta de autorização/ausência (400/401/403/404). Erro 500/rede não conta como isolamento aprovado. O runner não imprime tokens, URLs assinadas, caminhos, identidades ou conteúdo. Falhas expõem somente a fase. Não há upload, alteração ou exclusão; a única operação POST permitida no guard de rede é assinar o objeto indicado.

**Cache:** conforme a documentação atual do Supabase, CDN pode continuar servindo uma resposta já cacheada após expirar o token. O teste usa uma URL fria e uma chave de cache nova; aprovação não comprova revogação de URL previamente cacheada nem de uma cópia já baixada.

Fontes consultadas:
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/storage/cdn/smart-cdn
- https://supabase.com/docs/guides/storage/serving/downloads

## Estado real consultado em 26/11/2026

Consulta de catálogo somente leitura, sem consultar usuários ou objetos: seis buckets privados; `storage.objects` com RLS; 19 policies destinadas a authenticated (9 SELECT, 6 INSERT, 3 UPDATE e 1 DELETE), zero policies anon/PUBLIC. As três UPDATE têm USING e WITH CHECK. ACLs-base de anon/authenticated incluem SELECT/INSERT/UPDATE/DELETE, sujeitas à RLS; isso isoladamente não prova acesso indevido.

| Bucket | Limite |
|---|---:|
| vento-student-avatars | 3 MiB |
| vento-instructor-avatars | 3 MiB |
| vento-partner-avatars | 3 MiB |
| vento-instructor-documents | 8 MiB |
| vento-chat-files | 10 MiB |
| vento-protection-evidence | 5 MiB |

Esses dados não equivalem a teste HTTP. O runner ainda não foi executado com sessões reais. Os cinco testes automatizados usam clientes simulados, verificando o próprio runner e suas barreiras, sem acesso remoto.

Fora desta entrega: upload, substituição, exclusão, formatos/tamanhos efetivamente recusados pelo servidor, Admin/Instrutor/Afiliado, documentos, anexos de chat e evidências Protege. 3B continua fechado. Nenhuma homologação integral é declarada.
