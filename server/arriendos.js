// Administracion de arriendos: contratos, cargos, pagos y cartera morosa.
//
// Aca vive lo que Patrimonio hace por su cuenta. La unica parte que mira hacia
// afuera es la cartera, y esa se arma en cartera.js.

import { all, get, run, parseJson } from './db.js';
import { construirCartera, proponerIdDeLote } from './cartera.js';
import { COBRANZA } from './empresa.js';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const hoy = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
//  Consultas
// ---------------------------------------------------------------------------

export function listarContratos() {
  return all(`
    SELECT l.id, l.codigo, l.concepto, l.renta_monto, l.moneda, l.estado,
           l.fecha_inicio, l.dia_vencimiento,
           t.rut, t.nombre AS arrendatario, t.correo, t.telefono,
           p.direccion, p.comuna,
           COALESCE(d.deuda, 0) AS deuda,
           COALESCE(d.cargos_impagos, 0) AS cargos_impagos
      FROM leases l
      JOIN tenants t ON t.id = l.tenant_id
      JOIN properties p ON p.id = l.property_id
      LEFT JOIN v_lease_debt d ON d.lease_id = l.id
     ORDER BY l.estado, l.id
  `);
}

/** Contratos con al menos un cargo vencido e impago a la fecha de corte. */
export function listarMorosos(fechaCorte = hoy()) {
  const contratos = all(
    `SELECT l.id, l.codigo, l.concepto, l.moneda,
            t.rut, t.nombre AS arrendatario, t.correo, t.telefono,
            p.direccion, p.comuna
       FROM leases l
       JOIN tenants t ON t.id = l.tenant_id
       JOIN properties p ON p.id = l.property_id
      WHERE l.estado = 'vigente'
      ORDER BY l.id`
  );
  const morosos = [];
  for (const c of contratos) {
    const cargos = all(
      `SELECT id, concepto, periodo, monto, pagado, saldo, fecha_vencimiento
         FROM v_charge_balance
        WHERE lease_id = ? AND anulado_en IS NULL AND saldo > 0
          AND fecha_vencimiento < ?
        ORDER BY fecha_vencimiento`,
      [c.id, fechaCorte]
    );
    if (!cargos.length) continue;
    const masAntiguo = cargos[0].fecha_vencimiento;
    morosos.push({
      ...c,
      cargos,
      deuda: cargos.reduce((t, x) => t + x.saldo, 0),
      // Los tramos son los mismos que usa la cobranza para priorizar.
      dias_mora: Math.round(
        (Date.parse(`${fechaCorte}T00:00:00Z`) - Date.parse(`${masAntiguo}T00:00:00Z`)) / 86400000
      ),
    });
  }
  return morosos;
}

export function cargosDeContrato(leaseId) {
  return all(
    `SELECT id, concepto, periodo, monto, pagado, saldo, fecha_vencimiento, anulado_en
       FROM v_charge_balance WHERE lease_id = ? ORDER BY fecha_vencimiento DESC`,
    [leaseId]
  );
}

// ---------------------------------------------------------------------------
//  Operaciones
// ---------------------------------------------------------------------------

/**
 * Emite el cargo del mes para cada contrato vigente.
 *
 * Es idempotente por el UNIQUE (lease_id, periodo, concepto): correrlo dos
 * veces el mismo mes no cobra dos veces. Devuelve cuantos emitio y cuantos ya
 * estaban.
 */
export function generarCargosDelMes(periodo) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo || '')) {
    throw Object.assign(new Error('El periodo va como 2026-09'), { status: 400 });
  }
  const mes = Number(periodo.slice(5, 7));
  const contratos = all(
    `SELECT id, renta_monto, dia_vencimiento FROM leases
      WHERE estado = 'vigente' AND fecha_inicio <= ?`,
    [`${periodo}-28`]
  );

  let emitidos = 0, existentes = 0;
  for (const c of contratos) {
    const concepto = `Arriendo ${MESES[mes - 1]}`;
    const ya = get(
      'SELECT id FROM charges WHERE lease_id = ? AND periodo = ? AND concepto = ?',
      [c.id, periodo, concepto]
    );
    if (ya) { existentes++; continue; }
    run(
      `INSERT INTO charges (lease_id, concepto, periodo, monto, fecha_vencimiento)
       VALUES (?, ?, ?, ?, ?)`,
      [c.id, concepto, periodo, c.renta_monto,
       `${periodo}-${String(c.dia_vencimiento).padStart(2, '0')}`]
    );
    emitidos++;
  }
  return { periodo, emitidos, existentes };
}

