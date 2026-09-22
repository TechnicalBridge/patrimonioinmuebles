import { useState } from 'react';
import { sendInquiry } from '../api.js';

const empty = {
  nombre: '',
  apellido: '',
  correo: '',
  telefono: '',
  tipo_interes: 'comprar',
  presupuesto: '',
  mensaje: '',
};

export default function InquiryForm({ propertyId = null, origen = 'web' }) {
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [sending, setSending] = useState(false);

  function update(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSending(true);
    setStatus({ type: '', text: '' });
    try {
      const res = await sendInquiry({
        ...form,
        property_id: propertyId,
        origen,
      });
      setStatus({ type: 'ok', text: res.message });
      setForm(empty);
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="grid-2">
        <label>
          Nombre
          <input name="nombre" value={form.nombre} onChange={update} required />
        </label>
        <label>
          Apellido
          <input name="apellido" value={form.apellido} onChange={update} />
        </label>
      </div>
      <div className="grid-2">
        <label>
          Correo
          <input
            type="email"
            name="correo"
            value={form.correo}
            onChange={update}
            required
            placeholder="tu@correo.com"
          />
        </label>
        <label>
          Teléfono
          <input
            name="telefono"
            value={form.telefono}
            onChange={update}
            required
            placeholder="+56 9 1234 5678"
          />
        </label>
      </div>
      <div className="grid-2">
        <label>
          Interés
          <select name="tipo_interes" value={form.tipo_interes} onChange={update}>
            <option value="comprar">Comprar</option>
            <option value="arrendar">Arrendar</option>
            <option value="vender">Vender mi propiedad</option>
            <option value="invertir">Invertir</option>
            <option value="asesoria">Asesoría</option>
          </select>
        </label>
        <label>
          Presupuesto
          <input
            name="presupuesto"
            value={form.presupuesto}
            onChange={update}
            placeholder="Ej. UF 8.000 a 12.000"
          />
        </label>
      </div>
      <label>
        Mensaje
        <textarea
          name="mensaje"
          rows="4"
          value={form.mensaje}
          onChange={update}
          placeholder="Cuéntanos qué buscas o qué propiedad te interesa."
        />
      </label>
      {status.text && <p className={`alert ${status.type}`}>{status.text}</p>}
      <button className="btn" type="submit" disabled={sending}>
        {sending ? 'Enviando…' : 'Enviar datos'}
      </button>
    </form>
  );
}
