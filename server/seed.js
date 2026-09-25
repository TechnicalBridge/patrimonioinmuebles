// Datos de demostracion. La empresa, las personas y las propiedades son
// ficticias; las comunas y calles son reales solo para que la ficha se lea
// como una de verdad.
//
// Convenciones chilenas:
//   - La venta se publica en UF y el arriendo residencial en pesos (CLP).
//     El arriendo comercial se pacta en UF, como es habitual.
//   - Una parcela de agrado no puede tener menos de 5.000 m² (DL 3.516).

const agents = [
  {
    nombre: 'Elena',
    apellido: 'Vargas Mendoza',
    correo: 'elena.vargas@patrimonioinmuebles.cl',
    telefono: '+56 9 8123 4401',
    cargo: 'Directora general',
    especialidad: 'Casas de alto valor',
    bio: 'Dirige Patrimonio Inmuebles desde 2011. Especialista en casas de alto valor en Vitacura, Lo Barnechea y Las Condes.',
  },
  {
    nombre: 'Mateo',
    apellido: 'Ruiz Alarcón',
    correo: 'mateo.ruiz@patrimonioinmuebles.cl',
    telefono: '+56 9 8123 4402',
    cargo: 'Asesor residencial',
    especialidad: 'Casas y departamentos',
    bio: 'Acompaña a familias que buscan su siguiente casa o departamento en Providencia, Ñuñoa, Las Condes y Santiago Centro.',
  },
  {
    nombre: 'Camila',
    apellido: 'Herrera Solís',
    correo: 'camila.herrera@patrimonioinmuebles.cl',
    telefono: '+56 9 8123 4403',
    cargo: 'Asesora de segunda vivienda',
    especialidad: 'Costa y lagos',
    bio: 'Trabaja inventario en Reñaca, Concón y Pucón para compradores de Santiago y del extranjero.',
  },
  {
    nombre: 'Andrés',
    apellido: 'Beltrán Ortiz',
    correo: 'andres.beltran@patrimonioinmuebles.cl',
    telefono: '+56 9 8123 4404',
    cargo: 'Asesor de inversión',
    especialidad: 'Locales y parcelas',
    bio: 'Estructura operaciones de locales, oficinas y parcelas para inversionistas que buscan arriendo o plusvalía.',
  },
];

