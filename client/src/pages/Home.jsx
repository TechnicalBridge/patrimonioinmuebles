import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PropertyCard from '../components/PropertyCard.jsx';
import { getAgents, getProperties, getStats } from '../api.js';

export default function Home() {
  const navigate = useNavigate();
  const [featured, setFeatured] = useState([]);
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState({
    q: '',
    operacion: '',
    tipo: '',
    comuna: '',
  });

  useEffect(() => {
    getProperties({ destacado: '1' }).then(setFeatured).catch(() => setFeatured([]));
    getAgents().then(setAgents).catch(() => setAgents([]));
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  function onSearch(e) {
    e.preventDefault();
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(search).filter(([, v]) => v))
    );
    navigate(`/propiedades?${params.toString()}`);
  }

  return (
    <>
      <section className="hero">
        <img src="/images/hero.jpg" alt="Residencia de Patrimonio Inmuebles" />
        <div className="hero-content container">
          <p className="kicker gold">Patrimonio Inmuebles</p>
          <h1>Casas, departamentos y tierra con nombre propio.</h1>
          <p className="lead">
            Inventario seleccionado de La Serena a Pucón. Te acompañamos desde la
            primera visita hasta la escritura.
          </p>
          <form className="search" onSubmit={onSearch}>
            <input
              name="q"
              placeholder="Comuna, ciudad o palabra clave"
              value={search.q}
              onChange={(e) => setSearch({ ...search, q: e.target.value })}
            />
            <select
              value={search.operacion}
              onChange={(e) => setSearch({ ...search, operacion: e.target.value })}
            >
              <option value="">Operación</option>
              <option value="venta">Venta</option>
              <option value="arriendo">Arriendo</option>
            </select>
            <select
              value={search.tipo}
              onChange={(e) => setSearch({ ...search, tipo: e.target.value })}
            >
              <option value="">Tipo</option>
              <option value="casa">Casa</option>
              <option value="departamento">Departamento</option>
              <option value="local">Local</option>
              <option value="terreno">Terreno</option>
            </select>
            <select
              value={search.comuna}
              onChange={(e) => setSearch({ ...search, comuna: e.target.value })}
            >
              <option value="">Comuna</option>
              {(stats?.comunas || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button className="btn" type="submit">
              Buscar
            </button>
          </form>
        </div>
      </section>

      <section className="stats">
        <div className="container stats-row">
          <div>
            <strong>{stats?.anios || 18}</strong>
            <span>años en el rubro</span>
          </div>
          <div>
            <strong>{stats?.propiedades || 10}</strong>
            <span>propiedades activas</span>
          </div>
          <div>
            <strong>{stats?.asesores || 4}</strong>
            <span>asesores</span>
          </div>
          <div>
            <strong>{stats?.ciudades?.length || 5}</strong>
            <span>ciudades</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="kicker">Inventario</p>
              <h2>Propiedades destacadas</h2>
            </div>
            <Link to="/propiedades" className="text-link">
              Ver todo el inventario
            </Link>
          </div>
          <div className="cards">
            {featured.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container split">
          <img src="/images/oficina.jpg" alt="Oficinas de Patrimonio Inmuebles" />
          <div>
            <p className="kicker">La corredora</p>
            <h2>Un inventario corto, revisado a pie de calle.</h2>
            <p>
              No publicamos todo lo que llega. Cada casa, departamento o parcela pasa
              por visita, revisión de papeles y una ficha clara: precio, metros,
              dormitorios y el asesor que la conoce.
            </p>
            <ul className="checks">
              <li>Estudio de títulos antes de ofertar</li>
              <li>Acompañamiento en visita, negociación y cierre</li>
              <li>Base propia de clientes, teléfonos y correos</li>
            </ul>
            <Link to="/nosotros" className="btn">
              Conocer el equipo
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="kicker">Servicios</p>
              <h2>Comprar, vender, arrendar o invertir</h2>
            </div>
          </div>
          <div className="services">
            {[
              ['Compra', 'Búsqueda a la medida, visitas y oferta con números reales.'],
              ['Venta', 'Tasación, ficha fotográfica y seguimiento de interesados.'],
              ['Arriendo', 'Contratos, evaluación del arrendatario y administración del arriendo.'],
              ['Inversión', 'Locales, parcelas y segunda vivienda con tesis de plusvalía o rentabilidad.'],
            ].map(([title, text]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="kicker">Asesores</p>
              <h2>Quién te va a atender</h2>
            </div>
          </div>
          <div className="agents">
            {agents.map((a) => (
              <article key={a.id} className="agent">
                <div className="avatar">{a.nombre[0]}{a.apellido[0]}</div>
                <h3>
                  {a.nombre} {a.apellido}
                </h3>
                <p className="kicker">{a.cargo}</p>
                <p>{a.especialidad}</p>
                <a href={`tel:${a.telefono.replace(/\s/g, '')}`}>{a.telefono}</a>
                <a href={`mailto:${a.correo}`}>{a.correo}</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="container">
          <h2>¿Buscas o quieres vender?</h2>
          <p>Deja tu nombre, teléfono y correo. Un asesor te escribe el mismo día hábil.</p>
          <Link to="/contacto" className="btn light">
            Dejar mis datos
          </Link>
        </div>
      </section>
    </>
  );
}
