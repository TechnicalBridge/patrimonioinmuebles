import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Logo from './Logo.jsx';

const links = [
  { to: '/', label: 'Inicio' },
  { to: '/propiedades', label: 'Propiedades' },
  { to: '/nosotros', label: 'Nosotros' },
  { to: '/contacto', label: 'Contacto' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Logo />
        <button
          className="nav-toggle"
          type="button"
          aria-label="Abrir menú"
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
        </button>
        <nav className={open ? 'open' : ''}>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink to="/admin" className="ghost" onClick={() => setOpen(false)}>
            Admin
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
