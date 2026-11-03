import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync('src/components/auth/area-auth.tsx', 'utf8');
const actions = readFileSync('src/app/actions/auth.ts', 'utf8');

const loginStart = component.indexOf('export function AreaLogin(');
const signupStart = component.indexOf('export function AreaSignup(');
assert.ok(loginStart >= 0 && signupStart > loginStart, 'Login and signup components must exist');

const login = component.slice(loginStart, signupStart);
const signup = component.slice(signupStart);

assert.ok(!login.includes('name="kiteLevel"'), 'Login must not request kite level');
assert.ok(login.includes('action={signIn}') && login.includes('name="email"') &&
  login.includes('name="password"'), 'Login still requires only e-mail and password');

assert.ok(signup.includes("{area === 'aluno' ? (") &&
  signup.includes('name="kiteLevel" required defaultValue=""') &&
  signup.includes('value="first_time"') && signup.includes('value="returning"') &&
  signup.includes('value="improving"'),
'All three levels should be mandatory only in student registration');

assert.ok(!signup.slice(signup.indexOf("export function AreaSignup"), signup.indexOf("export function AreaSignup")+200)
  .includes('kiteLevel'), 'Kite level should be part of student signup form, not an app-wide prop');

assert.ok(actions.includes("if (parsed.data.role === 'student' && !parsed.data.kiteLevel)") &&
  actions.includes('kite_level: parsed.data.kiteLevel'),
  'Server must validate the level on student signup and save it in user metadata');

const signInStart = actions.indexOf('export async function signIn(');
const signUpStart = actions.indexOf('export async function signUp(');
assert.ok(signInStart >= 0 && signUpStart > signInStart, 'Server auth actions must exist');
const signIn = actions.slice(signInStart, signUpStart);
assert.ok(!signIn.includes("form.get('kiteLevel')"),
  'Existing students must sign in without reselecting a level');

console.log('PASS: student level is required on signup and not requested on login');
