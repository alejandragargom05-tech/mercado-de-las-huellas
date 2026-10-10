/* Mercado de las Huellas — lo que comparten todas las páginas: modo claro/oscuro, Instagram y el formulario
   «Sugiere un producto». Los enlaces y los identificadores del formulario viven en las constantes de aquí. */
var Comun = (function () {
  'use strict';

  var URL_INSTAGRAM = 'https://www.instagram.com/boliitattoo/'; // cambia aquí el enlace de Instagram

  /* Google Form que guarda las respuestas en Google Sheets.
     1) Pega el enlace de tu formulario (el de «Enviar», termina en /viewform): se convierte solo en /formResponse.
     2) En el formulario, menú ⋮ → «Obtener enlace prellenado», llena cada pregunta y copia los entry.NNNN del enlace. */
  var URL_FORMULARIO = 'ENLACE_DE_MI_FORMULARIO';
  var ENTRADAS = {            // pregunta -> identificador entry.* del formulario
    tipo: 'entry.TIPO',
    detalle: 'entry.DETALLE',
    especie: 'entry.ESPECIE',
    enlace: 'entry.ENLACE'
  };
  var MAX_DETALLE = 500;
  var TIPOS = ['Un producto que no encontré', 'Una tienda que falta', 'Un precio que no cuadra', 'Otra idea'];
  var ESPECIES = ['Gatos', 'Perros', 'Para los dos'];

  function urlEnvio() {
    var m = /^https:\/\/docs\.google\.com\/forms\/d\/(?:e\/)?([\w-]+)/.exec(URL_FORMULARIO);
    if (!m) return null;
    return 'https://docs.google.com/forms/d/' + (/\/d\/e\//.test(URL_FORMULARIO) ? 'e/' : '') + m[1] + '/formResponse';
  }
  function formularioListo() {
    return !!urlEnvio() && Object.keys(ENTRADAS).every(function (k) { return /^entry\.\d+$/.test(ENTRADAS[k]); });
  }

  var $ = function (id) { return document.getElementById(id); };
  function h(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(function (x) {
        if (x != null) n.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
      });
    }
    return n;
  }

  /* ---------- Instagram ---------- */
  [].forEach.call(document.querySelectorAll('[data-instagram]'), function (a) { a.href = URL_INSTAGRAM; });

  /* ---------- Modo claro / oscuro: abre en claro; si la persona elige oscuro, se recuerda ---------- */
  var interruptor = $('tema');
  function esOscuro() {
    return document.documentElement.dataset.tema === 'oscuro';
  }
  function pintarInterruptor() { if (interruptor) interruptor.setAttribute('aria-checked', String(esOscuro())); }
  if (interruptor) {
    interruptor.addEventListener('click', function () {
      var nuevo = esOscuro() ? 'claro' : 'oscuro';
      document.documentElement.dataset.tema = nuevo;
      try { localStorage.setItem('tema', nuevo); } catch (e) { /* sin almacenamiento: vale para esta visita */ }
      pintarInterruptor();
    });
    pintarInterruptor();
  }

  /* ---------- Formulario «Sugiere un producto» ---------- */
  var dialogo = null, formulario, cuerpo, abridor = null;

  function aviso(clase, titulo, texto) {
    return h('div', { 'class': 'aviso ' + clase, role: clase === 'aviso--error' ? 'alert' : 'status' },
      h('p', null, h('b', { texto: titulo })), h('p', { texto: texto }));
  }

  function construir() {
    var radiosTipo = TIPOS.map(function (t, i) {
      return h('label', { 'class': 'opcion' }, h('input', { type: 'radio', name: 'tipo', value: t, required: 'required', id: 'sug-tipo-' + i }), h('span', { texto: t }));
    });
    var selEspecie = h('select', { id: 'sug-especie', name: 'especie' }, h('option', { value: '', texto: 'Sin especificar' }),
      ESPECIES.map(function (e) { return h('option', { value: e, texto: e }); }));
    var detalle = h('textarea', { id: 'sug-detalle', name: 'detalle', rows: '5', maxlength: String(MAX_DETALLE), required: 'required', 'aria-describedby': 'sug-cuenta' });
    var cuenta = h('p', { 'class': 'apoyo cuenta', id: 'sug-cuenta', texto: '0 de ' + MAX_DETALLE + ' caracteres' });
    detalle.addEventListener('input', function () { cuenta.textContent = detalle.value.length + ' de ' + MAX_DETALLE + ' caracteres'; });
    var enlace = h('input', { id: 'sug-enlace', name: 'enlace', type: 'url', inputmode: 'url', placeholder: 'https://', autocomplete: 'off' });
    // Campo trampa: las personas no lo ven ni lo llenan; los bots sí.
    var trampa = h('div', { 'class': 'trampa', 'aria-hidden': 'true' },
      h('label', { 'for': 'sug-web', texto: 'No llenes este campo' }), h('input', { id: 'sug-web', name: 'sitio_web', type: 'text', tabindex: '-1', autocomplete: 'off' }));
    var cerrar = h('button', { 'class': 'icono-boton sugerir__cerrar', type: 'button', 'aria-label': 'Cerrar' }, '×');
    cerrar.addEventListener('click', cerrarDialogo);
    var estado = h('div', { id: 'sug-estado' });
    var enviar = h('button', { 'class': 'boton', type: 'submit', texto: 'Enviar sugerencia' });
    var cancelar = h('button', { 'class': 'boton boton--suave', type: 'button', texto: 'Cancelar' });
    cancelar.addEventListener('click', cerrarDialogo);

    formulario = h('form', { 'class': 'sugerir__form', novalidate: 'novalidate' },
      h('fieldset', null, h('legend', { texto: '¿Qué quieres contarnos?' }), h('div', { 'class': 'opciones' }, radiosTipo)),
      h('div', { 'class': 'campo' }, h('label', { 'for': 'sug-detalle', texto: 'Cuéntanos con detalle' }), detalle, cuenta),
      h('div', { 'class': 'campo' }, h('label', { 'for': 'sug-especie', texto: '¿Para quién es? (opcional)' }), selEspecie),
      h('div', { 'class': 'campo' }, h('label', { 'for': 'sug-enlace', texto: 'Enlace al producto o la tienda (opcional)' }), enlace),
      trampa, estado,
      h('div', { 'class': 'botones' }, enviar, cancelar),
      h('p', { 'class': 'apoyo' }, 'Es anónimo: no te pedimos correo, nombre ni cuenta. ', h('a', { href: 'como-funciona.html#privacidad', texto: 'Cómo usamos lo que nos cuentas' }), '.'));
    formulario.addEventListener('submit', alEnviar);

    cuerpo = h('div', { 'class': 'sugerir__cuerpo' },
      h('h2', { id: 'sug-titulo', texto: 'Sugiere un producto' }),
      h('p', { 'class': 'apoyo', texto: 'Cuéntanos qué falta o qué no cuadra y lo revisamos.' }), formulario);
    dialogo = h('dialog', { 'class': 'sugerir', id: 'sugerir', 'aria-labelledby': 'sug-titulo' }, cerrar, cuerpo);
    dialogo.addEventListener('click', function (e) { if (e.target === dialogo) cerrarDialogo(); }); // clic en el fondo
    dialogo.addEventListener('close', function () { if (abridor && abridor.focus) abridor.focus(); });
    document.body.appendChild(dialogo);
  }

  function cerrarDialogo() { if (dialogo && dialogo.open) dialogo.close(); }

  function marcarError(campo, mensaje) {
    $('sug-estado').textContent = '';
    $('sug-estado').appendChild(aviso('aviso--error', 'Falta un dato.', mensaje));
    if (campo && campo.focus) campo.focus();
  }

  function alEnviar(e) {
    e.preventDefault();
    var f = formulario, estado = $('sug-estado');
    var tipo = f.querySelector('input[name="tipo"]:checked'), detalle = f.detalle.value.trim(), enlace = f.enlace.value.trim();
    if (!tipo) return marcarError(f.querySelector('input[name="tipo"]'), 'Elige qué tipo de sugerencia es.');
    if (!detalle) return marcarError(f.detalle, 'Cuéntanos el detalle en unas palabras (máximo ' + MAX_DETALLE + ' caracteres).');
    if (enlace && !/^https?:\/\/\S+\.\S+/i.test(enlace)) return marcarError(f.enlace, 'El enlace debe empezar por https:// . Si no lo tienes, déjalo vacío.');
    if (f.sitio_web.value) return gracias(); // campo trampa lleno: es un bot; parece que funcionó, pero no se envía nada

    if (!formularioListo()) {
      estado.textContent = '';
      estado.appendChild(aviso('aviso--error', 'No pudimos enviar tu sugerencia.',
        'El formulario todavía no está conectado. Vuelve en unos minutos o escríbenos por Instagram.'));
      return;
    }
    var datos = new URLSearchParams();
    datos.set(ENTRADAS.tipo, tipo.value);
    datos.set(ENTRADAS.detalle, detalle.slice(0, MAX_DETALLE));
    if (f.especie.value) datos.set(ENTRADAS.especie, f.especie.value);
    if (enlace) datos.set(ENTRADAS.enlace, enlace);

    var boton = f.querySelector('button[type="submit"]');
    boton.disabled = true; boton.textContent = 'Enviando…';
    estado.textContent = '';
    // no-cors: Google no deja leer la respuesta, así que éxito = la petición salió sin error de red.
    fetch(urlEnvio(), { method: 'POST', mode: 'no-cors', body: datos })
      .then(gracias)
      .catch(function () {
        boton.disabled = false; boton.textContent = 'Enviar sugerencia';
        estado.appendChild(aviso('aviso--error', 'No pudimos enviar tu sugerencia.',
          'Se cortó la conexión o el formulario no respondió. Revisa tu conexión e inténtalo otra vez; lo que escribiste sigue aquí.'));
      });
  }

  function gracias() {
    var cerrar = h('button', { 'class': 'boton', type: 'button', texto: 'Cerrar' });
    cerrar.addEventListener('click', cerrarDialogo);
    cuerpo.textContent = '';
    cuerpo.appendChild(h('h2', { id: 'sug-titulo', texto: 'Gracias por contarnos' }));
    cuerpo.appendChild(aviso('aviso--ok', 'Tu sugerencia llegó.', 'La leeremos con cariño. No guardamos quién eres, así que no te responderemos; si es un producto o una tienda que falta, lo buscaremos.'));
    cuerpo.appendChild(h('p', null, cerrar));
    cerrar.focus();
  }

  /* Abre el formulario. opciones.tipo preselecciona el tipo; opciones.detalle precarga el texto. */
  function abrirSugerencia(opciones, desde) {
    opciones = opciones || {};
    if (!dialogo) construir();
    if (!cuerpo.contains(formulario)) { dialogo.remove(); dialogo = null; construir(); }
    abridor = desde || document.activeElement;
    formulario.reset();
    $('sug-estado').textContent = '';
    $('sug-cuenta').textContent = '0 de ' + MAX_DETALLE + ' caracteres';
    if (opciones.tipo) { var r = formulario.querySelector('input[value="' + opciones.tipo + '"]'); if (r) r.checked = true; }
    if (opciones.detalle) { formulario.detalle.value = opciones.detalle.slice(0, MAX_DETALLE); $('sug-cuenta').textContent = formulario.detalle.value.length + ' de ' + MAX_DETALLE + ' caracteres'; }
    if (typeof dialogo.showModal === 'function') dialogo.showModal(); else dialogo.setAttribute('open', '');
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-sugerir]') : null;
    if (!a) return;
    e.preventDefault();
    abrirSugerencia({}, a);
  });
  if (/[?&]sugerir=1\b/.test(location.search)) abrirSugerencia({}, document.body);

  return { URL_INSTAGRAM: URL_INSTAGRAM, TIPOS: TIPOS, abrirSugerencia: abrirSugerencia };
})();
