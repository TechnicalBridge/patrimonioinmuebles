// Quien es Patrimonio Inmuebles cuando habla con otro sistema.
//
// El RUT es lo que la identifica como acreedora fuera de aqui: es la llave con
// la que la agencia de cobranza la busca y con la que la plataforma de pagos le
// atribuye los pagos. Por eso vive en un solo lugar y no repartido por el
// codigo.
//
// A quien le entrega la cartera no esta aqui: se conecta desde el panel, con
// cualquier agencia que hable el contrato de integracion (ver cobranza.js).
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
