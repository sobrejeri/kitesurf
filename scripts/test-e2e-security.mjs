import assert from 'node:assert/strict';
import { validateBase, assertPageOrigin, secureContext, createRedactor, maskedScreenshot } from './e2e/security.mjs';
const base = 'https://synthetic.invalid';
assert.equal(validateBase(base+'/', ['synthetic.invalid']), base);
assert.equal(validateBase('http://localhost:3000', ['localhost']), 'http://localhost:3000');
for (const raw of ['http://synthetic.invalid', base+'/path', base+'?token=synthetic', base+'#fragment', 'https://user:synthetic@synthetic.invalid', 'https://other.invalid', 'file:///tmp/test', 'invalid']) {
  assert.throws(() => validateBase(raw, ['synthetic.invalid']));
}
assert.throws(() => assertPageOrigin({ url: ()=>'https://other.invalid/admin/verificacao' }, base));
assertPageOrigin({url:()=>base+'/admin/verificacao'}, base);

let handler; let contextOptions; let pageHandler;
const context = {on:(event,fn)=>{assert.equal(event,'page');pageHandler=fn;},route:async(pattern, fn)=>{assert.equal(pattern, '**/*');handler=fn;}};
await secureContext({newContext:async(options)=>{contextOptions=options;return context;}}, base, {serviceWorkers:'allow'});
assert.equal(contextOptions.serviceWorkers, 'block');
let frameHandler;let closedPages=0;
pageHandler({on:(event,fn)=>{assert.equal(event,'framenavigated');frameHandler=fn;},close:async()=>{closedPages++;}});
frameHandler({url:()=>base+'/aluno/aulas'});assert.equal(closedPages,0);
frameHandler({url:()=>'about:blank'});assert.equal(closedPages,0);
frameHandler({url:()=>'data:text/html,synthetic'});assert.equal(closedPages,1);
frameHandler({url:()=>'https://other.invalid/admin/verificacao'});assert.equal(closedPages,2);
function mockRoute(url, {navigation=true, method='GET', location, status=200, fail=false}={}) {
  const events=[];
  const response={headers:()=>({location}), status:()=>status};
  return {events, request:()=>({isNavigationRequest:()=>navigation,method:()=>method,url:()=>url}),
    abort:async()=>events.push('abort'), continue:async()=>events.push('continue'),
    fetch:async(options)=>{events.push(['fetch',options]);if(fail)throw Error('synthetic credential body');return response;},
    fulfill:async()=>events.push('fulfill')};
}
for(const url of ['https://other.invalid/admin/verificacao','http://synthetic.invalid/admin','https://synthetic.invalid.evil.invalid/']) {
  const route=mockRoute(url);await handler(route);assert.deepEqual(route.events,['abort']);
}
const redirect=mockRoute(base+'/login',{location:'https://other.invalid/collect',status:307});
await handler(redirect);assert.deepEqual(redirect.events,[['fetch',{maxRedirects:0,timeout:30_000}],'abort']);
const localRedirect=mockRoute(base+'/login',{location:'/admin/verificacao',status:303});
await handler(localRedirect);assert.equal(localRedirect.events.at(-1),'fulfill');
const externalResource=mockRoute('https://synthetic.supabase.co/storage/v1/object/private',{navigation:false});
await handler(externalResource);assert.deepEqual(externalResource.events,['continue']);
const externalPost=mockRoute('https://other.invalid/collect',{navigation:false,method:'POST'});
await handler(externalPost);assert.deepEqual(externalPost.events,['abort']);
const actionRedirect=mockRoute(base+'/admin/entrar',{navigation:false,method:'POST',location:'https://other.invalid/collect',status:307});
await handler(actionRedirect);assert.deepEqual(actionRedirect.events,[['fetch',{maxRedirects:0,timeout:30_000}],'abort']);
const failure=mockRoute(base+'/login',{fail:true});await handler(failure);assert.equal(failure.events.at(-1),'abort');

const secret='synthetic-password/&';const jwt='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.syntheticSignature';
const redactor=createRedactor({E2E_STUDENT_PASSWORD:secret,E2E_ADMIN_TOTP_SECRET:'SYNTHETICBASE32',E2E_STUDENT_EMAIL:'test@synthetic.invalid'});
redactor.addSecret('654321');
const clean=redactor.redact(`${secret} ${encodeURIComponent(secret)} SYNTHETICBASE32 test@synthetic.invalid ${jwt} Bearer opaqueSynthetic code=opaqueCode 654321 123456`);
for(const sensitive of [secret,encodeURIComponent(secret),'SYNTHETICBASE32','test@synthetic.invalid',jwt,'opaqueSynthetic','opaqueCode','654321','123456'])assert(!clean.includes(sensitive));
let screenshots=0;let screenshotOptions;
const page={url:()=>base+'/admin/verificacao',locator:selector=>({selector}),getByText:text=>({text}),screenshot:async options=>{screenshots++;screenshotOptions=options;}};
assert.equal(await maskedScreenshot(page,'ignored.png',base,redactor.values()),false);assert.equal(screenshots,0);
for(const path of ['/aluno/conta','/admin/configuracoes','/instrutor/perfil']){
  page.url=()=>base+path;assert.equal(await maskedScreenshot(page,'ignored.png',base,redactor.values()),false);
}
page.url=()=>base+'/aluno/aulas';await maskedScreenshot(page,'synthetic.png',base,redactor.values());
assert.equal(screenshots,1);assert(screenshotOptions.mask.some(mask=>mask.selector?.includes('input')));assert(screenshotOptions.mask.some(mask=>mask.text===secret));
page.url=()=>'https://other.invalid/aluno/aulas';await assert.rejects(maskedScreenshot(page,'ignored.png',base));assert.equal(screenshots,1);
console.log('PASS: E2E origins/redirects guarded before credentials, private diagnostics redacted, authentication screenshots skipped and inputs masked; mocks only.');
