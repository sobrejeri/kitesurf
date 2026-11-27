import 'server-only';
import { getViewer } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { businessCoreEnabled } from './core-feature';

type CompanyRow={id:string;owner_id:string;trade_name:string;status:'pending'|'active'|'suspended';created_at?:string};
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
    const memberResult=admin?{data:[] as MemberRow[],error:null}:await db.from('company_members')
      .select('id,company_id,user_id,status').eq('user_id',viewer.id).eq('status','active').limit(1000).returns<MemberRow[]>();
    if(memberResult.error)return {kind:'unavailable'};
    const members=(memberResult.data??[]).filter(member=>member.user_id===viewer.id && member.status==='active');
    let hasMore=(memberResult.data?.length??0)>=1000;
    const membership=new Map(members.map(member=>[member.id,member.company_id]));
    const memberCompanies=new Set(members.map(member=>member.company_id));
    const chunks=(values:string[])=>Array.from({length:Math.ceil(values.length/100)},(_,i)=>values.slice(i*100,i*100+100));
    const companies=()=>db.from('companies').select('id,owner_id,trade_name,status,created_at').order('created_at',{ascending:false});
    const ownerQuery=companies();
    if(!admin)ownerQuery.eq('owner_id',viewer.id);
    // Scope BEFORE limiting. Do not rely on current RLS hiding all other
    // companies forever; the public storefront remains a separate RPC API.
    const companyResults=await Promise.all([
      ownerQuery.limit(201).returns<CompanyRow[]>(),
      ...(!admin?chunks([...memberCompanies]).map(ids=>companies().in('id',ids).limit(100).returns<CompanyRow[]>()):[]),
    ]);
    if(companyResults.some(result=>result.error))return {kind:'unavailable'};
    hasMore=hasMore || (companyResults[0].data?.length??0)>=201;
    const deduplicated=[...new Map(companyResults.flatMap(result=>result.data??[]).map(company=>[company.id,company])).values()];
    const visible=deduplicated.filter(company=>admin || company.owner_id===viewer.id || memberCompanies.has(company.id))
      .sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??'') || a.id.localeCompare(b.id));
    const rows=visible.slice(0,200);
    hasMore=hasMore || visible.length>200;
    if(!rows.length)return {kind:'ready',canCreate:!admin,companies:[],hasMore};
    const selectedIds=new Set(rows.map(row=>row.id));
    const [unitResults,linkResults]=await Promise.all([
      Promise.all(chunks([...selectedIds]).map(ids=>db.from('company_units').select('id,company_id,name,city,active')
        .in('company_id',ids).order('name').limit(1000).returns<UnitRow[]>())),
      Promise.all(chunks(members.filter(member=>selectedIds.has(member.company_id)).map(member=>member.id))
        .map(ids=>db.from('company_member_units').select('member_id,unit_id,role').in('member_id',ids).limit(1000).returns<LinkRow[]>())),
    ]);
    if([...unitResults,...linkResults].some(result=>result.error))return {kind:'unavailable'};
    hasMore=hasMore || [...unitResults,...linkResults].some(result=>(result.data?.length??0)>=1000);
    const links=[...new Map(linkResults.flatMap(result=>result.data??[]).map(link=>[link.member_id+':'+link.unit_id,link])).values()]
      .filter(link=>membership.has(link.member_id) && ['manager','finance','attendant'].includes(link.role));
    const byCompany=new Map(rows.map(company=>[company.id,company]));
    const visibleUnits=[...new Map(unitResults.flatMap(result=>result.data??[]).map(unit=>[unit.id,unit])).values()].filter(unit=>{
      const company=byCompany.get(unit.company_id);
      return company && (admin || company.owner_id===viewer.id
        || links.some(link=>link.unit_id===unit.id && membership.get(link.member_id)===company.id));
    });
    const units=visibleUnits.slice(0,1000);
    return {kind:'ready',canCreate:!admin,hasMore:hasMore || visibleUnits.length>1000,
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
