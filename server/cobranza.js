// La conexion con una agencia de cobranza.
//
// Sirve cualquier agencia que hable el contrato de integracion (Cartera v1 y
// Eventos v1), o una plataforma de pagos directa: Patrimonio no tiene el nombre
// de nadie escrito en el codigo. Desde el panel se pega la direccion y la
// clave que la agencia le emitio a Patrimonio, y al conectar:
//
//   1. GET  /api/v1/cuenta         la clave sirve, es de Patrimonio, y dice con quien quedo conectada;
//   2. POST /api/v1/suscripciones  la agencia avisara los pagos en la direccion indicada;
//   3. se guarda todo, con el secreto con que la agencia firma esos avisos.
//
// Si algo falla no se guarda nada: quedar conectado a medias seria entregar
// cartera sin poder recibir los pagos de vuelta.

import { get, run } from './db.js';
import { EMPRESA } from './empresa.js';

const error = (mensaje, status) => Object.assign(new Error(mensaje), { status });

export function conexion() {
  return get('SELECT * FROM agency_connection WHERE id = 1');
}

/** Lo que el panel muestra de la conexion. La clave y el secreto no salen de aqui. */
export function estadoDeLaCobranza() {
  const c = conexion();
  if (!c) return { conectada: false };
  return {
    conectada: true, agencia: c.nombre, rut: c.rut, url: c.url, url_avisos: c.url_avisos,
    conectada_en: c.conectada_en, avisos: Boolean(c.secreto_eventos),
  };
}

/** Con que se verifican los avisos que llegan. Vacio si no hay conexion. */
export function secretoDeLosAvisos() {
  return conexion()?.secreto_eventos || '';
}

/** Una llamada al contrato de la agencia. Los errores ya vienen explicados para el panel. */
export async function llamarALaAgencia({ url, clave, nombre = 'La agencia' }, ruta, { method = 'GET', cuerpo } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${url}${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw error(`${nombre} no respondió en ${url}`, 502);
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !datos) {
    const motivo = datos?.error?.mensaje || `respondió ${respuesta.status}`;
    throw error(`${nombre}: ${motivo}`, respuesta.status === 401 ? 401 : 502);
  }
  return datos;
}

const esWeb = (url) => /^https?:\/\/\S+$/.test(url || '');

export async function conectar({ url, clave, url_avisos: urlAvisos } = {}) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  const llave = String(clave || '').trim();
  const avisos = String(urlAvisos || '').trim();
  if (!esWeb(base)) throw error('La dirección de la agencia tiene que partir con http:// o https://', 400);
  if (!llave) throw error('Falta la clave que te dio la agencia', 400);
  if (!esWeb(avisos)) throw error('La dirección de los avisos tiene que partir con http:// o https://', 400);

  const destino = { url: base, clave: llave };
  const cuenta = await llamarALaAgencia(destino, '/api/v1/cuenta');
  if (cuenta.rut !== EMPRESA.rut) {
    throw error(`Esa clave es de ${cuenta.nombre || cuenta.rut}, no de ${EMPRESA.nombre_fantasia}`, 409);
  }
  const receptor = cuenta.receptor || {};
  const nombre = receptor.nombre || base;
  const suscripcion = await llamarALaAgencia({ ...destino, nombre }, '/api/v1/suscripciones',
    { method: 'POST', cuerpo: { url: avisos } });

  run(
    `INSERT OR REPLACE INTO agency_connection (id, nombre, rut, url, clave, url_avisos, secreto_eventos, conectada_en)
     VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [nombre, receptor.rut || null, base, llave, avisos, suscripcion.secreto || null]
  );
  return estadoDeLaCobranza();
}

export function desconectar() {
  run('DELETE FROM agency_connection WHERE id = 1');
  return estadoDeLaCobranza();
}
