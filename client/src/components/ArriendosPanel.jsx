import { useCallback, useEffect, useState } from 'react';
import {
  descargarLote,
  emitirCartera,
  enviarLote,
  formatDate,
  formatPrice,
  generarCargos,
  getCobranza,
  getContratos,
  getLotes,
  getMorosos,
  marcarLoteEnviado,
  registrarPago,
} from '../api.js';
import Disputa from './Disputa.jsx';

const hoy = () => new Date().toISOString().slice(0, 10);
const mesActual = () => new Date().toISOString().slice(0, 7);

export default function ArriendosPanel() {
  const [corte, setCorte] = useState(hoy());
  const [periodo, setPeriodo] = useState(mesActual());
  const [morosos, setMorosos] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [pago, setPago] = useState(null);
  const [aviso, setAviso] = useState(null);
  //  A quien se le entrega la cartera: la agencia conectada en Cobranza. Sin
  //  agencia, se descarga y se marca enviada a mano.
  const [cobranza, setCobranza] = useState({ conectada: false });
  const [enviando, setEnviando] = useState(null);

  const cargar = useCallback(async () => {
    const [m, c, l, cb] = await Promise.all([getMorosos(corte), getContratos(), getLotes(), getCobranza()]);
    setMorosos(m);
    setContratos(c);
    setLotes(l);
    setCobranza(cb);
  }, [corte]);

  useEffect(() => {
    cargar().catch((e) => setAviso({ type: 'error', text: e.message }));
  }, [cargar]);

  async function accion(fn, exito) {
    setAviso(null);
    try {
      const r = await fn();
      await cargar();
      setAviso({ type: 'ok', text: exito(r) });
    } catch (e) {
      setAviso({ type: 'error', text: e.message });
    }
  }

  async function enviar(lote) {
    setEnviando(lote.id);
    await accion(() => enviarLote(lote.id), (r) => {
      const { aceptadas, recibidas, rechazadas } = r.respuesta;
      return `${cobranza.agencia} aceptó ${aceptadas} de ${recibidas}`
        + (rechazadas ? `. El motivo de ${rechazadas === 1 ? 'la rechazada' : 'las rechazadas'} está en la tabla.` : '.');
    });
    setEnviando(null);
  }

  const deudaTotal = (moneda) =>
    morosos.filter((m) => m.moneda === moneda).reduce((t, m) => t + m.deuda, 0);

  return (
    <div className="arriendos">
      <div className="filters">
        <label>
          Cartera al
          <input type="date" value={corte} onChange={(e) => setCorte(e.target.value)} />
        </label>
        <button
          className="btn"
          type="button"
          onClick={() => accion(() => emitirCartera(corte), (r) =>
            `Cartera ${r.lote.id_externo} emitida con ${r.lote.items.length} clientes con contrato, `
            + `${r.lote.items.filter((i) => i.monto_enviado > 0).length} con deuda. Queda en borrador `
            + (cobranza.conectada ? `hasta que la envíes a ${cobranza.agencia}.` : 'hasta que la marques como enviada.')
          )}
        >
          Emitir cartera
        </button>
        <label>
          Cargos del mes
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </label>
        <button
          className="btn ghost-btn"
          type="button"
          onClick={() => accion(() => generarCargos(periodo), (r) =>
            r.emitidos === 0
              ? `Los ${r.existentes} cargos de ${r.periodo} ya estaban emitidos.`
              : `${r.emitidos} cargos emitidos para ${r.periodo}.`
          )}
        >
          Generar
        </button>
      </div>

      {aviso && <p className={`alert ${aviso.type}`}>{aviso.text}</p>}

      <div className="section-head">
        <div>
          <p className="kicker">Cobranza</p>
          <h2>
            {morosos.length} {morosos.length === 1 ? 'contrato moroso' : 'contratos morosos'}
          </h2>
          <p className="muted">
            {deudaTotal('CLP') > 0 && formatPrice(deudaTotal('CLP'), 'CLP')}
            {deudaTotal('CLP') > 0 && deudaTotal('UF') > 0 && ' · '}
            {deudaTotal('UF') > 0 && formatPrice(deudaTotal('UF'), 'UF')}
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contrato</th>
              <th>Arrendatario</th>
              <th>RUT</th>
              <th>Propiedad</th>
              <th>Mora</th>
              <th>Deuda</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {morosos.length === 0 && (
              <tr>
                <td colSpan="7" className="muted">
                  Nadie debe nada a esta fecha.
                </td>
              </tr>
            )}
            {morosos.map((m) => (
              <tr key={m.codigo}>
                <td>
                  {m.codigo}
                  <Disputa contrato={m} />
                </td>
                <td>{m.arrendatario}</td>
                <td>{m.rut}</td>
                <td>
                  {m.direccion}, {m.comuna}
                </td>
                <td>{m.dias_mora} días</td>
                <td>{formatPrice(m.deuda, m.moneda)}</td>
                <td>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setAbierto(abierto === m.codigo ? null : m.codigo)}
                  >
                    {abierto === m.codigo ? 'Cerrar' : 'Ver cargos'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abierto && (
        <div className="table-wrap">
          <h3>Cargos impagos de {abierto}</h3>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Vence</th>
                <th>Monto</th>
                <th>Pagado</th>
                <th>Saldo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {morosos
                .find((m) => m.codigo === abierto)
                ?.cargos.map((c) => {
                  const moneda = morosos.find((m) => m.codigo === abierto).moneda;
                  return (
                    <tr key={c.id}>
                      <td>{c.concepto}</td>
                      <td>{c.fecha_vencimiento}</td>
                      <td>{formatPrice(c.monto, moneda)}</td>
                      <td>{formatPrice(c.pagado, moneda)}</td>
                      <td>{formatPrice(c.saldo, moneda)}</td>
                      <td>
                        {pago?.id === c.id ? (
                          <form
                            className="pago-inline"
                            onSubmit={(e) => {
                              e.preventDefault();
                              accion(
                                () =>
                                  registrarPago({
                                    charge_id: c.id,
                                    monto: Number(pago.monto),
                                    medio: pago.medio,
                                    pagado_en: pago.fecha,
                                  }),
                                () => `Pago registrado en ${abierto}.`
                              ).then(() => setPago(null));
                            }}
                          >
                            <input
                              type="number"
                              step="any"
                              value={pago.monto}
                              onChange={(e) => setPago({ ...pago, monto: e.target.value })}
                            />
                            <select
                              value={pago.medio}
                              onChange={(e) => setPago({ ...pago, medio: e.target.value })}
                            >
                              <option value="transferencia">Transferencia</option>
                              <option value="efectivo">Efectivo</option>
                            </select>
                            <input
                              type="date"
                              value={pago.fecha}
                              onChange={(e) => setPago({ ...pago, fecha: e.target.value })}
                            />
                            <button className="btn" type="submit">
                              Guardar
                            </button>
                            <button
                              type="button"
                              className="linkish"
                              onClick={() => setPago(null)}
                            >
                              Cancelar
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="linkish"
                            onClick={() =>
                              setPago({ id: c.id, monto: c.saldo, medio: 'transferencia', fecha: hoy() })
                            }
                          >
                            Registrar pago
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-head">
        <div>
          <p className="kicker">Entregas</p>
          <h2>Cartera entregada a cobranza</h2>
          <p className="muted">
            {cobranza.conectada
              ? `Va a ${cobranza.agencia}: todos los clientes con contrato, deban o no. La agencia detecta a los morosos.`
              : 'Sin agencia conectada: la cartera se descarga y se entrega a mano. Conéctala en la pestaña Cobranza.'}
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Corte</th>
              <th>Clientes</th>
              <th>Estado</th>
              <th>Enviada</th>
              <th>Respuesta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id}>
                <td>{l.id_externo}</td>
                <td>{l.fecha_corte}</td>
                <td>{l.deudas}</td>
                <td>{l.estado}</td>
                <td>{l.enviado_en ? formatDate(l.enviado_en) : '—'}</td>
                <td>
                  {l.respuesta ? `${l.respuesta.aceptadas} de ${l.respuesta.recibidas} aceptadas` : '—'}
                  {l.respuesta?.rechazos.map((r) => (
                    <span key={r.id_externo} className="muted" style={{ display: 'block', fontSize: 13 }}>
                      {r.id_externo}: {r.motivo}
                    </span>
                  ))}
                </td>
                <td>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() =>
                      descargarLote(l.id, l.id_externo).catch((e) =>
                        setAviso({ type: 'error', text: e.message })
                      )
                    }
                  >
                    Descargar
                  </button>
                  {l.estado === 'borrador' && cobranza.conectada && (
                    <button
                      type="button"
                      className="linkish"
                      disabled={enviando === l.id}
                      onClick={() => enviar(l)}
                    >
                      {enviando === l.id ? 'Enviando…' : `Enviar a ${cobranza.agencia}`}
                    </button>
                  )}
                  {l.estado === 'borrador' && !cobranza.conectada && (
                    <button
                      type="button"
                      className="linkish"
                      onClick={() =>
                        accion(() => marcarLoteEnviado(l.id), () => `${l.id_externo} marcada como enviada.`)
                      }
                    >
                      Marcar enviada
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {lotes.length === 0 && (
              <tr>
                <td colSpan="7" className="muted">
                  Todavía no se ha entregado ninguna cartera.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="section-head">
        <div>
          <p className="kicker">Administración</p>
          <h2>Contratos</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contrato</th>
              <th>Arrendatario</th>
              <th>Propiedad</th>
              <th>Renta</th>
              <th>Vence</th>
              <th>Deuda</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {contratos.map((c) => (
              <tr key={c.id}>
                <td>{c.codigo}</td>
                <td>
                  {c.arrendatario}
                  <br />
                  <span className="muted">{c.rut}</span>
                </td>
                <td>
                  {c.direccion}, {c.comuna}
                </td>
                <td>
                  {formatPrice(c.renta_monto, c.moneda, 'arriendo')}
                  {c.tasa_interes_mensual ? (
                    <>
                      <br />
                      <span className="muted">{String(c.tasa_interes_mensual).replace('.', ',')}% mensual por mora</span>
                    </>
                  ) : null}
                </td>
                <td>día {c.dia_vencimiento}</td>
                <td>
                  {c.deuda > 0 ? formatPrice(c.deuda, c.moneda) : '—'}
                  {c.intereses_cobrados > 0 ? (
                    <>
                      <br />
                      <span className="muted">{formatPrice(c.intereses_cobrados, c.moneda)} de intereses cobrados</span>
                    </>
                  ) : null}
                </td>
                <td>
                  {c.estado}
                  <Disputa contrato={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
