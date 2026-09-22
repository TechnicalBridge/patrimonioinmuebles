const API = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('pi_admin_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'No se pudo completar la solicitud');
  }
  return data;
}

export function getProperties(params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return request(`/properties${query ? `?${query}` : ''}`);
}

export function getProperty(id) {
  return request(`/properties/${id}`);
}

export function getAgents() {
  return request('/agents');
}

export function getStats() {
  return request('/stats');
}

export function sendInquiry(payload) {
  return request('/inquiries', { method: 'POST', body: JSON.stringify(payload) });
}

export function adminLogin(password) {
  return request('/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
}

export function getClients() {
  return request('/admin/clients');
}

export function getInquiries() {
  return request('/admin/inquiries');
}

export function createProperty(payload) {
  return request('/admin/properties', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteProperty(id) {
  return request(`/admin/properties/${id}`, { method: 'DELETE' });
}

// --- Administración de arriendos ---

export function getContratos() {
  return request('/admin/arriendos/contratos');
}

export function getMorosos(corte) {
  return request(`/admin/arriendos/morosos${corte ? `?corte=${corte}` : ''}`);
}

export function generarCargos(periodo) {
  return request('/admin/arriendos/cargos', {
    method: 'POST',
    body: JSON.stringify({ periodo }),
  });
}

export function registrarPago(payload) {
  return request('/admin/arriendos/pagos', { method: 'POST', body: JSON.stringify(payload) });
}

export function getLotes() {
  return request('/admin/arriendos/lotes');
}

export function emitirCartera(corte) {
  return request('/admin/arriendos/lotes', { method: 'POST', body: JSON.stringify({ corte }) });
}

export function marcarLoteEnviado(id) {
  return request(`/admin/arriendos/lotes/${id}/enviado`, { method: 'POST' });
}

/**
 * Descarga la cartera como archivo.
 *
 * No se puede usar un <a href> normal porque la ruta pide el token en una
 * cabecera: se baja con fetch y se arma el archivo en el navegador.
 */
export async function descargarLote(id, nombre) {
  const token = localStorage.getItem('pi_admin_token');
  const res = await fetch(`${API}/admin/arriendos/lotes/${id}/archivo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No se pudo descargar la cartera');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${nombre}.json`;
  enlace.click();
  URL.revokeObjectURL(url);
}

// La UF no es una moneda ISO, asi que Intl no la sabe formatear como tal:
// se escribe "UF 58.000", que es como se lee en cualquier aviso chileno.
export function formatPrice(value, moneda, operacion) {
  const amount = Number(value) || 0;
  const formatted =
    moneda === 'CLP'
      ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount)
      : `UF ${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(amount)}`;
  return operacion === 'arriendo' ? `${formatted} / mes` : formatted;
}

// "Vitacura, Santiago", pero solo "Pucón" cuando la comuna es la ciudad.
export function formatLocation(property) {
  if (!property.comuna || property.comuna === property.ciudad) return property.ciudad;
  return `${property.comuna}, ${property.ciudad}`;
}

export function formatDate(value) {
  if (!value) return '';
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
