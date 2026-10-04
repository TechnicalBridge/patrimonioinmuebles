// Los secretos que Patrimonio guarda para poder leerlos de vuelta: la clave de
// la agencia y el secreto de sus avisos. Cifrados, con una llave que no esta en
// la base, y sin que un cambio pase inadvertido.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { cifrar, descifrar, estaCifrado } = await import('../cifrado.js');

afterEach(() => { delete process.env.CIFRADO_LLAVE; });

test('cifra y descifra de vuelta, sin dejar el valor a la vista', () => {
  const cifrado = cifrar('ak_clave_de_la_agencia');
  assert.ok(estaCifrado(cifrado));
  assert.ok(!cifrado.includes('ak_clave_de_la_agencia'));
  assert.equal(descifrar(cifrado), 'ak_clave_de_la_agencia');
});

test('el mismo valor cifrado dos veces no se parece: cada vez con su propio IV', () => {
  assert.notEqual(cifrar('whsec_1'), cifrar('whsec_1'));
});

test('lo vacio, lo ya cifrado y lo de antes de cifrar pasan igual', () => {
  assert.equal(cifrar(null), null);
  assert.equal(cifrar(''), '');
  const una = cifrar('x');
  assert.equal(cifrar(una), una, 'no se cifra dos veces');
  assert.equal(descifrar('en-claro-de-antes'), 'en-claro-de-antes');
  assert.equal(descifrar(null), null);
});

test('con otra llave, o con un byte cambiado, no se descifra', () => {
  const cifrado = cifrar('whsec_de_la_agencia');
  process.env.CIFRADO_LLAVE = 'otra-llave';
  assert.throws(() => descifrar(cifrado));
  delete process.env.CIFRADO_LLAVE;

  const bytes = Buffer.from(cifrado.slice('enc:v1:'.length), 'base64');
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => descifrar('enc:v1:' + bytes.toString('base64')));
});
