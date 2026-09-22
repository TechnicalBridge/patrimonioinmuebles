import { Link } from 'react-router-dom';

export default function Logo({ light = false }) {
  return (
    <Link to="/" className={`brand ${light ? 'light' : ''}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="2" y="2" width="44" height="44" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 34V22.5L24 13l12 9.5V34H12z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path d="M21 34V26h6v8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <span>
        <strong>Patrimonio</strong>
        <small>Inmuebles</small>
      </span>
    </Link>
  );
}
