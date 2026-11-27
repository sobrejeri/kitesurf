import 'server-only';
import { getViewer } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { businessCoreEnabled } from './core-feature';

type CompanyRow={id:string;owner_id:string;trade_name:string;status:'pending'|'active'|'suspended'};
type MemberRow={id:string;company_id:string;user_id:string;status:string};
type LinkRow={member_id:string;unit_id:string;role:'manager'|'finance'|'attendant'};
type UnitRow={id:string;company_id:string;name:string;city:string;active:boolean};
export type CompanyWorkspace={
  id:string;name:string;status:CompanyRow['status'];access:'owner'|'member'|'admin';
  units:{id:string;name:string;city:string;active:boolean;role:'owner'|'admin'|LinkRow['role']}[];
};
export type CoreResult={kind:'disabled'|'unauthenticated'|'denied'|'unavailable'}
  |{kind:'ready';canCreate:boolean;companies:CompanyWorkspace[];hasMore:boolean};

/** Reads as the current area's authenticated user. RLS is repeated with owner,
 * own-membership and unit predicates before returning a minimal DTO. Demo data
 * and client-supplied role/owner/company identities are never fallback sources.
 */
export async function readCompanyWorkspace():Promise<CoreResult> {
  if(!businessCoreEnabled())return {kind:'disabled'};
  try {
  const viewer=await getViewer();
  if(!viewer)return {kind:'unauthenticated'};
  const admin=viewer.role==='admin';
  if(admin && !viewer.secondFactor)return {kind:'denied'};
  if(!['student','instructor','partner','admin'].includes(viewer.role))return {kind:'denied'};
    const db=await createSupabaseServerClient();
    const [companyResult,memberResult]=await Promise.all([
      db.from('companies').select('id,owner_id,trade_name,status').order('created_at',{ascending:false}).limit(201).returns<CompanyRow[]>(),
      db.from('company_members').select('id,company_id,user_id,status').eq('user_id',viewer.id).eq('status','active').limit(1000).returns<MemberRow[]>(),
    ]);
    if(companyResult.error || memberResult.error)return {kind:'unavailable'};
    const members=(memberResult.data??[]).filter(member=>member.user_id===viewer.id && member.status==='active');
    const membership=new Map(members.map(member=>[member.id,member.company_id]));
    const memberCompanies=new Set(members.map(member=>member.company_id));
    const visible=(companyResult.data??[]).filter(company=>admin || company.owner_id===viewer.id || memberCompanies.has(company.id));
    const rows=visible.slice(0,200);
    if(!rows.length)return {kind:'ready',canCreate:!admin,companies:[],hasMore:false};
    const [unitResult,linkResult]=await Promise.all([
      db.from('company_units').select('id,company_id,name,city,active').in('company_id',rows.map(row=>row.id)).order('name').limit(1001).returns<UnitRow[]>(),
      members.length ? db.from('company_member_units').select('member_id,unit_id,role')
        .in('member_id',members.map(member=>member.id)).limit(2000).returns<LinkRow[]>() : Promise.resolve({data:[] as LinkRow[],error:null}),
    ]);
    if(unitResult.error || linkResult.error)return {kind:'unavailable'};
    const links=(linkResult.data??[]).filter(link=>membership.has(link.member_id) && ['manager','finance','attendant'].includes(link.role));
    const byCompany=new Map(rows.map(company=>[company.id,company]));
    const visibleUnits=(unitResult.data??[]).filter(unit=>{
      const company=byCompany.get(unit.company_id);
      return company && (admin || company.owner_id===viewer.id
        || links.some(link=>link.unit_id===unit.id && membership.get(link.member_id)===company.id));
    });
    const units=visibleUnits.slice(0,1000);
    return {kind:'ready',canCreate:!admin,hasMore:visible.length>200 || visibleUnits.length>1000,
      companies:rows.map(company=>{
        const access=admin?'admin':company.owner_id===viewer.id?'owner':'member';
        return {id:company.id,name:company.trade_name,status:company.status,access,
          units:units.filter(unit=>unit.company_id===company.id).flatMap(unit=>{
            const link=links.find(item=>item.unit_id===unit.id && membership.get(item.member_id)===company.id);
            let role:'owner'|'admin'|LinkRow['role'];
            if(access==='owner')role='owner';
            else if(access==='admin')role='admin';
            else {if(!link)return [];role=link.role;}
            return [{id:unit.id,name:unit.name,city:unit.city,active:unit.active,
              role}];
          }),
        };
      }),
    };
  } catch { return {kind:'unavailable'}; }
}
