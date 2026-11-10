# VentoKite Protege — homologação de permissões (etapa 3E)

> Checklist proposto. **Não afirma que sessões reais foram testadas.**
> Migrações 39 e 40 **foram aplicadas** ao Supabase de produção em 09/11/2026, mas os fluxos 3B **seguem desativados** até homologação autenticada.
> Preservar `NEXT_PUBLIC_VENTO_PROTEGE_STATEMENTS_ENABLED` desativada até
> testes autenticados, validação de Storage, política de retenção e aprovação da ativação.

## 1. Verificação estrutural sem ler dados pessoais

- [ ] Comparar `public.booking_incidents`, `public.bookings`, `public.booking_meetings` e `public.profiles` com os SQL versionados, em ambiente isolado
- [ ] Verificar histórico de migrações: a ausência de `supabase_migrations.schema_migrations` não deve ser corrigida marcando versões como aplicadas sem comparação
- [x] Conferir funções e políticas `SECURITY DEFINER` / grants / search paths criados pelas migrations 39/40 no catálogo do banco
- [x] Conferir existência do bucket privado `vento-protection-evidence`, limite de 5 MB e RLS declarada na base
- [x] Executar PostgreSQL isolado com migrações 39/40 e os testes de RLS 89/90 (CI aprovado antes da instalação)
- [ ] Concluir plano operacional de reversão, retenção e restauração para futuras atualizações. As migrations 39/40 já foram aplicadas sem mudanças em pagamentos

## 2. Matriz de visualização esperada

| Perfil | Incidente antigo sem histórico de instrutor | Incidente durante atribuição A | Incidente durante atribuição B | Provas privadas |
|---|---|---|---|---|
| Aluno da reserva | Pode ver | Pode ver | Pode ver | Apenas as suas |
| Instrutor A, substituído | Somente se autor | Pode ver | Não pode ver, exceto se autor | Apenas as suas |
| Instrutor B, substituto | Somente se autor | Não pode ver | Pode ver | Apenas as suas |
| Admin | Pode ver | Pode ver | Pode ver | Pode ver para análise |
| Pousada / terceiro | Não pode ver | Não pode ver | Não pode ver | Não pode ver |

O aluno e o instrutor só podem registrar manifestações quando a reserva, o
encontro e o vínculo do usuário permitirem. Uma mudança de status não apaga
evidências e não autoriza repasse ou estorno.

## 3. Passos de homologação com contas de teste

1. Criar reserva e encontro de **teste** num projeto de homologação; não executar pagamentos reais
2. Entrar como Aluno e registrar uma ocorrência; conferir data e histórico
3. Entrar como Instrutor A e registrar relato independente
4. Reatribuir a reserva ao Instrutor B pelo fluxo normal
5. Testar Aluno, Instrutor A, Instrutor B, Admin e Pousada no celular e no PC
6. Confirmar que Instrutor B não visualiza registros da fase A; Instrutor A mantém somente o histórico autorizado
7. Criar um relato da fase B; conferir que A não passa a visualizá-lo
8. Verificar que a decisão do Admin e o envio das provas **não** concluem aula, alteram saldo, liberam pagamento ou removem arquivos
9. Conferir paginação por código da reserva, filtro inválido, último registro e caso já cancelado
10. Registrar resultados e capturas, revisar divergências antes de qualquer ativação no Render

## 4. Pendências operacionais

- Política de retenção das evidências com base legal, prazos e guarda
- Fluxo de remoção autorizado somente pela API do Supabase Storage, nunca `DELETE FROM storage.objects`
- Validação do histórico do instrutor substituído no banco real, sem acessar dados de usuários indevidamente
- Testes end-to-end autenticados em iPhone e desktop
- Revisão da integridade de versões e de consultas por reserva

## 5. Homologação transacional no Supabase real — 09/11/2026

Testes realizados via SQL com `BEGIN`, troca controlada para o papel `authenticated` e `ROLLBACK` ao final. Foi usada uma das reservas **já marcadas como teste**, sem alterar presença, status, pagamento ou quem é responsável pela reserva.

**Cenários aprovados:**
- Aluno autorizado enviou um depoimento temporário e pôde consultá-lo.
- Instrutor autorizado consultou a declaração do aluno, enviou depoimento próprio e abriu ocorrência temporária; os campos de snapshot do instrutor foram conferidos.
- Pousada não conseguiu consultar depoimentos, análises administrativas, dados do anexo ou ocorrência, nem submeter um relato pela RPC.
- Admin conseguiu registrar uma avaliação temporária; o instrutor não conseguiu usar a RPC administrativa.
- Minutos inconsistentes com a declaração foram rejeitados.
- Metadata de prova não confirmada foi invisível para contrapartes; confirmação foi rejeitada sem o objeto físico no Storage.
- O estado da reserva permaneceu `confirmed` e o encontro `scheduled` durante o teste.
- Foi executado `ROLLBACK`. A conferência posterior mostrou **5 reservas, 6 encontros, 0 ocorrências, 0 depoimentos, 0 revisões, 0 anexos, 0 objetos no novo bucket e 27 logs de auditoria**, sem alterações persistentes.

**Não testado:** upload e download reais de mídia através do Storage HTTP, geração/uso de URL assinada com sessão real, UI no iPhone e PC, e substituição entre dois instrutores cadastrados no Supabase de produção (há somente 1 perfil de instrutor). A troca de instrutor passou nos testes SQL isolados do CI, mas **isso não equivale à homologação com usuários reais**.

**Trava adicional 41:** a interface não é uma barreira suficiente contra chamadas diretas à API. Migração 41 preparada para revogar as quatro RPCs de escrita enquanto a homologação final estiver pendente. Após a 41, o teste funcional de escrita deverá ocorrer em ambiente autorizado e controlado, com liberação temporária planejada para testes e ativação somente depois da revisão.

**Ambiente:** Render possui apenas o serviço principal, com previews desativadas. Não criar ambiente adicional com potencial custo sem autorização específica. Nenhuma operação financeira foi executada nestes testes.
