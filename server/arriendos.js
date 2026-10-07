// Administracion de arriendos: contratos, cargos, pagos y cartera.
//
// Aca vive lo que Patrimonio hace por su cuenta. Lo que mira hacia afuera es la
// cartera, que se arma en cartera.js, y la conexion con la agencia, que vive
// en cobranza.js.

import { all, get, run, parseJson } from './db.js';
import { construirCartera, proponerIdDeLote } from './cartera.js';
import { conexion, llamarALaAgencia } from './cobranza.js';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const hoy = () => new Date().toISOString().slice(0, 10);

const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

// ---------------------------------------------------------------------------
//  Consultas
// ---------------------------------------------------------------------------

export function listarContratos() {
  return all(`
    SELECT l.id, l.codigo, l.concepto, l.renta_monto, l.moneda, l.estado,
           l.fecha_inicio, l.dia_vencimiento, l.disputa_estado, l.disputa_motivo, l.disputa_desde,
           l.tasa_interes_mensual,
           COALESCE((SELECT SUM(i.monto) FROM lease_interest_payments i WHERE i.lease_id = l.id), 0)
             AS intereses_cobrados,
           c.id AS client_id, c.rut, c.nombre AS arrendatario, c.correo, c.telefono,
           p.direccion, p.comuna,
           COALESCE(d.deuda, 0) AS deuda,
           COALESCE(d.cargos_impagos, 0) AS cargos_impagos
      FROM leases l
      JOIN clients c ON c.id = l.client_id
      JOIN properties p ON p.id = l.property_id
      LEFT JOIN v_lease_debt d ON d.lease_id = l.id
     ORDER BY l.estado, l.id
  `);
}

