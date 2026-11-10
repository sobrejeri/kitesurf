import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { progressBarShares } from '../src/lib/progress-bar.ts';

const cases = [
  [0, 0, 0, 0],
  [20, 30, 20, 30],
  [80, 40, 80, 20],
  [100, 50, 100, 0],
  [140, 8, 100, 0],
  [-10, 30, 0, 30],
  [20, -30, 20, 0],
  [Number.NaN, Number.POSITIVE_INFINITY, 0, 0],
  [Number.NEGATIVE_INFINITY, Number.NaN, 0, 0],
  [21.5, 23.25, 21.5, 23.25],
];
for (const [done, reserved, expectedDone, expectedReserved] of cases) {
  const result = progressBarShares(done, reserved);
  assert.deepEqual(result, { done: expectedDone, reserved: expectedReserved });
  assert.ok(result.done >= 0 && result.reserved >= 0 && result.done + result.reserved <= 100,
    'Progress segments must fit the track');
}

const ui = readFileSync('src/components/ui.tsx', 'utf8');
assert.match(ui, /progressBarShares\(donePercent, reservedPercent\)/,
  'The shared UI component must use the bounded percentages');
assert.match(ui, /aria-label=\{label\}/,
  'Each shared progress meter needs an accessible label');
assert.match(ui, /aria-valuenow=\{Math\.round\(done\)\}/,
  'Accessibility value must use normalized progress');
assert.match(ui, /aria-valuetext=\{\x60\$\{Math\.round\(done\)\}% concluído/,
  'Screen readers should distinguish completed from reserved hours');
assert.match(ui, /width: \x60\$\{done\}%\x60/,
  'Completed width must use normalized percentage');
assert.match(ui, /width: \x60\$\{reserved\}%\x60/,
  'Reserved width must use normalized percentage');

const inputClass = ui.match(/export const inputClass =\s*'([^']+)'/)?.[1] ?? '';
const textareaClass = ui.match(/export const textareaClass =\s*'([^']+)'/)?.[1] ?? '';
for (const [name, classes] of [['input', inputClass], ['textarea', textareaClass]]) {
  assert.match(classes, /text-base/,
    `${name} must retain >=16px phone font to prevent Safari auto-zoom`);
  assert.match(classes, /focus-visible:outline-2/,
    `${name} must expose visible keyboard focus`);
  assert.match(classes, /focus-visible:outline-offset-2/,
    `${name} must not hide the ring behind borders`);
  assert.match(classes, /focus-visible:outline-brand-focus/,
    `${name} ring must follow the existing theme color`);
  assert.doesNotMatch(classes, /focus:outline-none/,
    `${name} must not erase the keyboard ring`);
  assert.match(classes, /md:text-\[13px\]/,
    `${name} must preserve existing compact desktop typography`);
}
console.log('PASS: bounded lesson progress, accessible meter and visible mobile/desktop field focus');
