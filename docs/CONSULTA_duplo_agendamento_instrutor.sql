-- SOMENTE LEITURA. Procura reservas ativas do MESMO instrutor com horários que se sobrepõem
-- (o sintoma do defeito de corrida em create_booking). ESPERADO: 0 linhas.
-- Se aparecer alguma linha, são duas reservas aceitas para o mesmo instrutor ao mesmo tempo:
-- não apague nada; leve o resultado a quem decide como tratar com os alunos.
select ba.instructor_id,
       a.booking_id as reserva_a, a.id as encontro_a, a.starts_at as inicio_a, a.minutes as minutos_a,
       b.booking_id as reserva_b, b.id as encontro_b, b.starts_at as inicio_b, b.minutes as minutos_b
from public.booking_meetings a
join public.bookings ba on ba.id = a.booking_id
join public.booking_meetings b on b.id > a.id and b.booking_id <> a.booking_id
join public.bookings bb on bb.id = b.booking_id and bb.instructor_id = ba.instructor_id
where a.status <> 'cancelled' and b.status <> 'cancelled'
  and ba.status in ('confirmed', 'awaiting_payment') and bb.status in ('confirmed', 'awaiting_payment')
  and tstzrange(a.starts_at, a.starts_at + make_interval(mins => a.minutes), '[)') && tstzrange(b.starts_at, b.starts_at + make_interval(mins => b.minutes), '[)')
order by a.starts_at;
