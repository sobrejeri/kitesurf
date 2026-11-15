'use client';

import { useState } from 'react';

import { Button, Field, Note, inputClass } from '@/components/ui';
import { COMPANY_PROFILE, EMPLOYEES, PERMISSIONS, ROLES, UNITS } from '@/lib/business/demo';
import { formatCnpj, validateCompany, validateInvite, validateLink, validateRole } from '@/lib/business/company';

import { Form, adapt, type Option } from './stock-forms';

const NOTE = 'Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.';
const Err = ({ m }: { m?: string }) => (m ? <span role="alert" className="text-[12px] text-danger">{m}</span> : null);
const units: Option[] = UNITS.filter((u) => u.active).map((u) => [u.id, u.name]);
const roles: Option[] = ROLES.filter((r) => r.id !== 'owner').map((r) => [r.id, r.label]);

const KEYS = ['legalName', 'tradeName', 'cnpj', 'ownerName', 'email', 'phone', 'city'] as const;
const companyFields = [
  { k: 'legalName', label: 'Razão social', kind: 'text', wide: true }, { k: 'tradeName', label: 'Nome fantasia', kind: 'text' }, { k: 'cnpj', label: 'CNPJ', kind: 'text', ph: '00.000.000/0000-00' },
  { k: 'ownerName', label: 'Responsável', kind: 'text' }, { k: 'email', label: 'E-mail de contato', kind: 'text' }, { k: 'phone', label: 'Telefone com DDD', kind: 'text', mode: 'numeric' }, { k: 'city', label: 'Cidade da sede', kind: 'text' },
] as const;

/** Registration of a new company. It never grants the platform Admin role to anyone. */
export const CompanyRegisterForm = () => <Form submitLabel="Validar cadastro" init={{ legalName: '', tradeName: '', cnpj: '', ownerName: '', email: '', phone: '', city: '', terms: '' }}
  validate={(v) => validateCompany({ legalName: v.legalName ?? '', tradeName: v.tradeName ?? '', cnpj: v.cnpj ?? '', ownerName: v.ownerName ?? '', email: v.email ?? '', phone: v.phone ?? '', city: v.city ?? '', terms: v.terms }, true)}
  fields={[...companyFields, { k: 'terms', label: 'Termos de uso do VentoKite Business', kind: 'select', options: [['yes', 'Li e aceito os termos']], wide: true }]}
  extra={() => 'Cadastro válido: a empresa nasceria com o responsável como Proprietário e a primeira unidade a configurar. Ninguém recebe papel de administrador da plataforma por este cadastro.'} />;

export const CompanyEditForm = () => <Form submitLabel="Validar alterações" init={{ legalName: COMPANY_PROFILE.legalName, tradeName: COMPANY_PROFILE.tradeName, cnpj: formatCnpj(COMPANY_PROFILE.cnpj), ownerName: COMPANY_PROFILE.ownerName, email: COMPANY_PROFILE.email, phone: COMPANY_PROFILE.phone, city: COMPANY_PROFILE.city }}
  validate={adapt((i: Record<(typeof KEYS)[number], string>) => validateCompany(i, false), KEYS)} fields={companyFields} extra={() => 'Alterações válidas. A mudança de CNPJ ou de proprietário exigiria conferência da administração do VentoKite.'} />;

