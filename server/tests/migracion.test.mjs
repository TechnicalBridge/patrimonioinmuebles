// Una base que ya existia, con el esquema de la version 1 y sus datos, pasa a
// la version 2 sin perder nada. Es lo que le pasa al volumen de Docker de
// quien ya tenia Patrimonio andando.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PATRIMONIO_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-migracion-')), 'v1.db');
const { initDb, migrar, all, get, run, versionDeLaBase } = await import('../db.js');

before(async () => {
  //  Una base en la version 1, con un interesado, un arrendatario con su
  //  contrato, un cargo pagado por la plataforma y un lote enviado.
  await initDb({ hasta: 1, sembrar: false });
  run("INSERT INTO properties (titulo, tipo, operacion, precio, estatus) VALUES ('Depto', 'departamento', 'arriendo', 500000, 'arrendada')");
  run(`INSERT INTO clients (nombre, apellido, correo, telefono) VALUES ('Ana', 'Rios', 'ana@correo.cl', '+56911112222')`);
  run("INSERT INTO inquiries (client_id, mensaje) VALUES (1, 'Me interesa')");
  run(`INSERT INTO tenants (rut, nombre, correo) VALUES ('16482337-7', 'Felipe Rojas', 'felipe@correo.cl')`);
  run(`INSERT INTO leases (codigo, property_id, tenant_id, fecha_inicio, renta_monto) VALUES ('CTR-1', 1, 1, '2026-07-01', 500000)`);
  run(`INSERT INTO charges (lease_id, concepto, periodo, monto, fecha_vencimiento) VALUES (1, 'Arriendo julio', '2026-07', 500000, '2026-07-05')`);
  run(`INSERT INTO charges (lease_id, concepto, periodo, monto, fecha_vencimiento) VALUES (1, 'Arriendo agosto', '2026-08', 500000, '2026-08-05')`);
  run(`INSERT INTO charge_payments (charge_id, monto, medio, pagado_en, referencia) VALUES (1, 500000, 'databridge', '2026-07-20', 'pg_1')`);
  run(`INSERT INTO collection_batches (id_externo, fecha_corte, estado) VALUES ('PAT-1', '2026-08-18', 'enviado')`);
  run(`INSERT INTO collection_batch_items (batch_id, lease_id, monto_enviado, moneda) VALUES (1, 1, 500000, 'CLP')`);
  assert.equal(versionDeLaBase(), 1);

  migrar();
});

test('queda en la version 2, sin tabla de arrendatarios', () => {
  assert.equal(versionDeLaBase(), 2);
  assert.ok(!all("SELECT name FROM sqlite_master WHERE type='table'").some((t) => t.name === 'tenants'));
  assert.equal(get('PRAGMA foreign_keys').foreign_keys, 1);
});

test('el arrendatario pasa a ser un cliente con RUT, y su contrato lo sigue', () => {
  const felipe = get("SELECT * FROM clients WHERE rut = '16482337-7'");
  assert.equal(felipe.nombre, 'Felipe Rojas');
  assert.equal(get("SELECT client_id FROM leases WHERE codigo = 'CTR-1'").client_id, felipe.id);
  assert.equal(get('SELECT arrendatario, deuda FROM v_lease_debt').arrendatario, 'Felipe Rojas');
  assert.equal(get('SELECT deuda FROM v_lease_debt').deuda, 500000, 'julio pagado, agosto no');
});

test('el interesado sigue igual, con su consulta, y sin RUT', () => {
  const ana = get("SELECT * FROM clients WHERE correo = 'ana@correo.cl'");
  assert.equal(ana.id, 1, 'conserva su id: las consultas apuntan a el');
  assert.equal(ana.rut, null);
  assert.equal(get('SELECT client_id FROM inquiries').client_id, 1);
});

test('el pago de la plataforma queda como de la cobranza, y el lote se conserva', () => {
  assert.equal(get('SELECT medio FROM charge_payments').medio, 'cobranza');
  assert.equal(get('SELECT estado FROM collection_batches').estado, 'enviado');
  assert.equal(get('SELECT lease_id FROM collection_batch_items').lease_id, 1);
});

test('migrar otra vez no hace nada', () => {
  migrar();
  assert.equal(versionDeLaBase(), 2);
  assert.equal(get('SELECT COUNT(*) AS n FROM clients').n, 2);
});