const properties = [
  {
    titulo: 'Residencia Los Olivos',
    slug: 'residencia-los-olivos-vitacura',
    descripcion:
      'Casa contemporánea en Santa María de Manquehue, con espejo de agua, doble altura y jardín con olivos. Terminaciones en piedra caliza, nogal y bronce. Orientación norte y vista al cerro Manquehue.',
    tipo: 'casa',
    operacion: 'venta',
    precio: 58000,
    moneda: 'UF',
    dormitorios: 5,
    banos: 6,
    estacionamientos: 4,
    m2_utiles: 780,
    m2_terreno: 920,
    direccion: 'Santa María de Manquehue 1280',
    comuna: 'Vitacura',
    ciudad: 'Santiago',
    region: 'Región Metropolitana',
    equipamiento: ['Piscina', 'Jardín', 'Cava', 'Gimnasio', 'Dormitorio y baño de servicio', 'Domótica'],
    imagenes: ['/images/vitacura.jpg', '/images/cocina.jpg', '/images/dormitorio.jpg', '/images/bano.jpg'],
    destacado: 1,
    agent_id: 1,
  },
  {
    titulo: 'Casa Cantera',
    slug: 'casa-cantera-la-serena',
    descripcion:
      'Casona restaurada en el centro histórico de La Serena. Patio con pileta, vigas a la vista y terraza con vista a los campanarios. Está dentro de la zona típica, así que cualquier cambio de fachada pasa por el Consejo de Monumentos Nacionales.',
    tipo: 'casa',
    operacion: 'venta',
    precio: 19500,
    moneda: 'UF',
    dormitorios: 4,
    banos: 4,
    estacionamientos: 2,
    m2_utiles: 420,
    m2_terreno: 510,
    direccion: 'Cordovez 450',
    comuna: 'La Serena',
    ciudad: 'La Serena',
    region: 'Región de Coquimbo',
    equipamiento: ['Patio central', 'Terraza', 'Chimenea', 'Bodega', 'Escritorio'],
    imagenes: ['/images/la-serena.jpg', '/images/dormitorio.jpg', '/images/cocina.jpg'],
    destacado: 1,
    agent_id: 1,
  },
  {
    titulo: 'Casa del Lago',
    slug: 'casa-del-lago-pucon',
    descripcion:
      'Casa de piedra y madera en la ladera, con terraza amplia frente al lago Villarrica y vista a la cordillera. Pensada para fines de semana largos o para arriendo por temporada.',
    tipo: 'casa',
    operacion: 'venta',
    precio: 29000,
    moneda: 'UF',
    dormitorios: 4,
    banos: 5,
    estacionamientos: 3,
    m2_utiles: 390,
    m2_terreno: 1800,
    direccion: 'Camino Pucón–Villarrica km 6',
    comuna: 'Pucón',
    ciudad: 'Pucón',
    region: 'Región de La Araucanía',
    equipamiento: ['Terraza', 'Quincho', 'Bosque', 'Chimenea', 'Muelle compartido'],
    imagenes: ['/images/pucon.jpg', '/images/bano.jpg', '/images/dormitorio.jpg'],
    destacado: 1,
    agent_id: 3,
  },
  {
    titulo: 'Penthouse Pacífico',
    slug: 'penthouse-pacifico-renaca',
    descripcion:
      'Penthouse con terraza perimetral, piscina propia y vista a la bahía de Reñaca. Terminaciones claras, cocina equipada y dormitorio principal en suite con walk-in closet.',
    tipo: 'departamento',
    operacion: 'venta',
    precio: 32000,
    moneda: 'UF',
    dormitorios: 3,
    banos: 3,
    estacionamientos: 2,
    m2_utiles: 310,
    m2_terreno: 0,
    direccion: 'Av. Borgoño 15200',
    comuna: 'Viña del Mar',
    ciudad: 'Viña del Mar',
    region: 'Región de Valparaíso',
    equipamiento: ['Piscina privada', 'Terraza', 'Gimnasio del edificio', 'Conserjería 24 h', 'Bodega'],
    imagenes: ['/images/renaca.jpg', '/images/dormitorio.jpg', '/images/bano.jpg'],
    destacado: 1,
    agent_id: 3,
  },
  {
    titulo: 'Casa Piedra Volcánica',
    slug: 'casa-piedra-volcanica-la-dehesa',
    descripcion:
      'Casa de volúmenes de hormigón y piedra volcánica en La Dehesa. Jardín de agaves y especies de secano, dormitorio principal en primer piso y escritorio independiente.',
    tipo: 'casa',
    operacion: 'venta',
    precio: 42000,
    moneda: 'UF',
    dormitorios: 4,
    banos: 5,
    estacionamientos: 4,
    m2_utiles: 640,
    m2_terreno: 1100,
    direccion: 'Camino La Dehesa 2400',
    comuna: 'Lo Barnechea',
    ciudad: 'Santiago',
    region: 'Región Metropolitana',
    equipamiento: ['Jardín de secano', 'Escritorio', 'Sala de cine', 'Piscina temperada', 'Seguridad 24 h'],
    imagenes: ['/images/la-dehesa.jpg', '/images/cocina.jpg', '/images/dormitorio.jpg'],
    destacado: 0,
    agent_id: 2,
  },
  {
    titulo: 'Departamento Parque Forestal',
    slug: 'departamento-parque-forestal',
    descripcion:
      'Departamento en edificio de los años 40, restaurado, con cielos altos, piso de parquet y balcón hacia el Parque Forestal. Se arrienda amoblado.',
    tipo: 'departamento',
    operacion: 'arriendo',
    precio: 1250000,
    moneda: 'CLP',
    dormitorios: 2,
    banos: 2,
    estacionamientos: 1,
    m2_utiles: 128,
    m2_terreno: 0,
    direccion: 'Ismael Valdés Vergara 340',
    comuna: 'Santiago',
    ciudad: 'Santiago',
    region: 'Región Metropolitana',
    equipamiento: ['Balcón', 'Amoblado', 'Terraza común', 'Bodega'],
    imagenes: ['/images/parque-forestal.jpg', '/images/cocina.jpg', '/images/bano.jpg'],
    destacado: 1,
    agent_id: 2,
  },
  {
    titulo: 'Penthouse Nueva Las Condes',
    slug: 'penthouse-nueva-las-condes',
    descripcion:
      'Penthouse con vista a la cordillera y a toda la ciudad. Planta libre, cocina integrada y terraza con quincho.',
    tipo: 'departamento',
    operacion: 'venta',
    precio: 21500,
    moneda: 'UF',
    dormitorios: 3,
    banos: 3,
    estacionamientos: 2,
    m2_utiles: 210,
    m2_terreno: 0,
    direccion: 'Av. Presidente Riesco 5500',
    comuna: 'Las Condes',
    ciudad: 'Santiago',
    region: 'Región Metropolitana',
    equipamiento: ['Terraza con quincho', 'Gimnasio', 'Sala multiuso', 'Conserjería 24 h'],
    imagenes: ['/images/las-condes.jpg', '/images/cocina.jpg', '/images/dormitorio.jpg'],
    destacado: 0,
    agent_id: 2,
  },
  {
    titulo: 'Local Barrio Italia',
    slug: 'local-barrio-italia',
    descripcion:
      'Local a nivel de calle en Barrio Italia, doble altura y fachada vidriada. Uso comercial, ideal para restaurante, galería o showroom. La patente comercial la tramita el arrendatario.',
    tipo: 'local',
    operacion: 'arriendo',
    precio: 95,
    moneda: 'UF',
    dormitorios: 0,
    banos: 2,
    estacionamientos: 0,
    m2_utiles: 186,
    m2_terreno: 0,
    direccion: 'Av. Italia 1180',
    comuna: 'Providencia',
    ciudad: 'Santiago',
    region: 'Región Metropolitana',
    equipamiento: ['Doble altura', 'Vitrina a la calle', 'Bodega trasera', 'Baño de personal'],
    imagenes: ['/images/barrio-italia.jpg'],
    destacado: 0,
    agent_id: 4,
  },
  {
    titulo: 'Parcela Loma Alta',
    slug: 'parcela-loma-alta-pirque',
    descripcion:
      'Parcela de agrado de 5.000 m² con vista al valle, portón de acceso controlado y factibilidad de luz y agua. A 12 minutos de la plaza de Pirque.',
    tipo: 'terreno',
    operacion: 'venta',
    precio: 6500,
    moneda: 'UF',
    dormitorios: 0,
    banos: 0,
    estacionamientos: 0,
    m2_utiles: 0,
    m2_terreno: 5000,
    direccion: 'Camino El Principal, parcela 14',
    comuna: 'Pirque',
    ciudad: 'Pirque',
    region: 'Región Metropolitana',
    equipamiento: ['Vista panorámica', 'Camino de ripio', 'Rol propio', 'Factibilidad de luz y agua'],
    imagenes: ['/images/pirque.jpg'],
    destacado: 0,
    agent_id: 4,
  },
];

