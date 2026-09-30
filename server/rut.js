// El RUT chileno: se guarda normalizado (sin puntos, con guion y la K
// mayuscula) y se valida con el modulo 11. Es la llave con la que un cliente
// se identifica fuera de Patrimonio: un RUT mal escrito se ve bien aqui y lo
// rechaza la agencia.

export function normalizarRut(valor) {
  const limpio = String(valor || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

export function digitoVerificador(cuerpo) {
  let suma = 0;
  let factor = 2;
  for (const digito of String(cuerpo).split('').reverse()) {
    suma += Number(digito) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}

export function rutValido(rut) {
  const m = /^(\d{7,8})-([\dK])$/.exec(rut || '');
  return Boolean(m) && digitoVerificador(m[1]) === m[2];
}
