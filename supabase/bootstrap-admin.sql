-- Promote the first administrator. Run ONCE in the Supabase SQL editor after
-- that person has created an account through the app (/cadastro).
--
-- This is deliberately not a migration: an e-mail address is environment
-- data, and admin is never granted by sign-up. Later admins can be promoted
-- the same way by someone with access to the SQL editor.

update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'SEU-EMAIL@exemplo.com');

insert into public.audit_logs (actor_id, action, entity, entity_id, new_state, reason)
select id, 'profile.promoted_admin', 'profile', id::text, '{"role":"admin"}', 'Primeiro administrador'
from auth.users where email = 'SEU-EMAIL@exemplo.com';