// =============================================================================
//  ADMINISTRACION DE ARRIENDOS
//
//  Estas propiedades NO se publican: estan arrendadas y Patrimonio les cobra el
//  arriendo mes a mes por cuenta del propietario. De aqui sale la cartera
//  morosa que se le entrega a APOFYX.
//
//  Los cinco primeros contratos son los del ejemplo del contrato de
//  integracion (TB_web/docs/integracion/ejemplos/cartera-v1.patrimonio.json):
//  sus deudas salen exactamente iguales en la cartera del 2026-09-18. Los
//  otros cinco son el resto de los clientes de la demo, los mismos que tienen
//  APOFYX y DataBridge, cada uno en una situacion distinta:
//
//    Rodrigo       debe cuatro meses; no ha hecho nada
//    Carolina      debe dos; en DataBridge pagara todo de una vez
//    La Espiga     local comercial en UF, debe tres; pagara en cuotas
//    Ignacio       dejo el departamento en agosto debiendo tres meses: su
//                  contrato termino, y por eso no vuelve en la cartera de
//                  septiembre (se entrego en la de agosto)
//    Daniela       debe tres; pagara un convenio completo
// =============================================================================

const administradas = [
  {
    titulo: 'Depto 1204 Irarrázaval', slug: 'admin-depto-1204-irarrazaval',
    tipo: 'departamento', operacion: 'arriendo', precio: 520000, moneda: 'CLP',
    dormitorios: 2, banos: 1, estacionamientos: 1, m2_utiles: 62,
    direccion: 'Depto 1204, Av. Irarrázaval 2450',
    comuna: 'Ñuñoa', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 2,
  },
  {
    titulo: 'Depto 305 Los Leones', slug: 'admin-depto-305-los-leones',
    tipo: 'departamento', operacion: 'arriendo', precio: 410000, moneda: 'CLP',
    dormitorios: 1, banos: 1, estacionamientos: 0, m2_utiles: 45,
    direccion: 'Depto 305, Los Leones 1180',
    comuna: 'Providencia', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 2,
  },
  {
    titulo: 'Local 3 Av. Italia', slug: 'admin-local-3-av-italia',
    tipo: 'local', operacion: 'arriendo', precio: 38.5, moneda: 'UF',
    dormitorios: 0, banos: 1, estacionamientos: 0, m2_utiles: 74,
    direccion: 'Local 3, Av. Italia 1320',
    comuna: 'Providencia', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 4,
  },
  {
    titulo: 'Casa Los Castaños', slug: 'admin-casa-los-castanos',
    tipo: 'casa', operacion: 'arriendo', precio: 680000, moneda: 'CLP',
    dormitorios: 3, banos: 2, estacionamientos: 2, m2_utiles: 110,
    direccion: 'Los Castaños 455',
    comuna: 'La Florida', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 2,
  },
  {
    titulo: 'Depto 802 Bilbao', slug: 'admin-depto-802-bilbao',
    tipo: 'departamento', operacion: 'arriendo', precio: 590000, moneda: 'CLP',
    dormitorios: 2, banos: 2, estacionamientos: 1, m2_utiles: 71,
    direccion: 'Depto 802, Av. Bilbao 3120',
    comuna: 'Providencia', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 2,
  },
  {
    titulo: 'Depto 1507 Santa Isabel', slug: 'admin-depto-1507-santa-isabel',
    tipo: 'departamento', operacion: 'arriendo', precio: 450000, moneda: 'CLP',
    dormitorios: 2, banos: 1, estacionamientos: 0, m2_utiles: 58,
    direccion: 'Depto 1507, Santa Isabel 470',
    comuna: 'Santiago', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 2,
  },
  {
    titulo: 'Depto 42 Pajaritos', slug: 'admin-depto-42-pajaritos',
    tipo: 'departamento', operacion: 'arriendo', precio: 380000, moneda: 'CLP',
    dormitorios: 2, banos: 1, estacionamientos: 1, m2_utiles: 52,
    direccion: 'Depto 42, Av. Pajaritos 2810',
    comuna: 'Maipú', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 2,
  },
  {
    titulo: 'Local 12 Gran Avenida', slug: 'admin-local-12-gran-avenida',
    tipo: 'local', operacion: 'arriendo', precio: 24, moneda: 'UF',
    dormitorios: 0, banos: 1, estacionamientos: 0, m2_utiles: 68,
    direccion: 'Local 12, Gran Avenida José Miguel Carrera 5540',
    comuna: 'San Miguel', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 4,
  },
  {
    titulo: 'Depto 204 Portugal', slug: 'admin-depto-204-portugal',
    tipo: 'departamento', operacion: 'arriendo', precio: 350000, moneda: 'CLP',
    dormitorios: 1, banos: 1, estacionamientos: 0, m2_utiles: 38,
    direccion: 'Depto 204, Portugal 48',
    comuna: 'Santiago', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 2,
  },
  {
    titulo: 'Depto 713 Vicuña Mackenna', slug: 'admin-depto-713-vicuna-mackenna',
    tipo: 'departamento', operacion: 'arriendo', precio: 300000, moneda: 'CLP',
    dormitorios: 2, banos: 1, estacionamientos: 0, m2_utiles: 55,
    direccion: 'Depto 713, Av. Vicuña Mackenna 4860',
    comuna: 'Macul', ciudad: 'Santiago', region: 'Región Metropolitana', agent_id: 2,
  },
];

