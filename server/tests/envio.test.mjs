// La cobranza: conectarse a una agencia desde el panel y entregarle el lote.
// El servidor de verdad sobre una base temporal, y una agencia falsa que habla
// el contrato de integracion y anota lo que recibe.
import { CLAVE_ADMIN } from './entorno.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const PUERTO = 4000 + Math.floor(Math.random() * 90);
const B = `http://localhost:${PUERTO}/api`;
const SECRETO = 'whsec_prueba';
let servidor;
let agencia;
let H = {};
const recibido = [];
let caida = false;

async function j(ruta, opts = {}) {
  const r = await fetch(B + ruta, { ...opts, headers: { 'Content-Type': 'application/json', ...H, ...(opts.headers || {}) } });
  const texto = await r.text();
  try { return { status: r.status, body: JSON.parse(texto) }; } catch { return { status: r.status, body: texto }; }
}
const post = (ruta, body, headers) => j(ruta, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });
const urlAgencia = () => `http://127.0.0.1:${agencia.address().port}`;
const conectar = (clave = 'apx_prueba') => post('/admin/cobranza/conexion',
  { url: urlAgencia(), clave, url_avisos: `${B}/eventos` });

/**
 * Como contesta la agencia: acepta todo menos a Valentina, que debe un solo
 * mes, y al que esta al dia le responde al_dia.
 */
function responder(cartera) {
  const resultados = cartera.deudas.map((d) => {
    if (!d.cargos.length) return { id_externo: d.id_externo, resultado: 'al_dia' };
    if (d.id_externo === 'CTR-2026-031') {
      return { id_externo: d.id_externo, resultado: 'rechazada',
        errores: [{ campo: 'cargos', codigo: 'bajo_umbral_mora', mensaje: 'Tiene 13 dias de mora' }] };
    }
    return { id_externo: d.id_externo, resultado: 'registrada', mora_dias: 44, tramo: '31-90' };
  });
  const rechazadas = resultados.filter((r) => r.resultado === 'rechazada').length;
  return { lote: cartera.lote.id_externo, repetido: false, recibidas: resultados.length,
    aceptadas: resultados.length - rechazadas, rechazadas, resultados, campos_ignorados: [] };
}

before(async () => {
  agencia = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (d) => { cuerpo += d; });
    req.on('end', () => {
      recibido.push({ ruta: req.url, clave: req.headers.authorization, cuerpo: cuerpo ? JSON.parse(cuerpo) : null });
      const responde = (status, datos) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(datos));
      };
      if (caida) return responde(503, { error: { codigo: 'mantencion', mensaje: 'En mantencion' } });
      if (!['Bearer apx_prueba', 'Bearer apx_ajena'].includes(req.headers.authorization)) {
        return responde(401, { error: { codigo: 'no_autorizado', mensaje: 'Clave de API invalida' } });
      }
      if (req.url === '/api/v1/cuenta') {
        const ajena = req.headers.authorization === 'Bearer apx_ajena';
        return responde(200, { rut: ajena ? '76543210-3' : '76418902-7', nombre: ajena ? 'Otra Empresa' : 'Patrimonio Inmuebles',
          tipo: 'acreedor', receptor: { rut: '77305118-6', nombre: 'APOFYX' } });
      }
      if (req.url === '/api/v1/suscripciones') return responde(200, { url: 'x', eventos: 'todos', secreto: SECRETO });
      return responde(200, responder(JSON.parse(cuerpo)));
    });
  });
  await new Promise((listo) => agencia.listen(0, '127.0.0.1', listo));

  const base = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-envio-')), 'prueba.db');
  servidor = spawn(process.execPath, ['index.js'], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PUERTO), PATRIMONIO_DB: base, ADMIN_CORREO: '', ADMIN_PASSWORD: CLAVE_ADMIN },
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('el servidor no arranco')), 20000);
    servidor.stdout.on('data', (d) => { if (String(d).includes('API en')) { clearTimeout(t); resolve(); } });
  });
  const sesion = await post('/admin/login', { correo: 'admin@patrimonioinmuebles.cl', clave: CLAVE_ADMIN });
  H = { Authorization: `Bearer ${sesion.body.token}` };
});

after(() => {
  servidor?.kill();
  agencia?.close();
});

test('sin agencia conectada, el lote no se envia y los avisos estan apagados', async () => {
  assert.deepEqual((await j('/admin/cobranza')).body, { conectada: false, en_docker: false });
  const emitido = (await post('/admin/arriendos/lotes', { corte: '2026-08-25' })).body;
  const envio = await post(`/admin/arriendos/lotes/${emitido.lote.id}/envio`, {});
  assert.equal(envio.status, 409);
  assert.match(envio.body.error, /No hay una agencia conectada/);
  assert.equal((await post('/eventos', '{}')).status, 503);
});

test('una clave de otra empresa no conecta, y una mala tampoco', async () => {
  const ajena = await conectar('apx_ajena');
  assert.equal(ajena.status, 409);
  assert.match(ajena.body.error, /es de Otra Empresa/);
  const mala = await conectar('apx_inventada');
  assert.equal(mala.status, 401);
  assert.deepEqual((await j('/admin/cobranza')).body, { conectada: false, en_docker: false });
});

