// Los clientes de Patrimonio.
//
// Un cliente es una persona o empresa que se relaciona con la corredora. Pasa
// por etapas: interesado (pregunto por una propiedad), arrendatario (firmo un
// contrato) y ex arrendatario. Es el mismo registro en todas: sus consultas y
// sus contratos cuelgan de el.

import { all, get, run } from './db.js';
import { normalizarRut, rutValido } from './rut.js';

const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const ETAPA = `CASE
  WHEN EXISTS (SELECT 1 FROM leases l WHERE l.client_id = c.id AND l.estado = 'vigente') THEN 'arrendatario'
  WHEN EXISTS (SELECT 1 FROM leases l WHERE l.client_id = c.id) THEN 'ex arrendatario'
  ELSE 'interesado' END`;

export function listarClientes() {
  return all(`
    SELECT c.id, c.tipo, c.rut, c.nombre, c.apellido, c.correo, c.telefono, c.tipo_interes, c.created_at,
           ${ETAPA} AS etapa,
           (SELECT COUNT(*) FROM inquiries i WHERE i.client_id = c.id) AS consultas,
           (SELECT COUNT(*) FROM leases l WHERE l.client_id = c.id) AS contratos,
           COALESCE((SELECT SUM(d.deuda) FROM v_lease_debt d JOIN leases l ON l.id = d.lease_id
                      WHERE l.client_id = c.id AND l.moneda = 'CLP'), 0) AS deuda_clp,
           COALESCE((SELECT SUM(d.deuda) FROM v_lease_debt d JOIN leases l ON l.id = d.lease_id
                      WHERE l.client_id = c.id AND l.moneda = 'UF'), 0) AS deuda_uf
      FROM clients c
     ORDER BY c.created_at DESC, c.id DESC
  `);
}

export function verCliente(id) {
  const cliente = get(`SELECT c.*, ${ETAPA} AS etapa FROM clients c WHERE c.id = ?`, [Number(id)]);
  if (!cliente) throw error('El cliente no existe', 404);
  cliente.consultas = all(
    `SELECT i.id, i.mensaje, i.origen, i.created_at, p.titulo AS propiedad
       FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id
      WHERE i.client_id = ? ORDER BY i.created_at DESC`,
    [cliente.id]
  );
  cliente.contratos = all(
    `SELECT l.id, l.codigo, l.concepto, l.renta_monto, l.moneda, l.estado, l.fecha_inicio, l.fecha_termino,
            l.dia_vencimiento, p.titulo AS propiedad, p.direccion, p.comuna,
            COALESCE(d.deuda, 0) AS deuda, COALESCE(d.cargos_impagos, 0) AS cargos_impagos
       FROM leases l
       JOIN properties p ON p.id = l.property_id
       LEFT JOIN v_lease_debt d ON d.lease_id = l.id
      WHERE l.client_id = ? ORDER BY l.estado, l.fecha_inicio DESC`,
    [cliente.id]
  );
  return cliente;
}

function datosDeCliente(entrada, actual = {}) {
  const texto = (v) => (v === undefined ? undefined : String(v ?? '').trim() || null);
  const datos = {
    tipo: entrada.tipo ?? actual.tipo ?? 'persona',
    rut: entrada.rut === undefined ? actual.rut ?? null : texto(entrada.rut) && normalizarRut(entrada.rut),
    nombre: texto(entrada.nombre) ?? actual.nombre,
    apellido: texto(entrada.apellido) ?? actual.apellido ?? null,
    correo: entrada.correo === undefined ? actual.correo ?? null : texto(entrada.correo)?.toLowerCase() ?? null,
    telefono: entrada.telefono === undefined ? actual.telefono ?? null : texto(entrada.telefono),
    notas: texto(entrada.notas) ?? actual.notas ?? null,
  };
  if (!['persona', 'empresa'].includes(datos.tipo)) throw error('El tipo va como persona o empresa');
  if (!datos.nombre) throw error('El nombre es obligatorio');
  if (datos.rut && !rutValido(datos.rut)) {
    throw error('El RUT no es válido: revisa el dígito verificador');
  }
  if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) throw error('El correo no es válido');
  if (!datos.correo && !datos.telefono) throw error('Necesita correo o teléfono: sin eso no hay cómo contactarlo');
  if (datos.rut) {
    const otro = get('SELECT id, nombre FROM clients WHERE rut = ? AND id <> ?', [datos.rut, actual.id ?? 0]);
    if (otro) throw error(`Ese RUT ya es de ${otro.nombre}`, 409);
  }
  return datos;
}

export function crearCliente(entrada = {}) {
  const d = datosDeCliente(entrada);
  const id = run(
    `INSERT INTO clients (tipo, rut, nombre, apellido, correo, telefono, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [d.tipo, d.rut, d.nombre, d.apellido, d.correo, d.telefono, d.notas]
  );
  return verCliente(id);
}

export function actualizarCliente(id, entrada = {}) {
  const actual = get('SELECT * FROM clients WHERE id = ?', [Number(id)]);
  if (!actual) throw error('El cliente no existe', 404);
  const d = datosDeCliente(entrada, actual);
  run(
    `UPDATE clients SET tipo = ?, rut = ?, nombre = ?, apellido = ?, correo = ?, telefono = ?, notas = ?
      WHERE id = ?`,
    [d.tipo, d.rut, d.nombre, d.apellido, d.correo, d.telefono, d.notas, actual.id]
  );
  return verCliente(actual.id);
}
