# Evidências visuais — #93 Etapa 2/4 (UI do Instrutor)
Capturas do `next dev` com um **backend fictício local** (auth e PostgREST falsos, uma reserva de teste "VNT-9001", sessão de instrutor de teste). **Não é E2E**: não há Supabase, nem RPC, nem sessão real; mostram só o que a tela renderiza em cada estado. Dados 100% fictícios. Capturas de página inteira (barras fixas e o aviso "Nova versão" do modo dev aparecem no meio por causa disso).

| Arquivo | Flag | Estado |
|---|---|---|
| `on-interrupt-form-mobile.png` | ligada | aula em andamento, escolha "Interrompida": motivo, minutos, restante calculado (1–30), etapas, aviso ao aluno |
| `on-normal-form-desktop.png` | ligada | escolha "Concluída normalmente": minutos e etapas, sem texto de saldo |
| `on-awaiting-mobile.png` / `on-awaiting-desktop.png` | ligada | interrompida aguardando continuidade: motivo, minutos dados/restantes, agendador (horário de Fortaleza); **sem** formulário de presença |
| `on-scheduled-mobile.png` | ligada | continuidade agendada: data marcada, reagendar, retomada com o mesmo código de presença |
| `off-inprogress-mobile.png` | **desligada (padrão)** | a tela de sempre: "Concluir e registrar encontro" (regressão) |

Achado nesta evidência e corrigido: em "aguardando continuidade" a tela mostrava o formulário de presença abaixo do agendador.
