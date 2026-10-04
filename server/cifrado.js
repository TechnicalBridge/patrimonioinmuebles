// Los secretos que Patrimonio tiene que poder leer de vuelta: la clave que le
// dio su agencia y el secreto con que verifica sus avisos.
//
// No se pueden guardar como huella (como las claves de los usuarios): hay que
// mandarlos en cada llamada y firmar con ellos. Asi que se guardan cifrados con
// AES-256-GCM, con una llave que viene de CIFRADO_LLAVE y nunca toca la base:
// quien se lleve una copia de la base no se lleva los secretos.
//
// Un valor cifrado empieza con "enc:v1:". Uno sin ese prefijo es de antes de
// cifrar (la migracion a la version 3 los cifra), y se devuelve tal cual.

import crypto from 'node:crypto';

const PREFIJO = 'enc:v1:';

//  Solo para desarrollo, como las demas claves por omision de este proyecto.
//  En un despliegue se cambia con CIFRADO_LLAVE.
const LLAVE_DE_DESARROLLO = 'patrimonio-cifrado-dev-cambiar';

const llave = () => crypto.createHash('sha256').update(process.env.CIFRADO_LLAVE || LLAVE_DE_DESARROLLO).digest();

export const estaCifrado = (valor) => typeof valor === 'string' && valor.startsWith(PREFIJO);

/** El valor cifrado. Vacio o ya cifrado, se devuelve igual. */
export function cifrar(valor) {
  if (valor === null || valor === undefined || valor === '' || estaCifrado(valor)) return valor;
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', llave(), iv);
  const cuerpo = Buffer.concat([cifrador.update(String(valor), 'utf8'), cifrador.final()]);
  return PREFIJO + Buffer.concat([iv, cifrador.getAuthTag(), cuerpo]).toString('base64');
}

/** El valor original. Si no estaba cifrado, se devuelve igual. */
export function descifrar(valor) {
  if (!estaCifrado(valor)) return valor;
  const bytes = Buffer.from(valor.slice(PREFIJO.length), 'base64');
  const descifrador = crypto.createDecipheriv('aes-256-gcm', llave(), bytes.subarray(0, 12));
  descifrador.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([descifrador.update(bytes.subarray(28)), descifrador.final()]).toString('utf8');
}