const arrendatarios = [
  { rut: '16482337-7', tipo: 'persona', nombre: 'Felipe Rojas Muñoz',
    correo: 'felipe.rojas@correo.cl', telefono: '+56987654321' },
  { rut: '18905214-6', tipo: 'persona', nombre: 'Valentina Soto Pizarro',
    correo: 'valentina.soto@correo.cl', telefono: '+56912348765' },
  // Sin telefono a proposito: el codigo de acceso le llegara por un solo canal.
  { rut: '76991245-2', tipo: 'empresa', nombre: 'Comercial Ñandú SpA',
    correo: 'administracion@nandu.cl', telefono: null },
  { rut: '15227640-0', tipo: 'persona', nombre: 'Tomás Fuentes Leiva',
    correo: 'tomas.fuentes@correo.cl', telefono: '+56955512340',
    notas: 'Se puso al día pagando en la oficina el 10-09-2026.' },
  { rut: '17654321-3', tipo: 'persona', nombre: 'Josefa Alcaíno Ruiz',
    correo: 'josefa.alcaino@correo.cl', telefono: '+56933221100' },
  { rut: '14583206-3', tipo: 'persona', nombre: 'Rodrigo Pérez Contreras',
    correo: 'rodrigo.perez@correo.cl', telefono: '+56961238890' },
  { rut: '19230418-0', tipo: 'persona', nombre: 'Carolina Muñoz Vera',
    correo: 'carolina.munoz@correo.cl', telefono: '+56978812034' },
  { rut: '76284519-9', tipo: 'empresa', nombre: 'Panadería La Espiga Ltda.',
    correo: 'contacto@laespiga.cl', telefono: '+56229876543' },
  { rut: '17893456-2', tipo: 'persona', nombre: 'Ignacio Tapia Rojas',
    correo: 'ignacio.tapia@correo.cl', telefono: '+56987120045',
    notas: 'Entrego el departamento el 31-08-2026 debiendo junio, julio y agosto.' },
  { rut: '18642975-3', tipo: 'persona', nombre: 'Daniela Cáceres Flores',
    correo: 'daniela.caceres@correo.cl', telefono: '+56954410987' },
];

