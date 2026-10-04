import { useEffect, useState } from 'react';
import { conectarCobranza, desconectarCobranza, formatDate, getCobranza } from '../api.js';

/**
 * La conexion con la agencia de cobranza.
 *
 * Sirve cualquier agencia que hable el contrato de integracion: se pega la
 * direccion y la clave que la agencia le dio a Patrimonio, y al conectar se
 * comprueba la clave y se suscribe a sus avisos de pago. El nombre de la
 * agencia lo dice ella misma.
 */
export default function CobranzaPanel() {
  const [estado, setEstado] = useState(null);
  const [form, setForm] = useState({
    url: '',
    clave: '',
    url_avisos: `${window.location.origin}/api/eventos`,
  });
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    getCobranza().then((e) => {
      setEstado(e);
      //  Si el sitio corre en Docker y se abrio desde localhost, la agencia no lo
      //  encontraria ahi: desde otro contenedor, el equipo es host.docker.internal.
      const { hostname, port } = window.location;
      if (e.en_docker && ['localhost', '127.0.0.1'].includes(hostname)) {
        setForm((f) => ({ ...f, url_avisos: `http://host.docker.internal${port ? `:${port}` : ''}/api/eventos` }));
      }
    }).catch((e) => setAviso({ type: 'error', text: e.message }));
  }, []);

  async function conectar(e) {
    e.preventDefault();
    setOcupado(true);
    setAviso(null);
    try {
      const nuevo = await conectarCobranza(form);
      setEstado(nuevo);
      setForm({ ...form, clave: '' });
      setAviso({ type: 'ok', text: `Conectado con ${nuevo.agencia}.` });
    } catch (err) {
      setAviso({ type: 'error', text: err.message });
    }
    setOcupado(false);
  }

  async function desconectar() {
    if (!window.confirm('¿Desconectar la agencia? La cartera se tendrá que entregar a mano.')) return;
    setEstado(await desconectarCobranza());
    setAviso({ type: 'ok', text: 'La agencia quedó desconectada.' });
  }

  if (!estado) return aviso ? <p className={`alert ${aviso.type}`}>{aviso.text}</p> : null;

  return (
    <div className="arriendos">
      {aviso && <p className={`alert ${aviso.type}`}>{aviso.text}</p>}

      {estado.conectada && (
        <div className="section-head">
          <div>
            <p className="kicker">Agencia de cobranza</p>
            <h2>Conectado con {estado.agencia}</h2>
            <p className="muted">
              {estado.url} · desde el {formatDate(estado.conectada_en)}
              {estado.avisos ? ' · recibe sus avisos de pago' : ' · sin avisos de pago'}
            </p>
          </div>
          <button className="btn ghost-btn" type="button" onClick={desconectar}>
            Desconectar
          </button>
        </div>
      )}

      <div className="section-head">
        <div>
          <p className="kicker">{estado.conectada ? 'Cambiar la conexión' : 'Conectar una agencia'}</p>
          <h2>{estado.conectada ? 'Otra agencia u otra clave' : 'Entregar la cartera a una agencia'}</h2>
          <p className="muted">
            Pide a tu agencia de cobranza una clave de API para Patrimonio. Cada mes le entregas a todos tus
            clientes con contrato; ella detecta a los morosos y te avisa cuando pagan.
          </p>
        </div>
      </div>

      <form className="form" onSubmit={conectar}>
        <label>
          Dirección de la agencia
          <input
            type="url"
            placeholder="https://agencia.cl o http://host.docker.internal:8000"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            required
          />
        </label>
        <label>
          Clave que te dio la agencia
          <input
            type="password"
            autoComplete="off"
            value={form.clave}
            onChange={(e) => setForm({ ...form, clave: e.target.value })}
            required
          />
        </label>
        <label>
          Dónde te avisa los pagos
          <input
            type="url"
            value={form.url_avisos}
            onChange={(e) => setForm({ ...form, url_avisos: e.target.value })}
            required
          />
          <small className="muted">
            La dirección de este sitio tal como la ve la agencia, terminada en /api/eventos. Si los dos corren en
            Docker, «localhost» no sirve: para la agencia es ella misma.
          </small>
        </label>
        <button className="btn" type="submit" disabled={ocupado}>
          {ocupado ? 'Conectando…' : 'Conectar'}
        </button>
      </form>
    </div>
  );
}
