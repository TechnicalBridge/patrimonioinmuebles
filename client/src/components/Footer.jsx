import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Logo light />
          <p>
            Asesoría inmobiliaria para comprar, vender o arrendar en Chile.
            Oficinas en Vitacura.
          </p>
        </div>
        <div>
          <h4>Explorar</h4>
          <Link to="/propiedades">Inventario</Link>
          <Link to="/nosotros">La corredora</Link>
          <Link to="/contacto">Agenda una visita</Link>
          <Link to="/admin">Panel interno</Link>
        </div>
        <div>
          <h4>Contacto</h4>
          <p>Av. Nueva Costanera 3750, of. 402<br />Vitacura, Santiago</p>
          <p>
            <a href="tel:+56223456700">+56 2 2345 6700</a>
            <br />
            <a href="mailto:contacto@patrimonioinmuebles.cl">contacto@patrimonioinmuebles.cl</a>
          </p>
          <p className="muted">Lun–Vie 9:00 a 19:00 · Sáb 10:00 a 14:00</p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Patrimonio Inmuebles</span>
        <span>Datos de clientes, teléfonos y correos se guardan en la base interna.</span>
      </div>
    </footer>
  );
}
