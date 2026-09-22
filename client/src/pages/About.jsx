import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAgents } from '../api.js';

export default function About() {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    getAgents().then(setAgents).catch(() => setAgents([]));
  }, []);

  return (
    <section className="section page">
      <div className="container">
        <p className="kicker">Nosotros</p>
        <h1>Una corredora chica, con inventario que sí visitamos.</h1>
        <div className="split">
          <img src="/images/oficina.jpg" alt="Oficina de Patrimonio Inmuebles" />
          <div>
            <p>
              Patrimonio Inmuebles nació en 2008 en Vitacura. Trabajamos casas,
              departamentos, locales y parcelas para familias e inversionistas que
              quieren una operación clara: precio, papeles y un asesor con nombre y
              teléfono.
            </p>
            <p>
              Cada cliente queda en nuestra base con nombre, apellidos, correo,
              teléfono, presupuesto e interés. Así no se pierde el hilo entre la
              primera llamada y la firma.
            </p>
            <Link to="/contacto" className="btn">
              Hablar con la corredora
            </Link>
          </div>
        </div>

        <div className="services about-values">
          <article>
            <h3>Inventario propio</h3>
            <p>Publicamos menos fichas, con fotos reales y datos de metros, dormitorios y comuna.</p>
          </article>
          <article>
            <h3>Papeles primero</h3>
            <p>
              Antes de ofertar revisamos dominio vigente, hipotecas y gravámenes, y que las
              contribuciones estén al día.
            </p>
          </article>
          <article>
            <h3>Cierre acompañado</h3>
            <p>
              Promesa, escritura, inscripción en el Conservador y entrega. Un solo
              interlocutor de principio a fin.
            </p>
          </article>
        </div>

        <div className="section-head">
          <div>
            <p className="kicker">Equipo</p>
            <h2>Asesores</h2>
          </div>
        </div>
        <div className="agents">
          {agents.map((a) => (
            <article key={a.id} className="agent">
              <div className="avatar">
                {a.nombre[0]}
                {a.apellido[0]}
              </div>
              <h3>
                {a.nombre} {a.apellido}
              </h3>
              <p className="kicker">{a.cargo}</p>
              <p>{a.bio}</p>
              <a href={`tel:${a.telefono.replace(/\s/g, '')}`}>{a.telefono}</a>
              <a href={`mailto:${a.correo}`}>{a.correo}</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
