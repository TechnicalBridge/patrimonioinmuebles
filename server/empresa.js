// Quien es Patrimonio Inmuebles cuando habla con otro sistema.
//
// El RUT es lo que la identifica como acreedora fuera de aqui: es la llave con
// la que APOFYX la busca en su CRM y con la que DataBridge le atribuye los
// pagos. Por eso vive en un solo lugar y no repartido por el codigo.
//
// Empresa ficticia, proyecto de Capstone.

export const EMPRESA = {
  rut: '76418902-7',
  razon_social: 'Patrimonio Inmuebles SpA',
  nombre_fantasia: 'Patrimonio Inmuebles',
  direccion: 'Av. Nueva Costanera 3750, oficina 402',
  comuna: 'Vitacura',
  ciudad: 'Santiago',
  telefono: '+56 2 2345 6700',
  correo: 'contacto@patrimonioinmuebles.cl',
};

// A quien se le entrega la cartera morosa. Vacio = Patrimonio cobra solo, y el
// sitio simplemente no muestra las funciones de cobranza externa (regla R5 del
// contrato de integracion).
export const COBRANZA = {
  agencia_rut: process.env.COBRANZA_AGENCIA_RUT || '77305118-6', // APOFYX
  agencia_nombre: 'APOFYX',
  // Sin URL, la cartera se descarga como archivo en vez de enviarse.
  url: process.env.COBRANZA_URL || '',
  clave: process.env.COBRANZA_CLAVE || '',
};
