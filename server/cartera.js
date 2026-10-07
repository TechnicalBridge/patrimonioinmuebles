// Arma la cartera en el formato Cartera v1.
//
// El resto del sistema trabaja con clientes, contratos y cargos; aca eso se
// traduce a deudas, deudores y cargos del contrato de integracion
// (TB_web/docs/integracion/README.md §6).
//
// No manda nada: devuelve el objeto. Quien lo envie (cobranza.js) o lo
// descargue como archivo decide despues. Asi sirve con cualquier agencia que
// hable el contrato, contra una plataforma de pagos directo, o sin nadie.

import { all, get } from './db.js';
import { EMPRESA } from './empresa.js';

// Un cargo cuenta como moroso si vence ANTES de la fecha de corte. El que vence
// el mismo dia todavia no esta atrasado.
function cargosVencidos(leaseId, fechaCorte) {
  return all(
    `SELECT concepto, periodo, saldo, fecha_vencimiento
       FROM v_charge_balance
      WHERE lease_id = ? AND anulado_en IS NULL AND saldo > 0
        AND fecha_vencimiento < ?
      ORDER BY fecha_vencimiento, id`,
    [leaseId, fechaCorte]
  );
}

// Los montos en pesos viajan enteros y los en UF con dos decimales, porque asi
// lo exige el contrato (§5). Redondear aca evita que un 0.1 + 0.2 de punto
// flotante termine rechazado del otro lado.
function redondear(monto, moneda) {
  return moneda === 'CLP' ? Math.round(monto) : Math.round(monto * 100) / 100;
}

function deudor(contrato) {
  const datos = {
    rut: contrato.rut,
    tipo: contrato.tipo,
    nombre: [contrato.nombre, contrato.apellido].filter(Boolean).join(' '),
  };
  if (contrato.correo) datos.correo = contrato.correo;
  if (contrato.telefono) datos.telefono = contrato.telefono;
  return datos;
}

/**
 * La cartera a una fecha de corte: todos los clientes con contrato.
 *
 * Patrimonio no decide quien es moroso: entrega a cada cliente con lo que debe
 * a esa fecha, y el que esta al dia va con `cargos: []`. Lo detecta la
 * cobranza, que es la que sabe desde cuanta mora cobra. Asi tampoco hace falta
 * llevar la cuenta de a quien retirar: el que vino a pagar a la oficina sale al
 * dia, y la cobranza deja de cobrarle.
 *
 * Van los contratos vigentes y los terminados que todavia deben. Uno terminado
 * que ya pago va una vez mas, para que la cobranza lo cierre, y despues ya no.
 */
export function construirCartera({ fechaCorte, idExterno }) {
  const contratos = all(
    `SELECT l.id, l.codigo, l.concepto, l.moneda, l.estado, l.tasa_interes_mensual,
            c.rut, c.tipo, c.nombre, c.apellido, c.correo, c.telefono,
            p.direccion, p.comuna
       FROM leases l
       JOIN clients c ON c.id = l.client_id
       JOIN properties p ON p.id = l.property_id
      WHERE l.fecha_inicio < ?
      ORDER BY l.id`,
    [fechaCorte]
  );

  const deudas = [];
  for (const contrato of contratos) {
    const cargos = cargosVencidos(contrato.id, fechaCorte);
    if (contrato.estado === 'terminado' && !cargos.length && !seEntregoDebiendo(contrato.id)) continue;
    deudas.push({
      id_externo: contrato.codigo,
      deudor: deudor(contrato),
      moneda: contrato.moneda,
      concepto: contrato.concepto,
      referencias: {
        contrato: contrato.codigo,
        propiedad: `${contrato.direccion}, ${contrato.comuna}`,
      },
      ...(contrato.tasa_interes_mensual ? { tasa_interes_mensual: contrato.tasa_interes_mensual } : {}),
      cargos: cargos.map((c) => ({
        concepto: c.concepto,
        periodo: c.periodo,
        monto: redondear(c.saldo, contrato.moneda),
        fecha_vencimiento: c.fecha_vencimiento,
      })),
    });
  }

  return {
    version: '1.0',
    lote: {
      id_externo: idExterno,
      fecha_corte: fechaCorte,
      emitido_en: new Date().toISOString(),
      acreedor: {
        rut: EMPRESA.rut,
        razon_social: EMPRESA.razon_social,
        nombre_fantasia: EMPRESA.nombre_fantasia,
      },
    },
    deudas,
  };
}

/** Si la ultima entrega de este contrato lo informo debiendo: la cobranza todavia lo tiene abierto. */
function seEntregoDebiendo(leaseId) {
  const ultima = get(
    `SELECT i.monto_enviado
       FROM collection_batch_items i
       JOIN collection_batches b ON b.id = i.batch_id
      WHERE i.lease_id = ? AND b.estado <> 'borrador'
      ORDER BY b.fecha_corte DESC, b.id DESC LIMIT 1`,
    [leaseId]
  );
  return Boolean(ultima && ultima.monto_enviado > 0);
}

/** Nombre sugerido para el lote del dia: PAT-2026-09-18-01, -02, ... */
export function proponerIdDeLote(fechaCorte) {
  const delDia = all(
    'SELECT id_externo FROM collection_batches WHERE fecha_corte = ?',
    [fechaCorte]
  );
  return `PAT-${fechaCorte}-${String(delDia.length + 1).padStart(2, '0')}`;
}
