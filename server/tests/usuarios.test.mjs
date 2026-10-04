// Los usuarios del panel y sus sesiones, contra la base: la clave nunca en
// claro, el token solo por su huella, y sesiones que vencen y se cierran.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PATRIMONIO_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-usuarios-')), 'prueba.db');
process.env.ADMIN_CORREO = 'Jefa@Patrimonio.cl';
process.env.ADMIN_PASSWORD = 'una-clave-larga';
const { initDb, all, get, run } = await import('../db.js');
const { entrar, salir, usuarioDeLaSesion } = await import('../usuarios.js');

before(async () => { await initDb(); });

test('el primer usuario sale de las variables, con la clave guardada como huella', () => {
  const usuario = get('SELECT * FROM users');
  assert.equal(usuario.correo, 'jefa@patrimonio.cl');
  assert.match(usuario.clave_hash, /^scrypt\$/);
  assert.ok(!usuario.clave_hash.includes('una-clave-larga'));
});

test('entrar entrega un token que se guarda solo por su huella', () => {
  const { token, usuario } = entrar({ correo: 'JEFA@patrimonio.cl', clave: 'una-clave-larga' }, 'ip-1');
  assert.equal(usuario.correo, 'jefa@patrimonio.cl');
  assert.ok(!JSON.stringify(all('SELECT * FROM sessions')).includes(token));
  assert.equal(usuarioDeLaSesion(token).correo, 'jefa@patrimonio.cl');
});

test('una sesion vencida o cerrada deja de servir', () => {
  const vencida = entrar({ correo: 'jefa@patrimonio.cl', clave: 'una-clave-larga' }, 'ip-2').token;
  run("UPDATE sessions SET expira_en = '2000-01-01T00:00:00.000Z'");
  assert.equal(usuarioDeLaSesion(vencida), null);

  const cerrada = entrar({ correo: 'jefa@patrimonio.cl', clave: 'una-clave-larga' }, 'ip-2').token;
  salir(cerrada);
  assert.equal(usuarioDeLaSesion(cerrada), null);
});

test('cinco claves malas bloquean esa IP un rato, y solo esa', () => {
  for (let i = 0; i < 5; i++) {
    assert.throws(() => entrar({ correo: 'jefa@patrimonio.cl', clave: 'mala' }, 'ip-3'), { status: 401 });
  }
  assert.throws(() => entrar({ correo: 'jefa@patrimonio.cl', clave: 'una-clave-larga' }, 'ip-3'), { status: 429 });
  assert.ok(entrar({ correo: 'jefa@patrimonio.cl', clave: 'una-clave-larga' }, 'ip-4').token);
});

test('el bloqueo queda en la base, sin la IP a la vista, y un reinicio no lo levanta', () => {
  const filas = all('SELECT * FROM login_intentos WHERE bloqueada_hasta IS NOT NULL');
  assert.equal(filas.length, 1);
  assert.ok(!JSON.stringify(filas).includes('ip-3'));
  assert.ok(filas[0].bloqueada_hasta > new Date().toISOString());
});

test('un bloqueo vencido deja entrar, y entrar borra los fallos', () => {
  run("UPDATE login_intentos SET bloqueada_hasta = '2000-01-01T00:00:00.000Z'");
  assert.throws(() => entrar({ correo: 'jefa@patrimonio.cl', clave: 'mala' }, 'ip-3'), { status: 401 });
  assert.ok(entrar({ correo: 'jefa@patrimonio.cl', clave: 'una-clave-larga' }, 'ip-3').token);
  assert.equal(all('SELECT * FROM login_intentos').length, 0);
});

test('un usuario desactivado no entra, y sus sesiones dejan de servir', () => {
  const token = entrar({ correo: 'jefa@patrimonio.cl', clave: 'una-clave-larga' }, 'ip-5').token;
  run('UPDATE users SET activo = 0');
  assert.equal(usuarioDeLaSesion(token), null);
  assert.throws(() => entrar({ correo: 'jefa@patrimonio.cl', clave: 'una-clave-larga' }, 'ip-5'), { status: 401 });
});
