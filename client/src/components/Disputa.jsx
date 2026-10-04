// En que va la disputa de un contrato: el arrendatario le dijo a la cobranza
// que la deuda no corresponde, y la agencia la revisa. Llega por los avisos.

const MOTIVOS = {
  no_reconoce: 'no reconoce la deuda',
  ya_pagada: 'dice que ya pagó',
  monto_incorrecto: 'dice que el monto no corresponde',
  otro: 'otro motivo',
};

export default function Disputa({ contrato: c }) {
  if (!c.disputa_estado) return null;
  if (c.disputa_estado === 'abierta') {
    return (
      <span className="disputa abierta" title={c.disputa_desde ? `Desde el ${c.disputa_desde}` : undefined}>
        En disputa{c.disputa_motivo ? `: ${MOTIVOS[c.disputa_motivo] || c.disputa_motivo}` : ''}
      </span>
    );
  }
  return (
    <span className="disputa">
      {c.disputa_estado === 'rechazada' ? 'Disputa rechazada: se sigue cobrando' : 'Disputa aceptada: fuera de cobranza'}
    </span>
  );
}
