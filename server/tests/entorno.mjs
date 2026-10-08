// Los secretos de las pruebas. Ninguno esta escrito: cada corrida inventa los
// suyos, como preparar-env.ps1 con un .env nuevo. Cada archivo de pruebas lo
// importa primero, antes que el codigo que los usa.
import crypto from 'node:crypto';

process.env.CIFRADO_LLAVE ||= crypto.randomBytes(32).toString('base64url');
process.env.ADMIN_PASSWORD ||= crypto.randomBytes(24).toString('base64url');

/** La clave del primer usuario del panel en esta corrida. */
export const CLAVE_ADMIN = process.env.ADMIN_PASSWORD;
