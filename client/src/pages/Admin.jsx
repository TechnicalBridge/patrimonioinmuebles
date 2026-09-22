import { useEffect, useState } from 'react';
import ArriendosPanel from '../components/ArriendosPanel.jsx';
import {
  adminLogin,
  createProperty,
  deleteProperty,
  formatDate,
  formatLocation,
  formatPrice,
  getClients,
  getInquiries,
  getProperties,
} from '../api.js';

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('pi_admin_token') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('arriendos');
  const [clients, setClients] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [properties, setProperties] = useState([]);
  const [form, setForm] = useState({
    titulo: '',
    tipo: 'casa',
    operacion: 'venta',
    precio: '',
    moneda: 'UF',
    dormitorios: 3,
    banos: 2,
    m2_utiles: '',
    comuna: '',
    ciudad: 'Santiago',
    region: 'Región Metropolitana',
    descripcion: '',
    imagenes: '/images/hero.jpg',
  });

  async function load() {
    const [c, i, p] = await Promise.all([
      getClients(),
      getInquiries(),
      getProperties({ all: '1' }),
    ]);
    setClients(c);
    setInquiries(i);
    setProperties(p);
  }

  useEffect(() => {
    if (!token) return;
    load().catch(() => {
      localStorage.removeItem('pi_admin_token');
      setToken('');
    });
  }, [token]);

  async function login(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await adminLogin(password);
      localStorage.setItem('pi_admin_token', res.token);
      setToken(res.token);
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    localStorage.removeItem('pi_admin_token');
    setToken('');
  }

  async function addProperty(e) {
    e.preventDefault();
    await createProperty({
      ...form,
      precio: Number(form.precio),
      dormitorios: Number(form.dormitorios),
      banos: Number(form.banos),
      m2_utiles: Number(form.m2_utiles || 0),
      imagenes: form.imagenes.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setForm({ ...form, titulo: '', precio: '', descripcion: '', comuna: '' });
    await load();
    setTab('inventario');
  }

  async function remove(id) {
    if (!window.confirm('¿Quitar esta propiedad del inventario?')) return;
    await deleteProperty(id);
    await load();
  }

  if (!token) {
    return (
      <section className="section page">
        <div className="container narrow">
          <p className="kicker">Panel interno</p>
          <h1>Entrar</h1>
          <p className="muted">Contraseña de demostración: patrimonio</p>
          <form className="form" onSubmit={login}>
            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <p className="alert error">{error}</p>}
            <button className="btn" type="submit">
              Entrar
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="section page">
      <div className="container">
        <div className="section-head">
          <div>
            <p className="kicker">Panel interno</p>
            <h1>Clientes, consultas e inventario</h1>
          </div>
          <button className="btn ghost-btn" type="button" onClick={logout}>
            Salir
          </button>
        </div>

        <div className="tabs">
          {['arriendos', 'consultas', 'clientes', 'inventario', 'nueva'].map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'on' : ''}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'arriendos' && <ArriendosPanel />}

        {tab === 'consultas' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Correo</th>
                  <th>Interés</th>
                  <th>Propiedad</th>
                  <th>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      {row.nombre} {row.apellido}
                    </td>
                    <td>{row.telefono}</td>
                    <td>{row.correo}</td>
                    <td>{row.tipo_interes}</td>
                    <td>{row.property_titulo || '—'}</td>
                    <td>{row.mensaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'clientes' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Apellido</th>
                  <th>Teléfono</th>
                  <th>Correo</th>
                  <th>Interés</th>
                  <th>Presupuesto</th>
                  <th>Consultas</th>
                  <th>Alta</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.apellido}</td>
                    <td>{c.telefono}</td>
                    <td>{c.correo}</td>
                    <td>{c.tipo_interes}</td>
                    <td>{c.presupuesto}</td>
                    <td>{c.consultas}</td>
                    <td>{formatDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'inventario' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Operación</th>
                  <th>Ubicación</th>
                  <th>Precio</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <tr key={p.id}>
                    <td>{p.titulo}</td>
                    <td>{p.tipo}</td>
                    <td>{p.operacion}</td>
                    <td>{formatLocation(p)}</td>
                    <td>{formatPrice(p.precio, p.moneda, p.operacion)}</td>
                    <td>
                      <button type="button" className="linkish" onClick={() => remove(p.id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'nueva' && (
          <form className="form" onSubmit={addProperty}>
            <div className="grid-2">
              <label>
                Título
                <input
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  required
                />
              </label>
              <div className="grid-2">
                <label>
                  Precio
                  <input
                    type="number"
                    step="any"
                    value={form.precio}
                    onChange={(e) => setForm({ ...form, precio: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Moneda
                  <select
                    value={form.moneda}
                    onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                  >
                    <option value="UF">UF</option>
                    <option value="CLP">Pesos (CLP)</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="grid-2">
              <label>
                Tipo
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  <option value="casa">Casa</option>
                  <option value="departamento">Departamento</option>
                  <option value="local">Local</option>
                  <option value="terreno">Terreno</option>
                </select>
              </label>
              <label>
                Operación
                <select
                  value={form.operacion}
                  onChange={(e) =>
                    // Sugiere la moneda habitual; un local en arriendo se puede
                    // volver a pasar a UF a mano.
                    setForm({
                      ...form,
                      operacion: e.target.value,
                      moneda: e.target.value === 'arriendo' ? 'CLP' : 'UF',
                    })
                  }
                >
                  <option value="venta">Venta</option>
                  <option value="arriendo">Arriendo</option>
                </select>
              </label>
            </div>
            <div className="grid-2">
              <label>
                Dormitorios
                <input
                  type="number"
                  value={form.dormitorios}
                  onChange={(e) => setForm({ ...form, dormitorios: e.target.value })}
                />
              </label>
              <label>
                Baños
                <input
                  type="number"
                  value={form.banos}
                  onChange={(e) => setForm({ ...form, banos: e.target.value })}
                />
              </label>
            </div>
            <div className="grid-2">
              <label>
                Comuna
                <input
                  value={form.comuna}
                  onChange={(e) => setForm({ ...form, comuna: e.target.value })}
                  required
                />
              </label>
              <label>
                Ciudad
                <input
                  value={form.ciudad}
                  onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                />
              </label>
            </div>
            <div className="grid-2">
              <label>
                Región
                <input
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                />
              </label>
              <label>
                m² útiles
                <input
                  type="number"
                  value={form.m2_utiles}
                  onChange={(e) => setForm({ ...form, m2_utiles: e.target.value })}
                />
              </label>
            </div>
            <label>
              Imágenes (rutas separadas por coma)
              <input
                value={form.imagenes}
                onChange={(e) => setForm({ ...form, imagenes: e.target.value })}
              />
            </label>
            <label>
              Descripción
              <textarea
                rows="4"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </label>
            <button className="btn" type="submit">
              Publicar
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