/** Contratos con al menos un cargo vencido e impago a la fecha de corte. */
export function listarMorosos(fechaCorte = hoy()) {
  const contratos = all(
    `SELECT l.id, l.codigo, l.concepto, l.moneda, l.disputa_estado,
            c.id AS client_id, c.rut, c.nombre AS arrendatario, c.correo, c.telefono,
            p.direccion, p.comuna
       FROM leases l
       JOIN clients c ON c.id = l.client_id
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
    throw error('El periodo va como 2026-09');
  }
  const contratos = all(
    `SELECT id, renta_monto, dia_vencimiento FROM leases
      WHERE estado = 'vigente' AND fecha_inicio <= ?`,
    [`${periodo}-28`]
  );

  let emitidos = 0, existentes = 0;
  for (const c of contratos) {
    if (emitirCargo(c, periodo)) emitidos++;
    else existentes++;
  }
  return { periodo, emitidos, existentes };
}

/** El arriendo de un mes para un contrato. Devuelve false si ya estaba emitido. */
function emitirCargo(contrato, periodo) {
  const concepto = `Arriendo ${MESES[Number(periodo.slice(5, 7)) - 1]}`;
  if (get('SELECT id FROM charges WHERE lease_id = ? AND periodo = ? AND concepto = ?',
    [contrato.id, periodo, concepto])) {
    return false;
  }
  run(
    `INSERT INTO charges (lease_id, concepto, periodo, monto, fecha_vencimiento)
     VALUES (?, ?, ?, ?, ?)`,
    [contrato.id, concepto, periodo, contrato.renta_monto,
     `${periodo}-${String(contrato.dia_vencimiento).padStart(2, '0')}`]
  );
  return true;
}

/** Los meses desde el de `desde` hasta el de `hasta`, inclusive: ['2026-07', '2026-08', ...]. */
function mesesEntre(desde, hasta) {
  const meses = [];
  let [anio, mes] = desde.slice(0, 7).split('-').map(Number);
  const fin = hasta.slice(0, 7);
  for (let n = 0; n < 600; n++) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    if (periodo > fin) break;
    meses.push(periodo);
    mes += 1;
    if (mes === 13) { mes = 1; anio += 1; }
  }
  return meses;
}

// ---------------------------------------------------------------------------
//  Contratos
// ---------------------------------------------------------------------------

/** El proximo codigo libre del año: CTR-2026-032. Es el id que viaja a la cobranza. */
function proximoCodigo(fechaInicio) {
  const anio = fechaInicio.slice(0, 4);
  const usados = all('SELECT codigo FROM leases WHERE codigo LIKE ?', [`CTR-${anio}-%`])
    .map((l) => Number(l.codigo.slice(9)) || 0);
  return `CTR-${anio}-${String(Math.max(0, ...usados) + 1).padStart(3, '0')}`;
}

/**
 * Firma un contrato: un cliente con RUT arrienda una propiedad del inventario.
 *
 * Si empezo en el pasado, se emiten de una vez los arriendos desde ese mes
 * hasta el actual. Asi un contrato cargado con atraso queda como es: con sus
 * meses cobrados, pagados o no.
 */
export function crearContrato(entrada = {}) {
  const cliente = get('SELECT id, rut, nombre FROM clients WHERE id = ?', [Number(entrada.client_id)]);
  if (!cliente) throw error('El cliente no existe', 404);
  if (!cliente.rut) throw error(`${cliente.nombre} no tiene RUT: agrégalo antes de firmar el contrato`);
  const propiedad = get('SELECT id, titulo, estatus FROM properties WHERE id = ?', [Number(entrada.property_id)]);
  if (!propiedad) throw error('La propiedad no existe', 404);
  if (get("SELECT 1 AS hay FROM leases WHERE property_id = ? AND estado = 'vigente'", [propiedad.id])) {
    throw error(`${propiedad.titulo} ya tiene un contrato vigente`, 409);
  }
  const renta = Number(entrada.renta_monto);
  if (!(renta > 0)) throw error('La renta tiene que ser mayor que cero');
  const moneda = entrada.moneda || 'CLP';
  if (!['CLP', 'UF'].includes(moneda)) throw error('La moneda va como CLP o UF');
  const dia = Number(entrada.dia_vencimiento || 5);
  if (!(Number.isInteger(dia) && dia >= 1 && dia <= 28)) throw error('El día de pago va del 1 al 28');
  const inicio = String(entrada.fecha_inicio || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || Number.isNaN(Date.parse(inicio))) {
    throw error('La fecha de inicio va como 2026-07-01');
  }
  const tasa = tasaDelContrato(entrada.tasa_interes_mensual);

  const codigo = proximoCodigo(inicio);
  const id = run(
    `INSERT INTO leases (codigo, property_id, client_id, concepto, fecha_inicio, renta_monto, moneda, dia_vencimiento,
                         tasa_interes_mensual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [codigo, propiedad.id, cliente.id, String(entrada.concepto || '').trim() || 'Arriendo mensual',
     inicio, renta, moneda, dia, tasa]
  );
  run("UPDATE properties SET estatus = 'arrendada' WHERE id = ?", [propiedad.id]);

  const contrato = { id, renta_monto: renta, dia_vencimiento: dia };
  const cargos = mesesEntre(inicio, hoy()).filter((periodo) => emitirCargo(contrato, periodo)).length;
  return { ...get('SELECT * FROM leases WHERE id = ?', [id]), cargos_emitidos: cargos };
}

/**
 * El interes por mora que se pacta en el contrato, en % mensual. Es opcional:
 * sin el, un arriendo atrasado no genera intereses. La cobranza lo cobra por la
 * mora y en el convenio, y rechaza uno sobre la tasa maxima convencional.
 */
function tasaDelContrato(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const tasa = Number(String(valor).replace(',', '.'));
  if (!(tasa > 0 && tasa <= 100) || Math.round(tasa * 100) !== tasa * 100) {
    throw error('El interés va como un porcentaje mensual mayor que cero, con hasta dos decimales: 1,5');
  }
  return tasa;
}

/** Termina un contrato. La deuda que tenga no se borra: se sigue cobrando. */
export function terminarContrato(id, { fecha_termino } = {}) {
  const contrato = get('SELECT * FROM leases WHERE id = ?', [Number(id)]);
  if (!contrato) throw error('El contrato no existe', 404);
  if (contrato.estado === 'terminado') throw error('Ese contrato ya estaba terminado', 409);
  const fin = fecha_termino || hoy();
  if (fin < contrato.fecha_inicio) throw error('No puede terminar antes de empezar');
  run("UPDATE leases SET estado = 'terminado', fecha_termino = ? WHERE id = ?", [fin, contrato.id]);
  run("UPDATE properties SET estatus = 'disponible' WHERE id = ?", [contrato.property_id]);
  return get('SELECT * FROM leases WHERE id = ?', [contrato.id]);
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
    `SELECT i.*, l.codigo, c.nombre AS arrendatario
       FROM collection_batch_items i
       JOIN leases l ON l.id = i.lease_id
       JOIN clients c ON c.id = l.client_id
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
 * Emite la cartera y la deja registrada, en 'borrador' hasta que se envia.
 *
 * Van todos los clientes con contrato, deban o no: el que esta al dia va sin
 * cargos, y el moroso lo detecta la cobranza.
 */
export function emitirLote(fechaCorte = hoy()) {
  const idExterno = proponerIdDeLote(fechaCorte);
  const cartera = construirCartera({ fechaCorte, idExterno });
  if (!cartera.deudas.length) {
    throw error('No hay contratos que informar a esa fecha');
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
  const agencia = conexion();
  if (!agencia) {
    throw error('No hay una agencia conectada: conéctala en Cobranza, o descarga la cartera y entrégala a mano', 409);
  }
  const lote = verLote(id);
  if (lote.estado !== 'borrador') {
    throw error('Ese lote ya se envió', 409);
  }
  let cuerpo;
  try {
    cuerpo = await llamarALaAgencia(agencia, '/api/v1/carteras', { method: 'POST', cuerpo: carteraDelLote(id) });
  } catch (fallo) {
    throw error(`${fallo.message}. El lote sigue en borrador: puedes reintentar.`, 502);
  }

  const estado = cuerpo.aceptadas === cuerpo.recibidas ? 'aceptado' : cuerpo.aceptadas === 0 ? 'rechazado' : 'parcial';
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
  } else if (evento.tipo === 'deuda.disputada') {
    resultado = marcarDisputa(evento, 'abierta');
  } else if (evento.tipo === 'deuda.reanudada') {
    resultado = marcarDisputa(evento, 'rechazada');
  } else if (evento.tipo === 'deuda.retirada' && evento.datos?.motivo === 'disputa_resuelta') {
    resultado = marcarDisputa(evento, 'aceptada');
  } else if (evento.tipo === 'deuda.retirada') {
    resultado = 'anotado';
  }

  run(
    `INSERT INTO inbound_events (id, tipo, ocurrido_en, cuerpo, resultado)
     VALUES (?, ?, ?, ?, ?)`,
    [evento.id, evento.tipo, evento.ocurrido_en || null, JSON.stringify(evento), resultado]
  );
  return { repetido: false, resultado };
}

/**
 * La disputa de un arrendatario: dijo que la deuda no corresponde (abierta),
 * y la agencia la reviso. Rechazada: la deuda corresponde y se sigue
 * cobrando. Aceptada: no correspondia, y la agencia la saco de su cobranza.
 * Patrimonio no cambia ningun cargo: la deuda es suya, y revisar el contrato
 * le toca a la corredora.
 */
function marcarDisputa(evento, estado) {
  const datos = evento.datos || {};
  const contrato = get('SELECT id FROM leases WHERE codigo = ?', [datos.deuda_id_externo]);
  if (!contrato) return 'contrato desconocido';
  if (estado === 'abierta') {
    run(`UPDATE leases SET disputa_estado = 'abierta', disputa_motivo = ?, disputa_desde = ? WHERE id = ?`,
      [datos.motivo || null, (evento.ocurrido_en || new Date().toISOString()).slice(0, 10), contrato.id]);
    return 'en disputa';
  }
  run('UPDATE leases SET disputa_estado = ? WHERE id = ?', [estado, contrato.id]);
  return estado === 'rechazada' ? 'disputa rechazada: se sigue cobrando' : 'disputa aceptada: salio de la cobranza';
}

function aplicarPagoExterno(evento) {
  const datos = evento.datos || {};
  const contrato = get('SELECT id, moneda FROM leases WHERE codigo = ?', [datos.deuda_id_externo]);
  if (!contrato) return 'contrato desconocido';

  //  Con mora, el pago trae capital e interes por separado: el capital se
  //  imputa a los cargos y el interes se registra aparte. Repartir el monto
  //  completo abonaria con la mora cargos que no se pagaron.
  const interes = Number(datos.interes) > 0 ? Number(datos.interes) : 0;
  let porRepartir = datos.capital !== undefined && datos.capital !== null
    ? Number(datos.capital) : Number(datos.monto);
  if (!(porRepartir > 0)) return 'monto invalido';
  if (interes > 0) {
    run(
      `INSERT OR IGNORE INTO lease_interest_payments (lease_id, monto, pagado_en, referencia)
       VALUES (?, ?, ?, ?)`,
      [contrato.id, interes, (datos.pagado_en || '').slice(0, 10) || hoy(),
       `${datos.pago_id || evento.id}-interes`]
    );
  }

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
       VALUES (?, ?, 'cobranza', ?, ?)`,
      [cargo.id, abono, (datos.pagado_en || '').slice(0, 10) || hoy(),
       `${datos.pago_id || evento.id}-${cargo.id}`]
    );
    porRepartir = Math.round((porRepartir - abono) * 100) / 100;
    abonados++;
  }
  return `${abonados} cargo(s) abonado(s)` + (interes > 0 ? `, ${interes} de intereses` : '');
}
