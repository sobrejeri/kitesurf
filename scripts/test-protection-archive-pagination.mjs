import assert from 'node:assert/strict';
import {
  ARCHIVE_MAX_PAGE, ARCHIVE_PAGE_SIZE, parseProtectionArchiveParams,
  protectionArchiveRange, protectionArchiveUrl,
} from '../src/lib/protection-archive-pagination.ts';

assert.equal(ARCHIVE_PAGE_SIZE,20);
const defaults=parseProtectionArchiveParams({});
assert.deepEqual(defaults,{
  codigo:'',codigoInvalido:false,ocorrenciasPagina:1,manifestacoesPagina:1,
});
const found=parseProtectionArchiveParams({
  codigo:' vnt-test-1003 ',ocPagina:'6',manPagina:'3',
});
assert.equal(found.codigo,'VNT-TEST-1003');
assert.equal(found.codigoInvalido,false);
assert.deepEqual(protectionArchiveRange(6),{from:100,to:119});
assert.equal(
  protectionArchiveUrl('aluno',found,'ocPagina',7),
  '/aluno/ocorrencias?codigo=VNT-TEST-1003&ocPagina=7&manPagina=3#arquivo-protege',
);
assert.equal(
  protectionArchiveUrl('admin',found,'manPagina',2),
  '/admin/ocorrencias?codigo=VNT-TEST-1003&ocPagina=6&manPagina=2#arquivo-protege',
);
for(const codigo of ['%','A,B','TEST;DROP','a/b','A?x=1','\tABC','ABC ','A'.repeat(41)]){
  const value=parseProtectionArchiveParams({codigo});
  if(codigo==='ABC ') {
    assert.equal(value.codigo,'ABC','Safe surrounding whitespace is normalized');
  } else {
    assert.equal(value.codigoInvalido,true,`Unsafe code is rejected: ${codigo}`);
    assert.equal(value.codigo,'','Unsafe codes must not enter any unfiltered search');
  }
}
assert.deepEqual(parseProtectionArchiveParams({
  codigo:['VNT-AAA','VNT-BBB'],ocPagina:['3','4'],manPagina:'-10',
}), defaults, 'Duplicate or manipulated query parameters are ignored');
for(const value of ['0','-1','1.2','1e3','99999999999','a','1001']){
  assert.equal(parseProtectionArchiveParams({ocPagina:value}).ocorrenciasPagina,1);
}
assert.equal(parseProtectionArchiveParams({
  ocPagina:String(ARCHIVE_MAX_PAGE),
}).ocorrenciasPagina,ARCHIVE_MAX_PAGE);
assert.throws(()=>protectionArchiveRange(ARCHIVE_MAX_PAGE+1),RangeError);
assert.throws(()=>protectionArchiveRange(Number.NaN),RangeError);
assert.throws(()=>protectionArchiveUrl('instrutor',found,'manPagina',0),RangeError);
console.log('PASS: exact booking search validation and independent bounded pagination');