test('conectar comprueba la clave, se suscribe a los avisos y toma el nombre de la agencia', async () => {
  const conectado = await conectar();
  assert.equal(conectado.status, 200, JSON.stringify(conectado.body));
  assert.equal(conectado.body.agencia, 'APOFYX', 'el nombre lo dice la agencia, no el codigo de Patrimonio');
  assert.equal(conectado.body.avisos, true);
  const suscripcion = recibido.find((r) => r.ruta === '/api/v1/suscripciones');
  assert.deepEqual(suscripcion.cuerpo, { url: `${B}/eventos` });
  assert.ok(!JSON.stringify((await j('/admin/cobranza')).body).includes('apx_prueba'), 'la clave no vuelve al panel');
});

test('enviar un lote se lo entrega a la agencia y guarda su respuesta contrato por contrato', async () => {
  const emitido = (await post('/admin/arriendos/lotes', { corte: '2026-09-18' })).body;

  const enviado = await post(`/admin/arriendos/lotes/${emitido.lote.id}/envio`, {});

  assert.equal(enviado.status, 200, JSON.stringify(enviado.body));
  const pedido = recibido.at(-1);
  assert.equal(pedido.ruta, '/api/v1/carteras');
  assert.equal(pedido.clave, 'Bearer apx_prueba');
  assert.deepEqual(pedido.cuerpo, emitido.cartera, 'va la cartera tal como se emitio');
  assert.equal(enviado.body.estado, 'parcial', 'con una rechazada queda como parcial');
  assert.deepEqual([enviado.body.respuesta.aceptadas, enviado.body.respuesta.recibidas], [9, 10]);
  assert.deepEqual(enviado.body.respuesta.rechazos, [{ id_externo: 'CTR-2026-031', motivo: 'Tiene 13 dias de mora' }]);
  const resultado = Object.fromEntries(enviado.body.items.map((i) => [i.codigo, i.resultado]));
  assert.equal(resultado['CTR-2026-031'], 'rechazada');
  assert.equal(resultado['CTR-2025-014'], 'registrada');
  assert.equal(resultado['CTR-2025-022'], 'al_dia', 'Tomas se puso al dia: va sin cargos');

  const archivo = await (await fetch(`${B}/admin/arriendos/lotes/${emitido.lote.id}/archivo`, { headers: H })).json();
  assert.deepEqual(archivo, pedido.cuerpo, 'la descarga es la misma cartera que se envio');
  assert.equal((await post(`/admin/arriendos/lotes/${emitido.lote.id}/envio`, {})).status, 409, 'no se envia dos veces');
});

test('si la agencia no responde bien, el lote queda en borrador y el reintento manda lo mismo', async () => {
  const emitido = (await post('/admin/arriendos/lotes', { corte: '2026-10-18' })).body;
  caida = true;

  const fallo = await post(`/admin/arriendos/lotes/${emitido.lote.id}/envio`, {});

  assert.equal(fallo.status, 502);
  assert.match(fallo.body.error, /En mantencion/);
  const lote = (await j('/admin/arriendos/lotes')).body.find((l) => l.id === emitido.lote.id);
  assert.equal(lote.estado, 'borrador');

  caida = false;
  assert.equal((await post(`/admin/arriendos/lotes/${emitido.lote.id}/envio`, {})).status, 200);
  assert.deepEqual(recibido.at(-1).cuerpo, recibido.at(-2).cuerpo);
});

test('los avisos se verifican con el secreto que entrego la agencia', async () => {
  const cuerpo = JSON.stringify({ id: 'evt_1', tipo: 'deuda.saldada', datos: { deuda_id_externo: 'CTR-2025-014' } });
  const marca = Math.floor(Date.now() / 1000);
  const firma = (secreto) => ({ 'X-Timestamp': String(marca),
    'X-Firma': 'v1=' + crypto.createHmac('sha256', secreto).update(`${marca}.${cuerpo}`).digest('hex') });
  assert.equal((await post('/eventos', cuerpo, firma('otro'))).status, 401);
  assert.equal((await post('/eventos', cuerpo, firma(SECRETO))).status, 200);
});

test('el que pago en la oficina sigue en la cartera, al dia y sin cargos', async () => {
  const valentina = (await j('/admin/arriendos/contratos')).body.find((c) => c.codigo === 'CTR-2026-031');
  const cargos = (await j(`/admin/arriendos/contratos/${valentina.id}/cargos`)).body;
  for (const cargo of cargos.filter((c) => c.saldo > 0)) {
    await post('/admin/arriendos/pagos', { charge_id: cargo.id, monto: cargo.saldo, pagado_en: '2026-10-20' });
  }

  const cartera = (await j('/admin/arriendos/cartera?corte=2026-11-18')).body;

  assert.deepEqual(cartera.deudas.find((d) => d.id_externo === 'CTR-2026-031').cargos, []);
});

test('desconectar apaga el envio y los avisos', async () => {
  assert.deepEqual((await j('/admin/cobranza/conexion', { method: 'DELETE' })).body, { conectada: false, en_docker: false });
  assert.equal((await post('/eventos', '{}')).status, 503);
});

test('si la agencia no responde en localhost, el error dice que poner', async () => {
  const r = await post('/admin/cobranza/conexion', { url: 'http://localhost:9', clave: 'apx_prueba', url_avisos: `${B}/eventos` });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /no respondió en http:\/\/localhost:9/);
  assert.match(r.body.error, /host\.docker\.internal:9/);
});

test('otra pagina no recibe permiso de CORS para usar la API', async () => {
  const r = await fetch(`${B}/properties`, { headers: { Origin: 'https://otra-pagina.example' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});
