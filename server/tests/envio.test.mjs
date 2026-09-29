// Enviarle el lote a la agencia: el servidor de verdad sobre una base temporal,
// y una agencia falsa que anota lo que recibe y contesta como APOFYX.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const PUERTO = 4000 + Math.floor(Math.random() * 90);
const B = `http://localhost:${PUERTO}/api`;
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
const post = (ruta, body) => j(ruta, { method: 'POST', body: JSON.stringify(body) });

/** Como contesta APOFYX: acepta todo menos a Valentina, que debe un solo mes. */
function responder(cartera) {
  const resultados = cartera.deudas.map((d) => {
    if (d.accion === 'retirar') return { id_externo: d.id_externo, resultado: 'retirada' };
    if (d.id_externo === 'CTR-2026-031') {
      return { id_externo: d.id_externo, resultado: 'rechazada',
        errores: [{ campo: 'cargos', codigo: 'bajo_umbral_mora', mensaje: 'Tiene 1 mes impago' }] };
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
      recibido.push({ ruta: req.url, clave: req.headers.authorization, cuerpo: JSON.parse(cuerpo) });
      res.writeHead(caida ? 503 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(caida ? { error: { codigo: 'mantencion', mensaje: 'En mantencion' } }
        : responder(JSON.parse(cuerpo))));
    });
  });
  await new Promise((listo) => agencia.listen(0, '127.0.0.1', listo));

  const base = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-envio-')), 'prueba.db');
  servidor = spawn(process.execPath, ['index.js'], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PUERTO), PATRIMONIO_DB: base,
      COBRANZA_URL: `http://127.0.0.1:${agencia.address().port}/`, COBRANZA_CLAVE: 'apx_prueba' },
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('el servidor no arranco')), 20000);
    servidor.stdout.on('data', (d) => { if (String(d).includes('API en')) { clearTimeout(t); resolve(); } });
  });
  H = { Authorization: `Bearer ${(await post('/admin/login', { password: 'patrimonio' })).body.token}` };
});

after(() => {
  servidor?.kill();
  agencia?.close();
});

test('con la agencia configurada, el panel ofrece enviarle la cartera', async () => {
  assert.deepEqual((await j('/admin/arriendos/cobranza')).body, { agencia: 'APOFYX', configurada: true });
});

test('enviar un lote se lo entrega a la agencia y guarda su respuesta contrato por contrato', async () => {
  const emitido = (await post('/admin/arriendos/lotes', { corte: '2026-09-18' })).body;

  const enviado = await post(`/admin/arriendos/lotes/${emitido.lote.id}/envio`, {});

  assert.equal(enviado.status, 200);
  const pedido = recibido.at(-1);
  assert.equal(pedido.ruta, '/api/v1/carteras');
  assert.equal(pedido.clave, 'Bearer apx_prueba');
  assert.deepEqual(pedido.cuerpo, emitido.cartera, 'va la cartera tal como se emitio');
  assert.equal(enviado.body.estado, 'enviado', 'con una rechazada no queda como aceptado');
  assert.deepEqual([enviado.body.respuesta.aceptadas, enviado.body.respuesta.recibidas], [7, 8]);
  assert.deepEqual(enviado.body.respuesta.rechazos, [{ id_externo: 'CTR-2026-031', motivo: 'Tiene 1 mes impago' }]);
  const resultado = Object.fromEntries(enviado.body.items.map((i) => [i.codigo, i.resultado]));
  assert.equal(resultado['CTR-2026-031'], 'rechazada');
  assert.equal(resultado['CTR-2025-014'], 'registrada');
  assert.equal(resultado['CTR-2025-022'], 'retirada');

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

test('un retiro solo va por una deuda que la agencia recibio', async () => {
  //  La agencia rechazo a Valentina. Si despues paga en la oficina, no hay nada
  //  que retirarle: nunca estuvo en cobranza.
  const valentina = (await j('/admin/arriendos/contratos')).body.find((c) => c.codigo === 'CTR-2026-031');
  const cargos = (await j(`/admin/arriendos/contratos/${valentina.id}/cargos`)).body;
  for (const cargo of cargos.filter((c) => c.saldo > 0)) {
    await post('/admin/arriendos/pagos', { charge_id: cargo.id, monto: cargo.saldo, pagado_en: '2026-10-20' });
  }

  const cartera = (await j('/admin/arriendos/cartera?corte=2026-11-18')).body;

  assert.equal(cartera.deudas.find((d) => d.id_externo === 'CTR-2026-031'), undefined);
});
