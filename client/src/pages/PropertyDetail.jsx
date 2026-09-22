import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import InquiryForm from '../components/InquiryForm.jsx';
import { formatPrice, getProperty } from '../api.js';

export default function PropertyDetail() {
  const { id } = useParams();
  const [property, setProperty] = useState(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    setActive(0);
    getProperty(id)
      .then(setProperty)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <section className="section page">
        <div className="container">
          <p className="alert error">{error}</p>
          <Link to="/propiedades">Volver al inventario</Link>
        </div>
      </section>
    );
  }

  if (!property) {
    return (
      <section className="section page">
        <div className="container">
          <p className="muted">Cargando ficha…</p>
        </div>
      </section>
    );
  }

  const images = property.imagenes?.length ? property.imagenes : ['/images/hero.jpg'];

  return (
    <section className="section page">
      <div className="container">
        <Link to="/propiedades" className="text-link">
          ← Inventario
        </Link>
        <div className="detail-head">
          <div>
            <p className="kicker">
              {property.operacion} · {property.tipo}
            </p>
            <h1>{property.titulo}</h1>
            <p>
              {property.direccion}, {property.comuna}, {property.region}
            </p>
          </div>
          <p className="price xl">
            {formatPrice(property.precio, property.moneda, property.operacion)}
          </p>
        </div>

        <div className="gallery">
          <img src={images[active]} alt={property.titulo} />
          {images.length > 1 && (
            <div className="thumbs">
              {images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  className={i === active ? 'on' : ''}
                  onClick={() => setActive(i)}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="detail-grid">
          <div>
            <ul className="specs big">
              {property.dormitorios > 0 && <li>{property.dormitorios} dormitorios</li>}
              {property.banos > 0 && <li>{property.banos} baños</li>}
              {property.estacionamientos > 0 && <li>{property.estacionamientos} estac.</li>}
              {property.m2_utiles > 0 && (
                <li>{property.m2_utiles.toLocaleString('es-CL')} m² útiles</li>
              )}
              {property.m2_terreno > 0 && (
                <li>{property.m2_terreno.toLocaleString('es-CL')} m² terreno</li>
              )}
            </ul>
            <p>{property.descripcion}</p>
            {property.equipamiento?.length > 0 && (
              <>
                <h3>Equipamiento</h3>
                <ul className="chips">
                  {property.equipamiento.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <aside className="side">
            {property.agent && (
              <div className="agent-box">
                <p className="kicker">Asesor</p>
                <h3>
                  {property.agent.nombre} {property.agent.apellido}
                </h3>
                <p>{property.agent.cargo}</p>
                <a href={`tel:${property.agent.telefono.replace(/\s/g, '')}`}>
                  {property.agent.telefono}
                </a>
                <a href={`mailto:${property.agent.correo}`}>{property.agent.correo}</a>
              </div>
            )}
            <h3>Pedir información</h3>
            <p className="muted">
              Guardamos tu nombre, teléfono y correo para que un asesor te contacte.
            </p>
            <InquiryForm propertyId={property.id} origen="ficha" />
          </aside>
        </div>
      </div>
    </section>
  );
}
