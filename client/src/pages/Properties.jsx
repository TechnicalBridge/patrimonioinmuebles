import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PropertyCard from '../components/PropertyCard.jsx';
import { getProperties, getStats } from '../api.js';

export default function Properties() {
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const filters = useMemo(
    () => ({
      q: params.get('q') || '',
      operacion: params.get('operacion') || '',
      tipo: params.get('tipo') || '',
      comuna: params.get('comuna') || '',
      dormitorios: params.get('dormitorios') || '',
    }),
    [params]
  );

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    setLoading(true);
    getProperties(filters)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [filters]);

  function update(name, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next);
  }

  return (
    <section className="section page">
      <div className="container">
        <p className="kicker">Inventario</p>
        <h1>Propiedades</h1>
        <p className="lead tight">
          Filtra por operación, tipo o comuna. Cada ficha sale de la base de datos.
        </p>

        <div className="filters">
          <input
            placeholder="Buscar"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select value={filters.operacion} onChange={(e) => update('operacion', e.target.value)}>
            <option value="">Operación</option>
            <option value="venta">Venta</option>
            <option value="arriendo">Arriendo</option>
          </select>
          <select value={filters.tipo} onChange={(e) => update('tipo', e.target.value)}>
            <option value="">Tipo</option>
            <option value="casa">Casa</option>
            <option value="departamento">Departamento</option>
            <option value="local">Local</option>
            <option value="terreno">Terreno</option>
          </select>
          <select value={filters.comuna} onChange={(e) => update('comuna', e.target.value)}>
            <option value="">Comuna</option>
            {(stats?.comunas || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filters.dormitorios}
            onChange={(e) => update('dormitorios', e.target.value)}
          >
            <option value="">Dormitorios</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
        </div>

        {loading ? (
          <p className="muted">Cargando inventario…</p>
        ) : list.length === 0 ? (
          <p className="muted">No hay propiedades con esos filtros.</p>
        ) : (
          <>
            <p className="muted count">{list.length} resultados</p>
            <div className="cards">
              {list.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
