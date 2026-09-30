// El modulo de arriendos contra la base: esquema, morosos, la cartera que se
// le entrega a la cobranza y los pagos. Corre sobre una base temporal
// sembrada desde cero, nunca sobre la de desarrollo.
//
//     npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEMPORAL = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-')), 'prueba.db');
process.env.PATRIMONIO_DB = TEMPORAL;

const { initDb, all, get, run, VERSION, versionDeLaBase } = await import('../db.js');
const { construirCartera, proponerIdDeLote } = await import('../cartera.js');

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'cartera-v1.patrimonio.json');
const CONTRATO = path.join(import.meta.dirname, '..', '..', '..', 'TB_web', 'docs', 'integracion',
  'ejemplos', 'cartera-v1.patrimonio.json');
const CORTE = '2026-09-18';

const falla = (sql, params = []) => { try { run(sql, params); return null; } catch (e) { return e.message; } };
const sinFecha = (c) => { const x = structuredClone(c); delete x.lote.emitido_en; return x; };
const idDe = (codigo) => get('SELECT id FROM leases WHERE codigo = ?', [codigo]).id;

before(async () => { await initDb(); });

test('crea las tablas y vistas, y queda en la ultima version', () => {
  const tablas = all("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
  for (const t of ['clients', 'leases', 'charges', 'charge_payments', 'collection_batches',
    'collection_batch_items', 'users', 'sessions', 'agency_connection']) {
    assert.ok(tablas.includes(t), `falta la tabla ${t}`);
  }
  assert.ok(!tablas.includes('tenants'), 'los arrendatarios son clientes: no hay tabla aparte');
  assert.equal(all("SELECT name FROM sqlite_master WHERE type='view'").length, 2);
  assert.equal(versionDeLaBase(), VERSION);
});

test('las llaves foraneas siguen encendidas despues de persistir', () => {
  // sql.js las apaga al exportar: si esto falla, las FK son decorativas.
  assert.equal(get('PRAGMA foreign_keys').foreign_keys, 1);
});

test('la base rechaza lo que el negocio no permite', () => {
  const felipe = get("SELECT client_id FROM leases WHERE codigo = 'CTR-2025-014'").client_id;
  assert.ok(falla('INSERT INTO leases (codigo, property_id, client_id, fecha_inicio, renta_monto) VALUES (?, 9999, ?, ?, ?)',
    ['X-1', felipe, '2026-01-01', 1000]), 'contrato sobre una propiedad que no existe');
  assert.ok(falla('INSERT INTO clients (rut, nombre, correo) VALUES (?, ?, ?)', ['16.482.337-7', 'Con puntos', 'x@y.cl']),
    'RUT con puntos');
  assert.ok(falla('INSERT INTO clients (rut, nombre) VALUES (?, ?)', ['11111111-1', 'Sin contacto']),
    'cliente sin correo ni telefono');
  assert.ok(falla('INSERT INTO charges (lease_id, concepto, periodo, monto, fecha_vencimiento) VALUES (1, ?, ?, ?, ?)',
    ['Arriendo septiembre', '2026-09', 1, '2026-09-05']), 'cargo repetido para el mismo periodo');
  assert.ok(falla('INSERT INTO charges (lease_id, concepto, periodo, monto, fecha_vencimiento) VALUES (1, ?, ?, ?, ?)',
    ['Multa', '2026-13', 1, '2026-09-05']), 'periodo 2026-13');
  assert.ok(falla('DELETE FROM properties WHERE id = (SELECT property_id FROM leases WHERE codigo = ?)', ['CTR-2025-014']),
    'borrar una propiedad con contrato vigente');
  assert.ok(falla("INSERT INTO charge_payments (charge_id, monto, medio, pagado_en) VALUES (1, 1, 'databridge', '2026-09-01')"),
    'el medio es la cobranza, sin nombrar a la plataforma');
});

test('un contrato exige un cliente con RUT, y un arrendatario no puede perderlo', () => {
  const interesado = get('SELECT id FROM clients WHERE rut IS NULL LIMIT 1').id;
  const propiedad = get("SELECT id FROM properties WHERE estatus = 'disponible' LIMIT 1").id;
  assert.match(falla('INSERT INTO leases (codigo, property_id, client_id, fecha_inicio, renta_monto) VALUES (?, ?, ?, ?, ?)',
    ['X-2', propiedad, interesado, '2026-09-01', 1000]), /necesita RUT/);
  assert.match(falla("UPDATE clients SET rut = NULL WHERE id = (SELECT client_id FROM leases WHERE codigo = 'CTR-2025-014')"),
    /no puede quedar sin RUT/);
});

test('calcula los morosos al corte', () => {
  const morosos = all(`SELECT codigo, deuda, cargos_impagos FROM v_lease_debt
                        WHERE vencimiento_mas_antiguo < ? ORDER BY lease_id`, [CORTE]);
  //  Los tres del ejemplo del contrato y los cinco clientes nuevos de la demo,
  //  incluido Ignacio, cuyo contrato termino debiendo.
  assert.equal(morosos.length, 8);
  assert.deepEqual([morosos[0].deuda, morosos[0].cargos_impagos], [1040000, 2]);
  assert.equal(morosos[2].deuda, 115.5, 'la deuda en UF conserva sus decimales');
  const alDia = all('SELECT codigo FROM leases WHERE id NOT IN (SELECT lease_id FROM v_lease_debt) ORDER BY id').map(r => r.codigo);
  assert.deepEqual(alDia, ['CTR-2025-022', 'CTR-2026-008']);
});

test('las deudas del ejemplo del contrato salen exactamente iguales en la cartera', () => {
  const generada = construirCartera({ fechaCorte: CORTE, idExterno: 'PAT-2026-09-18-01' });
  const ejemplo = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  //  La base tiene mas clientes que el ejemplo publicado: se comparan las
  //  deudas del ejemplo, que tienen que salir iguales y en el mismo orden.
  const delEjemplo = new Set(ejemplo.deudas.map(d => d.id_externo));
  const soloEjemplo = { ...generada, deudas: generada.deudas.filter(d => delEjemplo.has(d.id_externo)) };
  assert.deepEqual(sinFecha(soloEjemplo), sinFecha(ejemplo));
  assert.equal(proponerIdDeLote(CORTE), 'PAT-2026-09-18-01');
});

test('la cartera lleva a todos los clientes con contrato, deban o no', () => {
  const generada = construirCartera({ fechaCorte: CORTE, idExterno: 'PAT-2026-09-18-01' });
  assert.equal(generada.deudas.length, 10);
  assert.ok(!generada.deudas.some(d => d.accion), 'Patrimonio no retira: informa a todos y la cobranza decide');
  const sinCargos = generada.deudas.filter(d => !d.cargos.length).map(d => d.id_externo);
  assert.deepEqual(sinCargos, ['CTR-2025-022', 'CTR-2026-008'], 'Tomas y Josefa estan al dia');
  const ignacio = generada.deudas.find(d => d.id_externo === 'CTR-2025-027');
  assert.equal(ignacio.cargos.length, 3, 'un contrato terminado que debe se sigue informando');
});

test('un contrato terminado y pagado va una vez al dia, y despues ya no', () => {
  const ignacio = idDe('CTR-2025-027');
  for (const cargo of all('SELECT id, saldo FROM v_charge_balance WHERE lease_id = ? AND saldo > 0', [ignacio])) {
    run("INSERT INTO charge_payments (charge_id, monto, medio, pagado_en) VALUES (?, ?, 'transferencia', '2026-09-30')",
      [cargo.id, cargo.saldo]);
  }
  //  La entrega de agosto lo informo debiendo: la cobranza todavia lo tiene abierto.
  const unaVez = construirCartera({ fechaCorte: '2026-10-18', idExterno: 'PAT-X-1' });
  assert.deepEqual(unaVez.deudas.find(d => d.id_externo === 'CTR-2025-027').cargos, []);

  const lote = run("INSERT INTO collection_batches (id_externo, fecha_corte, estado) VALUES ('PAT-X-1', '2026-10-18', 'aceptado')");
  run("INSERT INTO collection_batch_items (batch_id, lease_id, monto_enviado, moneda) VALUES (?, ?, 0, 'CLP')", [lote, ignacio]);
  const despues = construirCartera({ fechaCorte: '2026-11-18', idExterno: 'PAT-X-2' });
  assert.ok(!despues.deudas.some(d => d.id_externo === 'CTR-2025-027'));
});

test('la copia del contrato esta al dia', { skip: !fs.existsSync(CONTRATO) && 'TB_web no esta al lado' }, () => {
  // El fixture es una copia para que este repo se pruebe solo. Si el contrato
  // cambia en TB_web, esto avisa.
  assert.deepEqual(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')), JSON.parse(fs.readFileSync(CONTRATO, 'utf8')));
});

test('un pago saca la deuda de la cartera, y el mismo pago no abona dos veces', () => {
  const cargo = get("SELECT id FROM charges WHERE lease_id = ? AND periodo = '2026-09'", [idDe('CTR-2026-031')]);
  run('INSERT INTO charge_payments (charge_id, monto, medio, pagado_en, referencia) VALUES (?, ?, ?, ?, ?)',
    [cargo.id, 410000, 'cobranza', '2026-09-19', 'pago_abc123']);
  const despues = construirCartera({ fechaCorte: CORTE, idExterno: 'PAT-2026-09-18-02' });
  assert.deepEqual(despues.deudas.find(d => d.id_externo === 'CTR-2026-031').cargos, []);
  assert.ok(falla('INSERT INTO charge_payments (charge_id, monto, medio, pagado_en, referencia) VALUES (?, ?, ?, ?, ?)',
    [cargo.id, 410000, 'cobranza', '2026-09-19', 'pago_abc123']), 'la referencia repetida se rechaza');
});