/** Un pago recibido en la oficina. */
export function registrarPago({ charge_id, monto, medio = 'transferencia', pagado_en }) {
  const cargo = get('SELECT * FROM v_charge_balance WHERE id = ?', [Number(charge_id)]);
  if (!cargo) throw Object.assign(new Error('El cargo no existe'), { status: 404 });
  if (cargo.anulado_en) throw Object.assign(new Error('El cargo esta anulado'), { status: 409 });

  const valor = Number(monto);
  if (!(valor > 0)) throw Object.assign(new Error('El monto debe ser mayor que cero'), { status: 400 });
  // Redondear a 2 decimales evita que un resto de punto flotante deje un
  // saldo de 0,0000001 y el contrato siga apareciendo moroso para siempre.
  if (Math.round((valor - cargo.saldo) * 100) / 100 > 0) {
    throw Object.assign(
      new Error(`El pago supera el saldo del cargo (${cargo.saldo})`), { status: 400 }
    );
  }
  if (!['transferencia', 'efectivo'].includes(medio)) {
    throw Object.assign(new Error('El medio va como transferencia o efectivo'), { status: 400 });
  }
  run(
    `INSERT INTO charge_payments (charge_id, monto, medio, pagado_en)
     VALUES (?, ?, ?, ?)`,
    [cargo.id, valor, medio, pagado_en || hoy()]
  );
  return get('SELECT * FROM v_charge_balance WHERE id = ?', [cargo.id]);
}

// ---------------------------------------------------------------------------
//  Cartera hacia la cobranza
// ---------------------------------------------------------------------------

/** Los lotes, con lo que respondio la agencia. Sin la cartera entera: para la lista no hace falta. */
export function listarLotes() {
  return all(`
    SELECT b.id, b.id_externo, b.fecha_corte, b.estado, b.enviado_en, b.respuesta, b.created_at,
           (SELECT COUNT(*) FROM collection_batch_items i WHERE i.batch_id = b.id) AS deudas
      FROM collection_batches b ORDER BY b.fecha_corte DESC, b.id DESC
  `).map(({ respuesta, ...lote }) => ({ ...lote, respuesta: resumenDeRespuesta(parseJson(respuesta, null)) }));
}

/** Lo que importa de la respuesta de la agencia: cuantas entraron, y por que no las otras. */
function resumenDeRespuesta(r) {
  if (!r) return null;
  return {
    recibidas: r.recibidas,
    aceptadas: r.aceptadas,
    rechazadas: r.rechazadas,
    rechazos: (r.resultados || [])
      .filter((x) => x.resultado === 'rechazada')
      .map((x) => ({ id_externo: x.id_externo, motivo: (x.errores || []).map((e) => e.mensaje).join('; ') })),
  };
}

export function verLote(id) {
  const lote = get('SELECT * FROM collection_batches WHERE id = ?', [Number(id)]);
  if (!lote) throw Object.assign(new Error('El lote no existe'), { status: 404 });
  delete lote.cartera;
  lote.respuesta = resumenDeRespuesta(parseJson(lote.respuesta, null));
  lote.items = all(
    `SELECT i.*, l.codigo, t.nombre AS arrendatario
       FROM collection_batch_items i
       JOIN leases l ON l.id = i.lease_id
       JOIN tenants t ON t.id = l.tenant_id
      WHERE i.batch_id = ? ORDER BY i.id`,
    [lote.id]
  );
  return lote;
}

