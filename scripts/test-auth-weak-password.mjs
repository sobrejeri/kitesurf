import assert from 'node:assert/strict';
import {friendlyError} from '../src/app/actions/errors.ts';
const expected='Escolha uma senha mais forte e diferente das que você já usa.';
const logged=[];
const original=console.error;
console.error=(...args)=>logged.push(args);
try {
  for(const message of [
    'Password is known to be weak and easy to guess.',
    'Password should be at least 8 characters.',
    'Provider wording changed: synthetic-private-marker',
    ''
  ]) {
    const result=friendlyError({code:'weak_password',message,
      hint:'synthetic-private-hint',details:'synthetic-private-details'});
    assert.equal(result,expected,'Auth code determines the safe Portuguese response');
    assert.doesNotMatch(result,/synthetic-private|provider|HIBP|Supabase/i);
  }
  assert.equal(logged.length,0,'expected weak-password rejection never logs provider details');
  assert.equal(friendlyError({code:'same_password',message:'New password should be different.'}),
    'Escolha uma senha diferente da senha atual.');
  assert.equal(friendlyError({message:'Invalid login credentials'}),
    'E-mail ou senha incorretos.');
  assert.equal(friendlyError({message:'Email not confirmed'}),
    'Confirme seu e-mail pelo link que enviamos antes de entrar.');
  assert.equal(logged.length,0);
  const unknown=friendlyError({code:'unexpected_case',message:'synthetic-private-marker'});
  assert.notEqual(unknown,expected,'unrelated errors are not classified as weak passwords');
  assert.doesNotMatch(unknown,/synthetic-private-marker/,'unknown provider text stays out of user response');
} finally {console.error=original;}
console.log('PASS: weak_password uses safe Portuguese guidance without raw details/logging; existing auth messages preserved');
