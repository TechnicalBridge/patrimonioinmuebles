import InquiryForm from '../components/InquiryForm.jsx';

export default function Contact() {
  return (
    <section className="section page">
      <div className="container contact-grid">
        <div>
          <p className="kicker">Contacto</p>
          <h1>Deja tu nombre, teléfono y correo.</h1>
          <p className="lead tight">
            Un asesor te contacta en el mismo día hábil. Tus datos se guardan en la
            base de la corredora para dar seguimiento.
          </p>
          <ul className="contact-list">
            <li>
              <span>Teléfono</span>
              <a href="tel:+56223456700">+56 2 2345 6700</a>
            </li>
            <li>
              <span>Correo</span>
              <a href="mailto:contacto@patrimonioinmuebles.cl">contacto@patrimonioinmuebles.cl</a>
            </li>
            <li>
              <span>Oficina</span>
              Av. Nueva Costanera 3750, oficina 402, Vitacura, Santiago
            </li>
            <li>
              <span>Horario</span>
              Lun–Vie 9:00 a 19:00 · Sáb 10:00 a 14:00
            </li>
          </ul>
        </div>
        <div className="side">
          <InquiryForm origen="contacto" />
        </div>
      </div>
    </section>
  );
}
