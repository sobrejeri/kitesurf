# Consulta financeira real da empresa

Integração de homologação sobre o workspace real da PR #297 e os comprovantes da PR #398. Não altera a área demonstrativa `/admin/business`. Cada área tem uma rota própria de consulta: `empresa/[companyId]/pagamentos` em Aluno, Instrutor e Afiliado, e `empresas/[companyId]/pagamentos` no Admin.

CORE e PAYMENTS continuam desligados por padrão. A consulta verifica a sessão atual, o acesso à empresa retornado pelo workspace e `finance.reports` pela função de autorização existente. Membro de equipe sem permissão financeira não recebe dados. Admin exige sessão AAL2 e usa a política de supervisão já existente no banco. A consulta filtra pela empresa antes de limitar e verifica a empresa novamente no resultado; nunca usa demonstração como fallback.

A lista retorna referência, valor, forma, data e situação. Não consulta perfil ou dados pessoais do instrutor sem autorização adicional. Downloads dependem também da flag de comprovantes e usam a sessão da área atual; a rota privada confere a permissão novamente. O link pode não ter arquivo enquanto a escola não enviá-lo.

Não há gravação de pagamentos, RPC nova, upload no workspace ou ativação. Antes de liberar, homologar as dependências e o Storage em ambiente apropriado, conferir permissões reais por perfil, concluir a identificação/autorização dos instrutores e o procedimento para corrigir comprovantes enviados por engano. Testes locais são simulados e não comprovam que o banco remoto está pronto.
