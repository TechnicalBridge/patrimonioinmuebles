import { Link } from 'react-router-dom';
import { formatLocation, formatPrice } from '../api.js';

export default function PropertyCard({ property }) {
  const image = property.imagenes?.[0] || '/images/hero.jpg';

  return (
    <Link to={`/propiedades/${property.id}`} className="card">
      <div className="card-media">
        <img src={image} alt={property.titulo} />
        <div className="badges">
          <span>{property.operacion}</span>
          <span className="ghost">{property.tipo}</span>
        </div>
      </div>
      <div className="card-body">
        <p className="kicker">{formatLocation(property)}</p>
        <h3>{property.titulo}</h3>
        <p className="price">
          {formatPrice(property.precio, property.moneda, property.operacion)}
        </p>
        <ul className="specs">
          {property.dormitorios > 0 && <li>{property.dormitorios} dorm.</li>}
          {property.banos > 0 && <li>{property.banos} baños</li>}
          {property.m2_utiles > 0 && (
            <li>{property.m2_utiles.toLocaleString('es-CL')} m² útiles</li>
          )}
          {property.tipo === 'terreno' && property.m2_terreno > 0 && (
            <li>{property.m2_terreno.toLocaleString('es-CL')} m² terreno</li>
          )}
        </ul>
      </div>
    </Link>
  );
}
