/** Pure sandbox CSV exporter. Caller must authorize and filter records server-side. */
const dangerous = /^[\s\u0000-\u001f]*[=+@\-\t\r]/u;
export function safeCsvCell(value) {
  const raw = value == null ? '' : String(value);
  const neutralized = dangerous.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replaceAll('"', '""')}"`;
}
export function financeCsv(rows, columns) {
  if (!Array.isArray(rows) || !Array.isArray(columns) || columns.length === 0 || columns.some(c => !c || typeof c.key !== 'string' || typeof c.label !== 'string')) throw new TypeError('invalid_csv_schema');
  const output = [columns.map(c => safeCsvCell(c.label)).join(';')];
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new TypeError('invalid_csv_row');
    output.push(columns.map(c => safeCsvCell(Object.hasOwn(row, c.key) ? row[c.key] : '')).join(';'));
  }
  return '\uFEFF' + output.join('\r\n') + '\r\n';
}
