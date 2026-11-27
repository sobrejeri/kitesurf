// Executes the real server page with RLS/Auth mocks. No browser or remote writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {viewRange,localDayKey} from '../src/lib/instructor-agenda.ts';
import * as agenda from '../src/lib/instructor-agenda.ts';
const require=createRequire(import.meta.url);
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
let bookings=[],blocks=[],captured,queries=[],missingSchema=false,actionForms=0,timeOffForms=0;
const viewerId='00000000-0000-4000-8000-000000000001';
const box=({children})=>React.createElement('section',null,children);
const db={from(table){const q={table,filters:[]};queries.push(q);return {
  select(columns){q.columns=columns;return this;},eq(...args){q.filters.push(['eq',...args]);return this;},gte(){return this;},lt(){return this;},order(){return this;},
  async returns(){return {data:table==='instructor_time_off'?blocks:[],error:missingSchema&&['instructor_weekly_breaks','instructor_extra_hours'].includes(table)?{code:'42P01'}:missingSchema&&table==='instructor_time_off'&&q.columns?.includes('kind')?{code:'42703'}:null};},
  async maybeSingle(){return {data:{buffer_minutes:30},error:null};},
};}};
const dependencies={
  'next/link':{default:({children,href})=>React.createElement('a',{href},children)},
  '@/app/actions/availability':{unblockInstructorTime:async()=>{throw Error('No writes during review');}},
  '@/components/action-form':{ActionForm:props=>{actionForms++;return box(props);}},
  '@/components/instructor/agenda-calendar':{agendaHref:(day,view)=>`/instrutor/agenda?visao=${view}&dia=${day}`,AgendaCalendar:props=>{captured=props;return React.createElement('div');}},
  '@/components/instructor/time-off-form':{TimeOffForm:props=>{timeOffForms++;return box(props);}},
  '@/components/ui':{ButtonLink:box,Card:box,Field:box,Note:box,PageHeader:box,inputClass:''},
  '@/lib/auth':{requireRole:async roles=>{assert.deepEqual([...roles],['instructor']);return{id:viewerId};}},
  '@/lib/data':{listBookingsForInstructor:async id=>{assert.equal(id,viewerId);return bookings;}},
  '@/lib/format':{formatDateLong:value=>String(value),formatTime:value=>String(value)},
  '@/lib/instructor-agenda':agenda,
  '@/lib/supabase/server':{createSupabaseServerClient:async()=>db},
  'react/jsx-runtime':require('react/jsx-runtime'),
};
function loadPage(area){
  const exports={};
  const source=readFileSync(new URL(`../src/app/instrutor/(app)/${area}/page.tsx`,import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,Date,Map,Set,console,require:name=>{assert.ok(name in dependencies,'Unexpected import '+name);return dependencies[name];}});
  return exports.default;
}
const page=loadPage('agenda');
const iso=(stamp)=>new Date(stamp).toISOString();
for(const view of ['day','week','month']){
  const date='2026-12-01',range=viewRange(date,view);
  const first=Date.parse(range.startsAt),last=Date.parse(range.endsAt);
  const meeting=(id,at)=>({id,starts_at:at,minutes:30,status:'scheduled'});
  // Two meetings on the final local night, deliberately mixed ISO offsets.
  const earlier=iso(last-150*60_000); // 21:30 Fortaleza, following UTC date.
  const later=`${localDayKey(last-1)}T23:30:00-03:00`;
  bookings=[{status:'confirmed',created_at:iso(first),code:'VNT-TEST',student:{full_name:'Fixture'},beach:{name:'Preá'},booking_meetings:[
    meeting('later',later),meeting('earlier',earlier),meeting('before',iso(first-30*60_000)),meeting('after',iso(last)),
  ]}];
  blocks=[
    {id:'cross-end',starts_at:iso(last-90*60_000),ends_at:iso(last+60*60_000),kind:'block',reason:'Fixture'},
    {id:'before',starts_at:iso(first-120*60_000),ends_at:iso(first),kind:'block',reason:'Fixture'},
    {id:'after',starts_at:iso(last),ends_at:iso(last+60*60_000),kind:'block',reason:'Fixture'},
  ];
  captured=undefined;queries=[];
  renderToStaticMarkup(await page({searchParams:Promise.resolve({dia:date,visao:view})}));
  assert.ok(captured,'real page must render the calendar');
  assert.deepEqual([...captured.entries.map(x=>x.id)],['earlier','later'],view+': final local night retained, ordered by instant, range half-open');
  assert.deepEqual([...captured.off.map(x=>x.id)],['cross-end'],view+': crossing block retained, adjacent blocks excluded');
  for(const query of queries)assert.ok(query.filters.some(([kind,column,value])=>kind==='eq'&&column==='instructor_id'&&value===viewerId),'reads use authenticated instructor scope');
}
// Invalid URL dates fall back instead of throwing while rendering the page.
bookings=[];blocks=[];
for(const dia of ['2026-00-01','2026-13-01']){
  captured=undefined;
  renderToStaticMarkup(await page({searchParams:Promise.resolve({dia,visao:'day'})}));
  assert.equal(captured.date,localDayKey(Date.now()),'invalid month falls back to local today');
}
// The legacy tables can be readable while the v2 RPCs/columns are absent.
// Both pages must remain readable and hide all mutation controls in that case.
const availabilityPage=loadPage('disponibilidade');
db.rpc=async()=>({data:[],error:missingSchema?{code:'PGRST202'}:null});
for(const component of [()=>page({searchParams:Promise.resolve({dia:'2026-12-01',visao:'day'})}),availabilityPage]){
  missingSchema=false;actionForms=0;timeOffForms=0;
  renderToStaticMarkup(await component());
  assert.ok(actionForms+timeOffForms>0,'installed schema exposes mutation controls');
  missingSchema=true;actionForms=0;timeOffForms=0;
  const html=renderToStaticMarkup(await component());
  assert.equal(actionForms+timeOffForms,0,'missing v2 schema hides all mutation controls');
  assert.doesNotMatch(html,/migra|Supabase|\bSQL\b/i,'safe availability message has no installation instructions');
}
console.log('PASS: real instructor agenda pages Fortaleza day/week/month boundaries, mixed-offset chronology, overlap, owner scope, invalid dates and missing-schema write gates (RLS mocks)');
