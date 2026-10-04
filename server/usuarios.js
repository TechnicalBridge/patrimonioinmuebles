// Los usuarios del panel y sus sesiones.
//
// Cada persona entra con su correo y su clave. La sesion vive en la base, no
// en la memoria del servidor: sobrevive a un reinicio, se puede cerrar de
// verdad y vence sola a las 8 horas.

import { claveCorrecta, huellaDeToken, nuevoToken } from './claves.js';
import { get, run } from './db.js';

const HORAS_DE_SESION = 8;

//  Freno contra quien prueba claves: 5 intentos fallidos por IP y queda
//  bloqueada 10 minutos. En la base (login_intentos), y no en memoria: un
//  reinicio del servidor no le devuelve los intentos a nadie. La IP se guarda
//  como huella.
const INTENTOS = 5;
const BLOQUEO_MS = 10 * 60 * 1000;

function bloqueada(ip) {
  const f = get('SELECT bloqueada_hasta FROM login_intentos WHERE ip_huella = ?', [huellaDeToken(ip)]);
  return Boolean(f?.bloqueada_hasta) && f.bloqueada_hasta > new Date().toISOString();
}

function anotarFallo(ip) {
  const huella = huellaDeToken(ip);
  const f = get('SELECT fallos FROM login_intentos WHERE ip_huella = ?', [huella]);
  const n = (f?.fallos || 0) + 1;
  const bloqueo = n >= INTENTOS ? new Date(Date.now() + BLOQUEO_MS).toISOString() : null;
  run(`INSERT INTO login_intentos (ip_huella, fallos, bloqueada_hasta) VALUES (?, ?, ?)
       ON CONFLICT (ip_huella) DO UPDATE SET fallos = excluded.fallos,
         bloqueada_hasta = COALESCE(excluded.bloqueada_hasta, login_intentos.bloqueada_hasta)`,
  [huella, bloqueo ? 0 : n, bloqueo]);
}

const error = (mensaje, status) => Object.assign(new Error(mensaje), { status });

/** Inicia sesion. Devuelve el token (una sola vez) y quien entro. */
export function entrar({ correo, clave }, ip = 'local') {
  if (bloqueada(ip)) throw error('Demasiados intentos. Espera unos minutos.', 429);
  const usuario = get('SELECT * FROM users WHERE correo = ? AND activo = 1', [String(correo || '').trim()]);
  if (!usuario || !claveCorrecta(clave, usuario.clave_hash)) {
    anotarFallo(ip);
    //  El mismo mensaje para un correo que no existe y para una clave mala: no
    //  se le dice a nadie que correos tienen cuenta.
    throw error('Correo o clave incorrectos', 401);
  }
  run('DELETE FROM login_intentos WHERE ip_huella = ?', [huellaDeToken(ip)]);
  const token = nuevoToken();
  const expira = new Date(Date.now() + HORAS_DE_SESION * 3600 * 1000).toISOString();
  run('INSERT INTO sessions (token_hash, user_id, expira_en) VALUES (?, ?, ?)',
    [huellaDeToken(token), usuario.id, expira]);
  return { token, usuario: publico(usuario), expira_en: expira };
}

/** Quien es el dueno del token, o null si no sirve: no existe, vencio o se cerro. */
export function usuarioDeLaSesion(token) {
  if (!token) return null;
  const fila = get(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revocada_en IS NULL AND s.expira_en > ? AND u.activo = 1`,
    [huellaDeToken(token), new Date().toISOString()]
  );
  return fila ? publico(fila) : null;
}

export function salir(token) {
  run("UPDATE sessions SET revocada_en = datetime('now') WHERE token_hash = ? AND revocada_en IS NULL",
    [huellaDeToken(token)]);
}

const publico = ({ id, correo, nombre }) => ({ id, correo, nombre });
