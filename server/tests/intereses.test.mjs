// El interes por mora que se pacta en el contrato: viaja en la cartera, y lo
// que la cobranza cobra de intereses llega aparte del capital. Corre sobre una
// base temporal sembrada desde cero.
//
//     npm test
import './entorno.mjs';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PATRIMONIO_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-intereses-')), 'prueba.db');

const { initDb, all, get, run } = await import('../db.js');
const { construirCartera } = await import('../cartera.js');
const { crearContrato, procesarEvento } = await import('../arriendos.js');

const deudaDe = (codigo) => get(
  `SELECT COALESCE(SUM(b.saldo), 0) AS deuda FROM v_charge_balance b JOIN leases l ON l.id = b.lease_id
    WHERE l.codigo = ? AND b.anulado_en IS NULL`, [codigo]).deuda;

before(async () => { await initDb(); });

test('el contrato con interes lo manda en la cartera, y el que no tiene, no', () => {
  const cartera = construirCartera({ fechaCorte: '2026-09-18', idExterno: 'PAT-INT-1' });
  const nandu = cartera.deudas.find((d) => d.id_externo === 'CTR-2024-007');
  const felipe = cartera.deudas.find((d) => d.id_externo === 'CTR-2025-014');

  assert.equal(nandu.tasa_interes_mensual, 1.5);
  assert.equal('tasa_interes_mensual' in felipe, false);
});

test('un contrato nuevo guarda su interes, y uno que no es un porcentaje no se firma', () => {
  run("INSERT INTO properties (titulo, tipo, operacion, precio, estatus) VALUES ('Bodega 9', 'bodega', 'arriendo', 200000, 'disponible')");
  const propiedad = get("SELECT id FROM properties WHERE titulo = 'Bodega 9'").id;
  const cliente = get("SELECT id FROM clients WHERE rut IS NOT NULL ORDER BY id LIMIT 1").id;
  const base = { client_id: cliente, property_id: propiedad, renta_monto: 200000, fecha_inicio: '2026-09-01' };

  for (const tasa of ['0', '-1', '1,555', 'uno']) {
    assert.throws(() => crearContrato({ ...base, tasa_interes_mensual: tasa }), /porcentaje mensual/, tasa);
  }
  const contrato = crearContrato({ ...base, tasa_interes_mensual: '1,5' });
  assert.equal(contrato.tasa_interes_mensual, 1.5);
});

test('con mora, el capital va a los cargos y el interes queda aparte', () => {
  const antes = deudaDe('CTR-2026-031');
  const resultado = procesarEvento({
    id: 'evt_mora_1', tipo: 'pago.confirmado',
    datos: { deuda_id_externo: 'CTR-2026-031', pago_id: '77', monto: antes + 6150, capital: antes, interes: 6150,
             moneda: 'CLP', pagado_en: '2026-09-20T10:00:00-03:00' },
  });

  assert.equal(deudaDe('CTR-2026-031'), 0, 'el capital salda los cargos, y la mora no abona nada mas');
  const intereses = all(`SELECT i.monto FROM lease_interest_payments i JOIN leases l ON l.id = i.lease_id
                          WHERE l.codigo = 'CTR-2026-031'`);
  assert.deepEqual(intereses.map((i) => i.monto), [6150]);
  assert.match(resultado.resultado, /6150 de intereses/);
});

test('el mismo pago avisado dos veces no registra el interes dos veces', () => {
  procesarEvento({
    id: 'evt_mora_2', tipo: 'pago.confirmado',
    datos: { deuda_id_externo: 'CTR-2026-031', pago_id: '77', monto: 416150, capital: 410000, interes: 6150,
             moneda: 'CLP', pagado_en: '2026-09-20T10:00:00-03:00' },
  });

  const n = get(`SELECT COUNT(*) AS n FROM lease_interest_payments i JOIN leases l ON l.id = i.lease_id
                  WHERE l.codigo = 'CTR-2026-031'`).n;
  assert.equal(n, 1);
});

test('el panel muestra la tasa y lo que se cobro de intereses', async () => {
  const { listarContratos } = await import('../arriendos.js');
  const contrato = listarContratos().find((c) => c.codigo === 'CTR-2026-031');
  assert.equal(contrato.intereses_cobrados, 6150);
  assert.equal(listarContratos().find((c) => c.codigo === 'CTR-2024-007').tasa_interes_mensual, 1.5);
});

test('con descuento por pronto pago, lo condonado queda junto a lo cobrado', async () => {
  const { listarContratos } = await import('../arriendos.js');
  const antes = deudaDe('CTR-2024-007');
  procesarEvento({
    id: 'evt_desc_1', tipo: 'pago.confirmado',
    datos: { deuda_id_externo: 'CTR-2024-007', pago_id: '91', monto: antes + 9400, capital: antes, interes: 9400,
             descuento: 9400, moneda: 'UF', pagado_en: '2026-10-08T10:00:00-03:00' },
  });

  assert.equal(deudaDe('CTR-2024-007'), 0, 'el capital salda los cargos');
  const fila = get(`SELECT i.monto, i.condonado FROM lease_interest_payments i JOIN leases l ON l.id = i.lease_id
                     WHERE l.codigo = 'CTR-2024-007'`);
  assert.deepEqual({ ...fila }, { monto: 9400, condonado: 9400 });
  const contrato = listarContratos().find((c) => c.codigo === 'CTR-2024-007');
  assert.equal(contrato.intereses_cobrados, 9400);
  assert.equal(contrato.intereses_condonados, 9400);
});

test('con toda la mora condonada, se guarda lo condonado aunque el interes cobrado sea $0', () => {
  run("INSERT INTO properties (titulo, tipo, operacion, precio, estatus) VALUES ('Bodega 10', 'bodega', 'arriendo', 300000, 'arrendada')");
  const propiedad = get("SELECT id FROM properties WHERE titulo = 'Bodega 10'").id;
  const cliente = get('SELECT id FROM clients WHERE rut IS NOT NULL ORDER BY id LIMIT 1').id;
  const contrato = crearContrato({ client_id: cliente, property_id: propiedad, renta_monto: 300000, fecha_inicio: '2026-07-01',
                                   tasa_interes_mensual: '2' });
  const debe = deudaDe(contrato.codigo);
  assert.ok(debe > 0, 'el contrato ya tiene cargos vencidos');

  const aviso = { id: 'evt_desc_2', tipo: 'pago.confirmado',
    datos: { deuda_id_externo: contrato.codigo, pago_id: '92', monto: debe, capital: debe, interes: 0,
             descuento: 18000, moneda: 'CLP', pagado_en: '2026-10-08T10:00:00-03:00' } };
  procesarEvento(aviso);
  procesarEvento({ ...aviso, id: 'evt_desc_2_otra_vez' });

  const filas = all('SELECT monto, condonado FROM lease_interest_payments WHERE lease_id = ?', [contrato.id]);
  assert.deepEqual(filas.map((f) => ({ ...f })), [{ monto: 0, condonado: 18000 }], 'una sola vez, aunque llegue dos');
  assert.equal(deudaDe(contrato.codigo), 0);
});

test('una fila sin interes cobrado ni condonado no se puede guardar', () => {
  const lease = get('SELECT id FROM leases ORDER BY id LIMIT 1').id;
  assert.throws(() => run(`INSERT INTO lease_interest_payments (lease_id, monto, condonado, pagado_en, referencia)
                            VALUES (?, 0, 0, '2026-10-08', 'vacia')`, [lease]), /CHECK/);
});