/** La cartera a una fecha, sin guardar nada. Para mirarla antes de emitirla. */
export function previsualizarCartera(fechaCorte = hoy()) {
  return construirCartera({ fechaCorte, idExterno: proponerIdDeLote(fechaCorte) });
}

/**
 * Emite la cartera y la deja registrada.
 *
 * Queda en 'borrador': recien cuando se marca como enviada cuenta para los
 * retiros, porque solo se puede retirar lo que efectivamente se entrego.
 */
export function emitirLote(fechaCorte = hoy()) {
  const idExterno = proponerIdDeLote(fechaCorte);
  const cartera = construirCartera({ fechaCorte, idExterno });
  if (!cartera.deudas.length) {
    throw Object.assign(new Error('No hay nada que cobrar a esa fecha'), { status: 400 });
  }
  const batchId = run(
    'INSERT INTO collection_batches (id_externo, fecha_corte, estado, cartera) VALUES (?, ?, ?, ?)',
    [idExterno, fechaCorte, 'borrador', JSON.stringify(cartera)]
  );
  for (const deuda of cartera.deudas) {
    const contrato = get('SELECT id, moneda FROM leases WHERE codigo = ?', [deuda.id_externo]);
    const total = (deuda.cargos || []).reduce((t, c) => t + c.monto, 0);
    run(
      `INSERT INTO collection_batch_items
         (batch_id, lease_id, accion, motivo_retiro, monto_enviado, moneda)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [batchId, contrato.id, deuda.accion || 'registrar', deuda.motivo_retiro || null,
       total, contrato.moneda]
    );
  }
  return { lote: verLote(batchId), cartera };
}

/**
 * La cartera de un lote tal como se emitio. Los lotes de antes de que se
 * guardara se rearman a su fecha de corte, que es lo que hacia la descarga.
 */
export function carteraDelLote(id) {
  const fila = get('SELECT id_externo, fecha_corte, cartera FROM collection_batches WHERE id = ?', [Number(id)]);
  if (!fila) throw Object.assign(new Error('El lote no existe'), { status: 404 });
  const guardada = parseJson(fila.cartera, null);
  if (guardada) return guardada;
  const cartera = previsualizarCartera(fila.fecha_corte);
  cartera.lote.id_externo = fila.id_externo;
  return cartera;
}

/** A quien se le entrega la cartera. Sin URL o sin clave, se descarga y se entrega a mano. */
export function cobranza() {
  return { agencia: COBRANZA.agencia_nombre, configurada: Boolean(COBRANZA.url && COBRANZA.clave) };
}

/**
 * Le entrega el lote a la agencia (contrato Cartera v1) y guarda su respuesta,
 * contrato por contrato.
 *
 * Va la cartera tal como se emitio. Si la respuesta se pierde y se reintenta,
 * la agencia la reconoce como el mismo lote y contesta lo mismo sin volver a
 * procesarla; una cartera rearmada, en cambio, podria traer otro contenido con
 * el mismo numero, y la agencia la rechazaria.
 */
export async function enviarLote(id) {
  if (!cobranza().configurada) {
    throw Object.assign(new Error('No hay una agencia configurada: la cartera se descarga y se entrega a mano'),
      { status: 409 });
  }
  const lote = verLote(id);
  if (lote.estado !== 'borrador') {
    throw Object.assign(new Error('Ese lote ya se envió'), { status: 409 });
  }
  const agencia = COBRANZA.agencia_nombre;
  let respuesta;
  try {
    respuesta = await fetch(`${COBRANZA.url.replace(/\/+$/, '')}/api/v1/carteras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${COBRANZA.clave}` },
      body: JSON.stringify(carteraDelLote(id)),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(new Error(`${agencia} no respondió. El lote sigue en borrador: puedes reintentar.`),
      { status: 502 });
  }
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !cuerpo) {
    const motivo = cuerpo?.error?.mensaje || `respondió ${respuesta.status}`;
    throw Object.assign(new Error(`${agencia} no recibió el lote: ${motivo}`), { status: 502 });
  }

  const estado = cuerpo.aceptadas === cuerpo.recibidas ? 'aceptado' : cuerpo.aceptadas === 0 ? 'rechazado' : 'enviado';
  run(
    'UPDATE collection_batches SET estado = ?, enviado_en = ?, respuesta = ? WHERE id = ?',
    [estado, new Date().toISOString(), JSON.stringify(cuerpo), lote.id]
  );
  for (const r of cuerpo.resultados || []) {
    run(
      `UPDATE collection_batch_items SET resultado = ?
        WHERE batch_id = ? AND lease_id = (SELECT id FROM leases WHERE codigo = ?)`,
      [r.resultado, lote.id, r.id_externo]
    );
  }
  return verLote(id);
}

export function marcarLoteEnviado(id) {
  const lote = verLote(id);
  if (lote.estado !== 'borrador') {
    throw Object.assign(new Error('Ese lote ya estaba enviado'), { status: 409 });
  }
  run(
    "UPDATE collection_batches SET estado = 'enviado', enviado_en = ? WHERE id = ?",
    [new Date().toISOString(), lote.id]
  );
  return verLote(id);
}

// ---------------------------------------------------------------------------
//  Eventos que llegan de la cobranza
// ---------------------------------------------------------------------------

/**
 * Aplica un evento del contrato Eventos v1.
 *
 * Lo primero es la deduplicacion: el contrato entrega "al menos una vez", asi
 * que el mismo evento puede llegar dos veces y la segunda no debe abonar nada.
 */
export function procesarEvento(evento) {
  if (!evento?.id || !evento?.tipo) {
    throw Object.assign(new Error('Al evento le falta id o tipo'), { status: 400 });
  }
  const visto = get('SELECT id, resultado FROM inbound_events WHERE id = ?', [evento.id]);
  if (visto) return { repetido: true, resultado: visto.resultado };

  let resultado = 'ignorado';
  if (evento.tipo === 'pago.confirmado') {
    resultado = aplicarPagoExterno(evento);
  } else if (evento.tipo === 'deuda.saldada') {
    // No hay nada que hacer: el saldo sale de los pagos, y el pago ya llego
    // en su propio evento. Se registra igual para dejar el rastro.
    resultado = 'anotado';
  }

  run(
    `INSERT INTO inbound_events (id, tipo, ocurrido_en, cuerpo, resultado)
     VALUES (?, ?, ?, ?, ?)`,
    [evento.id, evento.tipo, evento.ocurrido_en || null, JSON.stringify(evento), resultado]
  );
  return { repetido: false, resultado };
}

function aplicarPagoExterno(evento) {
  const datos = evento.datos || {};
  const contrato = get('SELECT id, moneda FROM leases WHERE codigo = ?', [datos.deuda_id_externo]);
  if (!contrato) return 'contrato desconocido';

  let porRepartir = Number(datos.monto);
  if (!(porRepartir > 0)) return 'monto invalido';

  // El pago se reparte sobre los cargos impagos, del mas viejo al mas nuevo:
  // es como se imputa un abono en una cuenta corriente de arriendo.
  const cargos = all(
    `SELECT id, saldo FROM v_charge_balance
      WHERE lease_id = ? AND anulado_en IS NULL AND saldo > 0
      ORDER BY fecha_vencimiento`,
    [contrato.id]
  );
  let abonados = 0;
  for (const cargo of cargos) {
    if (porRepartir <= 0) break;
    const abono = Math.min(cargo.saldo, porRepartir);
    run(
      `INSERT INTO charge_payments (charge_id, monto, medio, pagado_en, referencia)
       VALUES (?, ?, 'databridge', ?, ?)`,
      [cargo.id, abono, (datos.pagado_en || '').slice(0, 10) || hoy(),
       `${datos.pago_id || evento.id}-${cargo.id}`]
    );
    porRepartir = Math.round((porRepartir - abono) * 100) / 100;
    abonados++;
  }
  return `${abonados} cargo(s) abonado(s)`;
}