// El orden importa: es el orden en que salen las deudas en la cartera.
const contratos = [
  {
    codigo: 'CTR-2025-014', propiedad: 1, arrendatario: 1,
    concepto: 'Arriendo mensual', fecha_inicio: '2025-03-05',
    renta_monto: 520000, moneda: 'CLP',
    cargos: [
      { periodo: '2026-07', pagado: { fecha: '2026-07-20', medio: 'transferencia' } },
      { periodo: '2026-08', pagado: null },
      { periodo: '2026-09', pagado: null },
    ],
  },
  {
    codigo: 'CTR-2026-031', propiedad: 2, arrendatario: 2,
    concepto: 'Arriendo mensual', fecha_inicio: '2026-04-05',
    renta_monto: 410000, moneda: 'CLP',
    cargos: [
      { periodo: '2026-07', pagado: { fecha: '2026-07-06', medio: 'transferencia' } },
      { periodo: '2026-08', pagado: { fecha: '2026-08-10', medio: 'transferencia' } },
      { periodo: '2026-09', pagado: null },
    ],
  },
  {
    codigo: 'CTR-2024-007', propiedad: 3, arrendatario: 3,
    concepto: 'Arriendo local comercial', fecha_inicio: '2024-08-05',
    renta_monto: 38.5, moneda: 'UF',
    cargos: [
      { periodo: '2026-07', pagado: null },
      { periodo: '2026-08', pagado: null },
      { periodo: '2026-09', pagado: null },
    ],
  },
  {
    // Estaba en la cartera de agosto y se puso al dia pagando en la oficina.
    // Por eso en la cartera de septiembre sale como retiro, no como deuda.
    codigo: 'CTR-2025-022', propiedad: 4, arrendatario: 4,
    concepto: 'Arriendo mensual', fecha_inicio: '2025-06-05',
    renta_monto: 680000, moneda: 'CLP',
    cargos: [
      { periodo: '2026-07', pagado: { fecha: '2026-09-10', medio: 'efectivo' } },
      { periodo: '2026-08', pagado: { fecha: '2026-09-10', medio: 'efectivo' } },
      { periodo: '2026-09', pagado: { fecha: '2026-09-10', medio: 'efectivo' } },
    ],
  },
  {
    codigo: 'CTR-2026-008', propiedad: 5, arrendatario: 5,
    concepto: 'Arriendo mensual', fecha_inicio: '2026-01-05',
    renta_monto: 590000, moneda: 'CLP',
    cargos: [
      { periodo: '2026-07', pagado: { fecha: '2026-07-05', medio: 'transferencia' } },
      { periodo: '2026-08', pagado: { fecha: '2026-08-05', medio: 'transferencia' } },
      { periodo: '2026-09', pagado: { fecha: '2026-09-04', medio: 'transferencia' } },
    ],
  },
  {
    codigo: 'CTR-2025-019', propiedad: 6, arrendatario: 6,
    concepto: 'Arriendo mensual', fecha_inicio: '2025-04-05',
    renta_monto: 450000, moneda: 'CLP',
    cargos: [
      { periodo: '2026-05', pagado: { fecha: '2026-05-06', medio: 'transferencia' } },
      { periodo: '2026-06', pagado: null },
      { periodo: '2026-07', pagado: null },
      { periodo: '2026-08', pagado: null },
      { periodo: '2026-09', pagado: null },
    ],
  },
  {
    codigo: 'CTR-2026-012', propiedad: 7, arrendatario: 7,
    concepto: 'Arriendo mensual', fecha_inicio: '2026-02-05',
    renta_monto: 380000, moneda: 'CLP',
    cargos: [
      { periodo: '2026-07', pagado: { fecha: '2026-07-06', medio: 'transferencia' } },
      { periodo: '2026-08', pagado: null },
      { periodo: '2026-09', pagado: null },
    ],
  },
  {
    codigo: 'CTR-2024-019', propiedad: 8, arrendatario: 8,
    concepto: 'Arriendo local comercial', fecha_inicio: '2024-03-05',
    renta_monto: 24, moneda: 'UF',
    cargos: [
      { periodo: '2026-06', pagado: { fecha: '2026-06-10', medio: 'transferencia' } },
      { periodo: '2026-07', pagado: null },
      { periodo: '2026-08', pagado: null },
      { periodo: '2026-09', pagado: null },
    ],
  },
  {
    // Termino el 31 de agosto. La cartera de septiembre solo mira contratos
    // vigentes, asi que su deuda sigue en cobranza con lo que se entrego en
    // agosto, sin reenviarse.
    codigo: 'CTR-2025-027', propiedad: 9, arrendatario: 9,
    concepto: 'Arriendo mensual', fecha_inicio: '2025-09-05', fecha_termino: '2026-08-31', estado: 'terminado',
    renta_monto: 350000, moneda: 'CLP',
    cargos: [
      { periodo: '2026-05', pagado: { fecha: '2026-05-05', medio: 'transferencia' } },
      { periodo: '2026-06', pagado: null },
      { periodo: '2026-07', pagado: null },
      { periodo: '2026-08', pagado: null },
    ],
  },
  {
    codigo: 'CTR-2026-015', propiedad: 10, arrendatario: 10,
    concepto: 'Arriendo mensual', fecha_inicio: '2026-01-05',
    renta_monto: 300000, moneda: 'CLP',
    cargos: [
      { periodo: '2026-06', pagado: { fecha: '2026-06-05', medio: 'transferencia' } },
      { periodo: '2026-07', pagado: null },
      { periodo: '2026-08', pagado: null },
      { periodo: '2026-09', pagado: null },
    ],
  },
];

