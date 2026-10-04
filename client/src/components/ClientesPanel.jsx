import { useCallback, useEffect, useState } from 'react';
import {
  actualizarCliente,
  crearCliente,
  crearContrato,
  formatDate,
  formatPrice,
  getCliente,
  getClients,
  getProperties,
  terminarContrato,
} from '../api.js';
import Disputa from './Disputa.jsx';

const hoy = () => new Date().toISOString().slice(0, 10);
const VACIO = { tipo: 'persona', rut: '', nombre: '', apellido: '', correo: '', telefono: '' };

/**
 * Los clientes de la corredora: el interesado que pregunto por una propiedad y
 * el arrendatario que firmo son el mismo registro, en otra etapa. Desde la
 * ficha se le firma un contrato.
 */
export default function ClientesPanel() {
  const [clientes, setClientes] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => setClientes(await getClients()), []);

  useEffect(() => {
    cargar().catch((e) => setAviso({ type: 'error', text: e.message }));
  }, [cargar]);

  async function abrir(id) {
    setAviso(null);
    setAbierto(await getCliente(id));
  }

  async function guardarNuevo(e) {
    e.preventDefault();
    setAviso(null);
    try {
      const creado = await crearCliente(nuevo);
      setNuevo(null);
      await cargar();
      setAbierto(creado);
      setAviso({ type: 'ok', text: `${creado.nombre} quedó registrado.` });
    } catch (err) {
      setAviso({ type: 'error', text: err.message });
    }
  }

  if (abierto) {
    return (
      <FichaCliente
        cliente={abierto}
        avisoInicial={aviso}
        volver={() => { setAbierto(null); setAviso(null); cargar(); }}
        recargar={() => abrir(abierto.id)}
      />
    );
  }

  return (
    <div className="arriendos">
      {aviso && <p className={`alert ${aviso.type}`}>{aviso.text}</p>}

      <div className="section-head">
        <div>
          <p className="kicker">Clientes</p>
          <h2>{clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'}</h2>
        </div>
        {!nuevo && (
          <button className="btn" type="button" onClick={() => setNuevo({ ...VACIO })}>
            Nuevo cliente
          </button>
        )}
      </div>

      {nuevo && (
        <form className="form" onSubmit={guardarNuevo}>
          <DatosCliente datos={nuevo} cambiar={setNuevo} />
          <div className="filters">
            <button className="btn" type="submit">Guardar</button>
            <button className="btn ghost-btn" type="button" onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>RUT</th>
              <th>Etapa</th>
              <th>Contacto</th>
              <th>Deuda</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre} {c.apellido}</td>
                <td>{c.rut || '—'}</td>
                <td>{c.etapa}</td>
                <td>{c.correo || c.telefono}</td>
                <td>
                  {c.deuda_clp > 0 && formatPrice(c.deuda_clp, 'CLP')}
                  {c.deuda_clp > 0 && c.deuda_uf > 0 && ' · '}
                  {c.deuda_uf > 0 && formatPrice(c.deuda_uf, 'UF')}
                  {!c.deuda_clp && !c.deuda_uf && '—'}
                </td>
                <td>
                  <button type="button" className="linkish" onClick={() => abrir(c.id)}>Ver ficha</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DatosCliente({ datos, cambiar }) {
  const campo = (nombre) => ({
    value: datos[nombre] ?? '',
    onChange: (e) => cambiar({ ...datos, [nombre]: e.target.value }),
  });
  return (
    <>
      <div className="grid-2">
        <label>
          Tipo
          <select {...campo('tipo')}>
            <option value="persona">Persona</option>
            <option value="empresa">Empresa</option>
          </select>
        </label>
        <label>
          RUT <small className="muted">(obligatorio para firmar un contrato)</small>
          <input placeholder="16.482.337-7" {...campo('rut')} />
        </label>
      </div>
      <div className="grid-2">
        <label>
          {datos.tipo === 'empresa' ? 'Razón social' : 'Nombre'}
          <input required {...campo('nombre')} />
        </label>
        {datos.tipo === 'persona' && (
          <label>
            Apellido
            <input {...campo('apellido')} />
          </label>
        )}
      </div>
      <div className="grid-2">
        <label>
          Correo
          <input type="email" {...campo('correo')} />
        </label>
        <label>
          Teléfono
          <input {...campo('telefono')} />
        </label>
      </div>
    </>
  );
}

function FichaCliente({ cliente, avisoInicial, volver, recargar }) {
  const [editando, setEditando] = useState(null);
  const [contrato, setContrato] = useState(null);
  const [propiedades, setPropiedades] = useState([]);
  //  Recien creado, la ficha se abre con el aviso de que quedo registrado.
  const [aviso, setAviso] = useState(avisoInicial);

  async function accion(fn, exito) {
    setAviso(null);
    try {
      const r = await fn();
      await recargar();
      setAviso({ type: 'ok', text: exito(r) });
      return true;
    } catch (e) {
      setAviso({ type: 'error', text: e.message });
      return false;
    }
  }

  async function nuevoContrato() {
    const todas = await getProperties({ all: '1' });
    setPropiedades(todas.filter((p) => p.operacion === 'arriendo' && ['disponible', 'reservada'].includes(p.estatus)));
    setContrato({ property_id: '', renta_monto: '', moneda: 'CLP', dia_vencimiento: 5, fecha_inicio: hoy(),
      concepto: 'Arriendo mensual' });
  }

  async function guardarContrato(e) {
    e.preventDefault();
    const ok = await accion(() => crearContrato({ ...contrato, client_id: cliente.id }),
      (r) => `Contrato ${r.codigo} firmado. Se emitieron ${r.cargos_emitidos} arriendos, desde el mes de inicio hasta hoy.`);
    if (ok) setContrato(null);
  }

  async function guardarDatos(e) {
    e.preventDefault();
    const ok = await accion(() => actualizarCliente(cliente.id, editando), () => 'Datos actualizados.');
    if (ok) setEditando(null);
  }

  return (
    <div className="arriendos">
      <button type="button" className="linkish" onClick={volver}>← Todos los clientes</button>
      {aviso && <p className={`alert ${aviso.type}`}>{aviso.text}</p>}

      <div className="section-head">
        <div>
          <p className="kicker">{cliente.etapa}</p>
          <h2>{cliente.nombre} {cliente.apellido}</h2>
          <p className="muted">
            {cliente.rut ? `RUT ${cliente.rut}` : 'Sin RUT'}
            {cliente.correo && ` · ${cliente.correo}`}
            {cliente.telefono && ` · ${cliente.telefono}`}
          </p>
        </div>
        <div className="filters">
          {!editando && (
            <button className="btn ghost-btn" type="button" onClick={() => setEditando({ ...cliente })}>
              Editar datos
            </button>
          )}
          {!contrato && (
            <button className="btn" type="button" onClick={nuevoContrato}>Nuevo contrato</button>
          )}
        </div>
      </div>

      {editando && (
        <form className="form" onSubmit={guardarDatos}>
          <DatosCliente datos={editando} cambiar={setEditando} />
          <div className="filters">
            <button className="btn" type="submit">Guardar</button>
            <button className="btn ghost-btn" type="button" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {contrato && (
        <form className="form" onSubmit={guardarContrato}>
          <label>
            Propiedad
            <select required value={contrato.property_id}
                    onChange={(e) => setContrato({ ...contrato, property_id: e.target.value })}>
              <option value="">Elige una propiedad en arriendo</option>
              {propiedades.map((p) => (
                <option key={p.id} value={p.id}>{p.titulo} · {p.comuna}</option>
              ))}
            </select>
          </label>
          <div className="grid-2">
            <label>
              Renta mensual
              <input type="number" step="any" required value={contrato.renta_monto}
                     onChange={(e) => setContrato({ ...contrato, renta_monto: e.target.value })} />
            </label>
            <label>
              Moneda
              <select value={contrato.moneda} onChange={(e) => setContrato({ ...contrato, moneda: e.target.value })}>
                <option value="CLP">Pesos (CLP)</option>
                <option value="UF">UF</option>
              </select>
            </label>
          </div>
          <div className="grid-2">
            <label>
              Fecha de inicio
              <input type="date" required value={contrato.fecha_inicio}
                     onChange={(e) => setContrato({ ...contrato, fecha_inicio: e.target.value })} />
              <small className="muted">Si ya empezó, se emiten los arriendos desde ese mes hasta hoy.</small>
            </label>
            <label>
              Día de pago
              <input type="number" min="1" max="28" value={contrato.dia_vencimiento}
                     onChange={(e) => setContrato({ ...contrato, dia_vencimiento: e.target.value })} />
            </label>
          </div>
          <div className="filters">
            <button className="btn" type="submit">Firmar contrato</button>
            <button className="btn ghost-btn" type="button" onClick={() => setContrato(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <h3>Contratos</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Contrato</th><th>Propiedad</th><th>Renta</th><th>Inicio</th><th>Estado</th><th>Deuda</th><th></th></tr>
          </thead>
          <tbody>
            {cliente.contratos.length === 0 && (
              <tr><td colSpan="7" className="muted">Sin contratos.</td></tr>
            )}
            {cliente.contratos.map((l) => (
              <tr key={l.id}>
                <td>{l.codigo}</td>
                <td>{l.propiedad}</td>
                <td>{formatPrice(l.renta_monto, l.moneda)}</td>
                <td>{formatDate(l.fecha_inicio)}</td>
                <td>
                  {l.estado}
                  <Disputa contrato={l} />
                </td>
                <td>{l.deuda > 0 ? `${formatPrice(l.deuda, l.moneda)} (${l.cargos_impagos} meses)` : '—'}</td>
                <td>
                  {l.estado === 'vigente' && (
                    <button type="button" className="linkish"
                            onClick={() => window.confirm(`¿Terminar ${l.codigo} hoy?`)
                              && accion(() => terminarContrato(l.id), () => `${l.codigo} quedó terminado.`)}>
                      Terminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Consultas</h3>
      {cliente.consultas.length === 0 && <p className="muted">Sin consultas.</p>}
      {cliente.consultas.map((c) => (
        <p key={c.id}>
          <strong>{formatDate(c.created_at)}</strong>{c.propiedad && ` · ${c.propiedad}`}: {c.mensaje || '—'}
        </p>
      ))}
    </div>
  );
}
