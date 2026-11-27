import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const requireNode=createRequire(import.meta.url);
const ids=Array.from({length:20},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const [user,otherUser,admin,c1,c2,c3,c4,m1,m2,m3,u1,u2,u3,u4]=ids;
let viewer={id:user,role:'student',secondFactor:false},clients=0,viewerReads=0,queries=[];
let failedTable=null;
let fixtures={
  companies:[{id:c1,owner_id:user,trade_name:'Own company',status:'active'},
    {id:c2,owner_id:otherUser,trade_name:'Membership company',status:'active'},
    {id:c3,owner_id:otherUser,trade_name:'Foreign company',status:'active'},
    {id:c4,owner_id:otherUser,trade_name:'Suspended membership company',status:'active'}],
  company_members:[{id:m1,company_id:c2,user_id:user,status:'active'},
    {id:m2,company_id:c4,user_id:user,status:'suspended'},
    {id:m3,company_id:c3,user_id:otherUser,status:'active'}],
  company_member_units:[{member_id:m1,unit_id:u2,role:'attendant'},
    {member_id:m3,unit_id:u3,role:'manager'},{member_id:m1,unit_id:u4,role:'finance'}],
  company_units:[{id:u1,company_id:c1,name:'Owner unit',city:'Preá',active:true},
    {id:u2,company_id:c2,name:'Assigned unit',city:'Jeri',active:true},
    {id:u3,company_id:c2,name:'Unassigned unit',city:'Jeri',active:true},
    {id:u4,company_id:c3,name:'Foreign unit',city:'Jeri',active:true}],
};
const savedFixtures=structuredClone(fixtures);
const database={from(table){
  const query={table,columns:null,filters:[]};queries.push(query);
  return {select(columns){query.columns=columns;return this;},eq(...args){query.filters.push(['eq',...args]);return this;},
    in(...args){query.filters.push(['in',...args]);return this;},order(){return this;},limit(n){query.limit=n;return this;},
    async returns(){return {data:fixtures[table],error:failedTable===table?{code:'42P01',message:'internal schema details'}:null};}};
}};
function load(path,dependencies){const exports={};
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,process,Set,Map,require(name){if(name in dependencies)return dependencies[name];throw Error('Unexpected import '+name);}});return exports;
}
const feature=load('../src/lib/business/core-feature.ts',{});
const auth={async getViewer(){viewerReads++;return viewer;}};
const supabase={async createSupabaseServerClient(){clients++;return database;}};
const {readCompanyWorkspace:read}=load('../src/lib/business/core-data.ts',{'server-only':{},'@/lib/auth':auth,'@/lib/supabase/server':supabase,'./core-feature':feature});
const previousFlag=process.env.NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED;
try{
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED='false';
  assert.equal((await read()).kind,'disabled');assert.equal(clients,0);assert.equal(viewerReads,0);
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED='true';
  viewer=null;assert.equal((await read()).kind,'unauthenticated');assert.equal(clients,0);
  viewer={id:admin,role:'admin',secondFactor:false};assert.equal((await read()).kind,'denied');assert.equal(clients,0);
  viewer={id:user,role:'student',secondFactor:false};
  let result=await read();
  assert.equal(result.kind,'ready');assert.equal(result.canCreate,true);
  assert.deepEqual(result.companies.map(x=>x.id),[c1,c2]);
  assert.deepEqual(result.companies.map(x=>x.access),['owner','member']);
  assert.deepEqual(result.companies.flatMap(x=>x.units.map(unit=>unit.id)),[u1,u2]);
  assert.equal(result.companies[1].units[0].role,'attendant');
  assert.ok(!JSON.stringify(result).includes(otherUser),'minimal DTO removes owner/account IDs');
  assert.deepEqual(queries.find(q=>q.table==='company_members').filters,[['eq','user_id',user],['eq','status','active']]);
  assert.deepEqual(queries.find(q=>q.table==='company_member_units').filters,[['in','member_id',[m1]]]);
  assert.deepEqual(queries.find(q=>q.table==='company_units').filters,[['in','company_id',[c1,c2]]]);
  assert.ok(!queries.some(q=>q.columns==='*'));
  for(const role of ['instructor','partner']){viewer={id:user,role,secondFactor:false};assert.equal((await read()).companies[0].access,'owner');}
  viewer={id:admin,role:'admin',secondFactor:true};result=await read();
  assert.equal(result.canCreate,false);assert.equal(result.companies.length,4);assert.ok(result.companies.every(x=>x.access==='admin'));
  viewer={id:user,role:'student',secondFactor:false};
  for(const table of Object.keys(fixtures)){failedTable=table;result=await read();assert.equal(result.kind,'unavailable');assert.ok(!JSON.stringify(result).includes('internal'));}
  failedTable=null;
  fixtures.companies=Array.from({length:201},(_,i)=>({id:'company-'+i,owner_id:user,trade_name:'Name',status:'active'}));
  result=await read();assert.equal(result.companies.length,200);assert.equal(result.hasMore,true);
  fixtures=structuredClone(savedFixtures);

  // Execute the real action; unsupported fields are rejected, not silently saved.
  const tax=load('../src/lib/tax-id.ts',{});let rpcCalls=[],revalidations=[],rpcError=null,persistedOverride;
  const input={legalName:'Empresa Teste LTDA',tradeName:'Escola Teste',cnpj:'11.222.333/0001-81'};
  const form=(extra={})=>{const f=new FormData();for(const [key,value]of Object.entries({...input,...extra}))f.set(key,value);return f;};
  const actionDb={async rpc(name,args){rpcCalls.push({name,args});return {data:c1,error:rpcError};},from(table){assert.equal(table,'companies');return{
    select(columns){assert.equal(columns,'id,owner_id,legal_name,trade_name,cnpj,status');return this;},eq(column,value){assert.equal(value,column==='id'?c1:user);return this;},
    async maybeSingle(){return{data:persistedOverride===undefined?{id:c1,owner_id:user,legal_name:input.legalName,trade_name:input.tradeName,cnpj:'11222333000181',status:'pending'}:persistedOverride,error:null};}};}};
  const {createBusinessCompany:create}=load('../src/app/actions/business-company.ts',{
    'next/cache':{revalidatePath(path){revalidations.push(path);}},zod:requireNode('zod'),'@/lib/auth':auth,
    '@/lib/business/core-feature':feature,'@/lib/tax-id':tax,'@/lib/supabase/server':{async createSupabaseServerClient(){clients++;return actionDb;}},
  });
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED='false';const beforeClients=clients;
  assert.ok((await create({},form())).error);assert.equal(clients,beforeClients);
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED='true';
  viewer={id:admin,role:'admin',secondFactor:true};assert.ok((await create({},form())).error);assert.equal(clients,beforeClients);
  viewer={id:user,role:'student',secondFactor:false};
  for(const extra of [{owner_id:otherUser},{status:'active'},{role:'owner'},{phone:'88999990000'},{terms:'yes'},{city:'Preá'},
    {legalName:'x'},{tradeName:'x'},{cnpj:'123'}])assert.ok((await create({},form(extra))).error);
  const duplicate=form();duplicate.append('tradeName','Other name');assert.ok((await create({},duplicate)).error);
  assert.equal(rpcCalls.length,0);
  assert.ok((await create({},form())).ok);
  assert.equal(rpcCalls[0].name,'create_company');
  assert.deepEqual(Object.keys(rpcCalls[0].args).sort(),['p_cnpj','p_legal_name','p_trade_name']);
  assert.equal(rpcCalls[0].args.p_cnpj,'11222333000181');assert.equal(revalidations.length,4);
  rpcError={code:'PGRST202'};assert.ok((await create({},form())).error);rpcError=null;
  for(const value of [null,{id:c1,owner_id:otherUser},{id:c1,owner_id:user,legal_name:'Wrong',trade_name:input.tradeName,cnpj:'11222333000181'}]){
    persistedOverride=value;assert.ok((await create({},form())).error);
  }
  assert.equal(revalidations.length,4,'only verified persistence can report success');

  // Real server component: unavailable/unauthorized cannot show a create form.
  const React=requireNode('react'),{renderToStaticMarkup}=requireNode('react-dom/server');let response={kind:'unavailable'};
  const box=({children})=>React.createElement('section',null,children);
  const {BusinessCompanyWorkspace:Panel}=load('../src/components/business/company-workspace.tsx',{
    '@/app/actions/business-company':{createBusinessCompany:create},'@/components/action-form':{ActionForm:({children})=>React.createElement('form',null,children)},
    '@/components/ui':{Card:box,Field:box,Note:box,inputClass:''},'@/lib/business/core-data':{readCompanyWorkspace:async()=>response},'react/jsx-runtime':requireNode('react/jsx-runtime'),
  });
  for(const kind of ['disabled','unavailable','unauthenticated','denied']){response={kind};assert.doesNotMatch(renderToStaticMarkup(await Panel()),/<form/);}
  response={kind:'ready',companies:[],canCreate:true,hasMore:false};let html=renderToStaticMarkup(await Panel());
  assert.match(html,/name="legalName"/);assert.match(html,/name="tradeName"/);assert.match(html,/name="cnpj"/);
  assert.doesNotMatch(html,/name="(?:owner|phone|email|terms|city|status)"/);
  response={...response,canCreate:false,companies:[{id:c1,name:'<script>bad()</script>',status:'pending',access:'admin',units:[]}]};
  html=renderToStaticMarkup(await Panel());assert.doesNotMatch(html,/<form|<script>/);assert.match(html,/&lt;script&gt;/);
  console.log('PASS: real Business DAL owner/member unit isolation, Admin AAL2, feature/schema gates, three-field creation and verified persistence (RLS mocks; no remote writes)');
}finally{if(previousFlag===undefined)delete process.env.NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED;else process.env.NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED=previousFlag;}
