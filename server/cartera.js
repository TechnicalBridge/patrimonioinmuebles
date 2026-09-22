// Arma la cartera morosa en el formato Cartera v1.
//
// Es el unico punto del proyecto que sabe como se habla con afuera. El resto
// del sistema trabaja con arrendatarios, contratos y cargos; aca eso se traduce
// a deudas, deudores y cargos del contrato de integracion
// (TB_web/docs/integracion/README.md §6).
//
// No manda nada: devuelve el objeto. Quien lo envie —o lo descargue como
// archivo— decide despues. Asi la cobranza se puede usar con APOFYX, contra
// DataBridge directo, o sin nadie.

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
    nombre: contrato.nombre,
  };
  if (contrato.correo) datos.correo = contrato.correo;
  if (contrato.telefono) datos.telefono = contrato.telefono;
  return datos;
}

/**
 * La cartera a una fecha de corte.
 *
 * Incluye dos cosas:
 *   - los contratos con cargos vencidos impagos, como deudas;
 *   - los que ya se habian entregado y hoy no deben nada, como retiros.
 *
 * Lo segundo es lo que evita que se siga cobrando a alguien que vino a pagar a
 * la oficina. Sin eso, el arrendatario recibiria mensajes de cobranza por una
 * deuda que ya pago, que es exactamente lo que destruye la confianza.
 */
export function construirCartera({ fechaCorte, idExterno }) {
  const contratos = all(
    `SELECT l.id, l.codigo, l.concepto, l.moneda,
            t.rut, t.tipo, t.nombre, t.correo, t.telefono,
            p.direccion, p.comuna
       FROM leases l
       JOIN tenants t ON t.id = l.tenant_id
       JOIN properties p ON p.id = l.property_id
      WHERE l.estado = 'vigente'
      ORDER BY l.id`
  );

  const deudas = [];
  const alDia = [];

  for (const contrato of contratos) {
    const cargos = cargosVencidos(contrato.id, fechaCorte);
    if (cargos.length === 0) {
      alDia.push(contrato);
      continue;
    }
    deudas.push({
      id_externo: contrato.codigo,
      deudor: deudor(contrato),
      moneda: contrato.moneda,
      concepto: contrato.concepto,
      referencias: {
        contrato: contrato.codigo,
        propiedad: `${contrato.direccion}, ${contrato.comuna}`,
      },
      cargos: cargos.map((c) => ({
        concepto: c.concepto,
        periodo: c.periodo,
        monto: redondear(c.saldo, contrato.moneda),
        fecha_vencimiento: c.fecha_vencimiento,
      })),
    });
  }

  // Un retiro solo tiene sentido si antes se entrego: se busca entre lo que ya
  // se mando y no se ha retirado todavia.
  for (const contrato of alDia) {
    const entregado = get(
      `SELECT 1
         FROM collection_batch_items i
         JOIN collection_batches b ON b.id = i.batch_id
        WHERE i.lease_id = ? AND i.accion = 'registrar' AND b.estado <> 'borrador'
          AND NOT EXISTS (
            SELECT 1 FROM collection_batch_items r
              JOIN collection_batches rb ON rb.id = r.batch_id
             WHERE r.lease_id = i.lease_id AND r.accion = 'retirar'
               AND rb.fecha_corte > b.fecha_corte
          )`,
      [contrato.id]
    );
    if (entregado) {
      deudas.push({
        id_externo: contrato.codigo,
        accion: 'retirar',
        motivo_retiro: 'pago_directo',
      });
    }
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

/** Nombre sugerido para el lote del dia: PAT-2026-09-18-01, -02, ... */
export function proponerIdDeLote(fechaCorte) {
  const delDia = all(
    'SELECT id_externo FROM collection_batches WHERE fecha_corte = ?',
    [fechaCorte]
  );
  return `PAT-${fechaCorte}-${String(delDia.length + 1).padStart(2, '0')}`;
}
