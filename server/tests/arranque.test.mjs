// Sin sus secretos el servidor no arranca: no hay valores de reemplazo, porque
// uno escrito en el codigo seria publico. Y dice cual falta.
import './entorno.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const arrancar = (sin) => {
  const env = { ...process.env, PORT: '0' };
  for (const variable of sin) delete env[variable];
  return spawnSync(process.execPath, ['index.js'], { cwd: path.join(import.meta.dirname, '..'), env, encoding: 'utf8', timeout: 20000 });
};

test('sin CIFRADO_LLAVE no arranca, y lo dice', () => {
  const r = arrancar(['CIFRADO_LLAVE']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Falta CIFRADO_LLAVE en el \.env/);
});

test('sin ADMIN_PASSWORD tampoco', () => {
  const r = arrancar(['ADMIN_PASSWORD']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Falta ADMIN_PASSWORD en el \.env/);
});