// La cartera del mes pasado, ya enviada. Existe para que el retiro de
// CTR-2025-022 tenga contra que compararse: solo se retira lo que antes se
// entrego.
const loteAnterior = {
  id_externo: 'PAT-2026-08-18-01',
  fecha_corte: '2026-08-18',
  estado: 'aceptado',
  enviado_en: '2026-08-18T10:05:00-04:00',
  items: [
    { contrato: 'CTR-2025-014', monto_enviado: 520000, moneda: 'CLP' },
    { contrato: 'CTR-2024-007', monto_enviado: 77, moneda: 'UF' },
    { contrato: 'CTR-2025-022', monto_enviado: 1360000, moneda: 'CLP' },
    { contrato: 'CTR-2025-019', monto_enviado: 1350000, moneda: 'CLP' },
    { contrato: 'CTR-2026-012', monto_enviado: 380000, moneda: 'CLP' },
    { contrato: 'CTR-2024-019', monto_enviado: 48, moneda: 'UF' },
    { contrato: 'CTR-2025-027', monto_enviado: 1050000, moneda: 'CLP' },
    { contrato: 'CTR-2026-015', monto_enviado: 600000, moneda: 'CLP' },
  ],
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const sampleClients = [
  {
    nombre: 'Lucía',
    apellido: 'Navarro Peña',
    correo: 'lucia.navarro@correo.com',
    telefono: '+56 9 1840 2291',
    tipo_interes: 'comprar',
    presupuesto: 'UF 45.000 a 60.000',
    notas: 'Busca casa en Vitacura o Lo Barnechea para vivir con su familia.',
    property_id: 1,
    mensaje: 'Quisiera agendar una visita a la Residencia Los Olivos el próximo sábado.',
    origen: 'web',
  },
  {
    nombre: 'Jorge',
    apellido: 'Salinas Duarte',
    correo: 'jorge.salinas@empresa.cl',
    telefono: '+56 9 2109 7740',
    tipo_interes: 'invertir',
    presupuesto: 'hasta UF 35.000',
    notas: 'Inversionista de Concepción. Le interesa la costa y el arriendo por temporada.',
    property_id: 4,
    mensaje: '¿El penthouse de Reñaca se puede arrendar por temporada? Necesito una rentabilidad estimada.',
    origen: 'web',
  },
  {
    nombre: 'Mariana',
    apellido: 'Ortiz Vega',
    correo: 'mariana.ortiz@gmail.com',
    telefono: '+56 9 3901 6628',
    tipo_interes: 'arrendar',
    presupuesto: '$1.100.000 a $1.400.000 al mes',
    notas: 'Se muda a Santiago por trabajo. Prefiere Santiago Centro o Providencia.',
    property_id: 6,
    mensaje: '¿El departamento del Parque Forestal sigue disponible para octubre?',
    origen: 'web',
  },
];

/**
 * El sitio se siembra solo en una base vacia. Los arriendos, en cambio, se
 * revisan en cada arranque y se agrega el contrato de la demo que falte: asi
 * una base que ya existia recibe a los clientes nuevos sin perder nada de lo
 * que se cargo a mano.
 */
export function seedIfEmpty({ all, get, run }) {
  const existing = all('SELECT COUNT(*) AS n FROM properties')[0];
  if (existing?.n > 0) {
    sembrarArriendos({ get, run });
    return;
  }

  for (const a of agents) {
    run(
      `INSERT INTO agents (nombre, apellido, correo, telefono, cargo, especialidad, bio)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [a.nombre, a.apellido, a.correo, a.telefono, a.cargo, a.especialidad, a.bio]
    );
  }

  for (const p of properties) {
    run(
      `INSERT INTO properties (
        titulo, slug, descripcion, tipo, operacion, precio, moneda, dormitorios, banos,
        estacionamientos, m2_utiles, m2_terreno, direccion, comuna, ciudad,
        region, equipamiento, imagenes, destacado, estatus, agent_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disponible', ?)`,
      [
        p.titulo,
        p.slug,
        p.descripcion,
        p.tipo,
        p.operacion,
        p.precio,
        p.moneda,
        p.dormitorios,
        p.banos,
        p.estacionamientos,
        p.m2_utiles,
        p.m2_terreno,
        p.direccion,
        p.comuna,
        p.ciudad,
        p.region,
        JSON.stringify(p.equipamiento),
        JSON.stringify(p.imagenes),
        p.destacado,
        p.agent_id,
      ]
    );
  }

  for (const c of sampleClients) {
    const clientId = run(
      `INSERT INTO clients (nombre, apellido, correo, telefono, tipo_interes, presupuesto, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [c.nombre, c.apellido, c.correo, c.telefono, c.tipo_interes, c.presupuesto, c.notas]
    );
    run(
      `INSERT INTO inquiries (client_id, property_id, mensaje, origen) VALUES (?, ?, ?, ?)`,
      [clientId, c.property_id, c.mensaje, c.origen]
    );
  }

  sembrarArriendos({ get, run });
}

// -----------------------------------------------------------------------------
//  Administracion de arriendos
// -----------------------------------------------------------------------------
function sembrarArriendos({ get, run }) {
  // Las propiedades en administracion entran como 'arrendada', asi que no
  // aparecen en el sitio publico, que filtra por 'disponible'.
  const propiedadId = administradas.map((p) =>
    get('SELECT id FROM properties WHERE slug = ?', [p.slug])?.id ?? run(
      `INSERT INTO properties (
        titulo, slug, descripcion, tipo, operacion, precio, moneda, dormitorios, banos,
        estacionamientos, m2_utiles, m2_terreno, direccion, comuna, ciudad,
        region, equipamiento, imagenes, destacado, estatus, agent_id
      ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, '[]', '[]', 0, 'arrendada', ?)`,
      [
        p.titulo, p.slug, p.tipo, p.operacion, p.precio, p.moneda,
        p.dormitorios, p.banos, p.estacionamientos, p.m2_utiles,
        p.direccion, p.comuna, p.ciudad, p.region, p.agent_id,
      ]
    )
  );

  const arrendatarioId = arrendatarios.map((t) =>
    get('SELECT id FROM tenants WHERE rut = ?', [t.rut])?.id ?? run(
      `INSERT INTO tenants (rut, tipo, nombre, correo, telefono, notas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [t.rut, t.tipo, t.nombre, t.correo, t.telefono ?? null, t.notas ?? null]
    )
  );

  const contratoId = {};
  for (const c of contratos) {
    const existente = get('SELECT id FROM leases WHERE codigo = ?', [c.codigo]);
    if (existente) {
      contratoId[c.codigo] = existente.id;
      continue;
    }
    const id = run(
      `INSERT INTO leases (
         codigo, property_id, tenant_id, concepto, fecha_inicio, fecha_termino,
         renta_monto, moneda, dia_vencimiento, estado
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, ?)`,
      [
        c.codigo, propiedadId[c.propiedad - 1], arrendatarioId[c.arrendatario - 1],
        c.concepto, c.fecha_inicio, c.fecha_termino ?? null, c.renta_monto, c.moneda, c.estado ?? 'vigente',
      ]
    );
    contratoId[c.codigo] = id;

    for (const cargo of c.cargos) {
      const mes = Number(cargo.periodo.slice(5, 7));
      const cargoId = run(
        `INSERT INTO charges (lease_id, concepto, periodo, monto, fecha_vencimiento)
         VALUES (?, ?, ?, ?, ?)`,
        [id, `Arriendo ${MESES[mes - 1]}`, cargo.periodo, c.renta_monto, `${cargo.periodo}-05`]
      );
      if (cargo.pagado) {
        run(
          `INSERT INTO charge_payments (charge_id, monto, medio, pagado_en)
           VALUES (?, ?, ?, ?)`,
          [cargoId, c.renta_monto, cargo.pagado.medio, cargo.pagado.fecha]
        );
      }
    }
  }

  const loteId = get('SELECT id FROM collection_batches WHERE id_externo = ?', [loteAnterior.id_externo])?.id ?? run(
    `INSERT INTO collection_batches (id_externo, fecha_corte, estado, enviado_en)
     VALUES (?, ?, ?, ?)`,
    [loteAnterior.id_externo, loteAnterior.fecha_corte, loteAnterior.estado, loteAnterior.enviado_en]
  );
  for (const item of loteAnterior.items) {
    if (get('SELECT 1 AS hay FROM collection_batch_items WHERE batch_id = ? AND lease_id = ?',
      [loteId, contratoId[item.contrato]])) continue;
    run(
      `INSERT INTO collection_batch_items (batch_id, lease_id, accion, monto_enviado, moneda, resultado)
       VALUES (?, ?, 'registrar', ?, ?, 'registrada')`,
      [loteId, contratoId[item.contrato], item.monto_enviado, item.moneda]
    );
  }
}
