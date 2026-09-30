// Claves y tokens: lo unico que sabe de criptografia en Patrimonio.
//
// Las claves de los usuarios se guardan con scrypt y una sal propia, nunca en
// claro. Los tokens de sesion se guardan por su huella SHA-256: quien lea la
// base no puede entrar con lo que ve. Sin dependencias: todo es node:crypto.

import crypto from 'crypto';

const LARGO = 64;

export function huellaDeClave(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  const huella = crypto.scryptSync(String(clave), sal, LARGO).toString('hex');
  return `scrypt$${sal}$${huella}`;
}

export function claveCorrecta(clave, guardada) {
  const [tipo, sal, huella] = String(guardada || '').split('$');
  if (tipo !== 'scrypt' || !sal || !huella) return false;
  const calculada = crypto.scryptSync(String(clave), sal, LARGO);
  const esperada = Buffer.from(huella, 'hex');
  return esperada.length === calculada.length && crypto.timingSafeEqual(esperada, calculada);
}

export const nuevoToken = () => crypto.randomBytes(32).toString('base64url');

export const huellaDeToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