export function InviteForm() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [roleByUnit, setRoleByUnit] = useState<Record<string, string>>({}); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const links = Object.entries(roleByUnit).filter(([, r]) => r).map(([unitId, role]) => ({ unitId, role }));
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateInvite({ name, email, links }); setE(n); setDone(Object.keys(n).length === 0); }} className="grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
      <Field label="Nome"><input value={name} onChange={(x) => { setDone(false); setName(x.target.value); }} className={inputClass} autoComplete="off" /><Err m={e.name} /></Field>
      <Field label="E-mail"><input value={email} onChange={(x) => { setDone(false); setEmail(x.target.value); }} inputMode="email" className={inputClass} autoComplete="off" /><Err m={e.email} /></Field>
      <fieldset className="grid gap-2 sm:col-span-2"><legend className="text-[12px] font-medium text-label">Unidades e cargos (um cargo diferente por unidade)</legend>
        {units.map(([id, label]) => <label key={id} className="grid items-center gap-1.5 text-[13px] text-ink sm:grid-cols-[1fr_12rem] sm:gap-3"><span>{label}</span>
          <select aria-label={`Cargo em ${label}`} value={roleByUnit[id] ?? ''} onChange={(x) => { setDone(false); setRoleByUnit({ ...roleByUnit, [id]: x.target.value }); }} className={inputClass}><option value="">Sem acesso</option>{roles.map(([r, l]) => <option key={r} value={r}>{l}</option>)}</select></label>)}
        <Err m={e.links} /></fieldset>
      <div className="grid gap-3 sm:col-span-2">{done ? <Note icon="check">Convite válido: {name.trim()} receberia um e-mail para criar o acesso, só nas unidades escolhidas. {NOTE}</Note> : null}<Button type="submit" className="justify-self-start">Validar convite</Button></div>
    </form>
  );
}

export const LinkForm = () => <Form submitLabel="Validar vínculo" init={{ employeeId: '', unitId: '', role: '' }} validate={adapt(validateLink, ['employeeId', 'unitId', 'role'])}
  fields={[{ k: 'employeeId', label: 'Funcionário', kind: 'select', options: EMPLOYEES.map((x): Option => [x.id, x.name]), wide: true }, { k: 'unitId', label: 'Unidade', kind: 'select', options: units }, { k: 'role', label: 'Cargo nesta unidade', kind: 'select', options: roles }]}
  extra={() => 'Vínculo válido: o funcionário passaria a ver esta unidade com o cargo escolhido. A ação entraria na auditoria.'} />;

export function RoleForm() {
  const [name, setName] = useState(''); const [base, setBase] = useState(''); const [perms, setPerms] = useState<string[]>([]); const [confirm, setConfirm] = useState(false); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const sensitive = perms.some((p) => PERMISSIONS.find((x) => x.id === p)?.sensitive);
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateRole({ name, base, permissions: perms, confirmSensitive: confirm }); setE(n); setDone(Object.keys(n).length === 0); }} className="grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
      <Field label="Nome do cargo"><input value={name} onChange={(x) => { setDone(false); setName(x.target.value); }} className={inputClass} autoComplete="off" /><Err m={e.name} /></Field>
      <Field label="Baseado em"><select value={base} onChange={(x) => { setDone(false); setBase(x.target.value); }} className={inputClass}><option value="">Selecione</option>{roles.map(([r, l]) => <option key={r} value={r}>{l}</option>)}</select><Err m={e.base} /></Field>
      <fieldset className="grid gap-1.5 sm:col-span-2"><legend className="text-[12px] font-medium text-label">Permissões</legend>
        <div className="grid gap-1 sm:grid-cols-2">{PERMISSIONS.map((p) => <label key={p.id} className="flex min-h-9 items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={perms.includes(p.id)} onChange={(x) => { setDone(false); setPerms(x.target.checked ? [...perms, p.id] : perms.filter((q) => q !== p.id)); }} />{p.label}{p.sensitive ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10.5px] font-semibold text-warning">Sensível</span> : null}</label>)}</div><Err m={e.permissions} /></fieldset>
      {sensitive ? <label className="flex items-start gap-2 text-[13px] text-ink sm:col-span-2"><input type="checkbox" checked={confirm} onChange={(x) => { setDone(false); setConfirm(x.target.checked); }} className="mt-0.5" /><span>Entendo que estas permissões sensíveis só valem com autorização do Proprietário.<Err m={e.confirmSensitive} /></span></label> : null}
      <div className="grid gap-3 sm:col-span-2">{done ? <Note icon="check">Cargo válido. {NOTE}</Note> : null}<Button type="submit" className="justify-self-start">Validar cargo</Button></div>
    </form>
  );
}
