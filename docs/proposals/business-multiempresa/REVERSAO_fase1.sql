-- Reversão da migration 20261115120000_business_company_core.sql.
-- SÓ use se ainda NÃO houver dados reais nas tabelas company_* (apaga tudo delas).
-- Com dados reais, exporte antes. Não toca em nenhum objeto anterior à migration.
begin;
drop function if exists public.set_instructor_rate(uuid, uuid, integer), public.set_instructor_link_status(uuid, public.company_link_status, text),
  public.set_member_override(uuid, uuid, text, boolean), public.set_member_unit_role(uuid, uuid, text),
  public.decline_company_invitation(uuid), public.accept_company_invitation(uuid), public.invite_instructor(uuid, text, uuid[], integer),
  public.invite_staff(uuid, text, jsonb), public.update_unit(uuid, text, text, text, time, time, boolean),
  public.create_unit(uuid, text, text, text, numeric, numeric, time, time), public.admin_set_company_status(uuid, public.company_status, text),
  public.create_company(text, text, text), public.company_audit(uuid, uuid, text, text, jsonb), public.require_company_permission(uuid, text),
  public.company_unit_ids(), public.company_ids(), public.company_any_permission(uuid, text), public.company_has_permission(uuid, text), public.auth_email() cascade;
drop table if exists public.company_audit_logs, public.company_instructor_rates, public.company_instructor_units, public.company_instructor_links,
  public.company_invitation_units, public.company_invitations, public.company_member_overrides, public.company_member_units, public.company_members,
  public.company_units, public.companies, public.company_role_permissions, public.company_permissions cascade;
drop type if exists public.company_invitation_status, public.company_invitation_kind, public.company_link_status, public.company_role, public.company_status;
notify pgrst, 'reload schema';
commit;
