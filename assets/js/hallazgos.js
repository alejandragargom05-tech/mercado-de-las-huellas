/* Mercado de las Huellas — página «Hallazgos del día»: las tarjetas completas de las opciones más baratas de hoy. */
(function () {
  'use strict';
  var H = Huellas, h = Tarjetas.h;
  var $ = function (id) { return document.getElementById(id); };
  var hoy = new Date();

  function mostrarError() {
    var estado = $('estado');
    estado.textContent = '';
    var boton = h('button', { 'class': 'boton', type: 'button', texto: 'Reintentar' });
    boton.addEventListener('click', cargar);
    estado.appendChild(h('div', { 'class': 'aviso aviso--error' },
      h('p', { texto: 'No pudimos traer los precios. Se cortó la conexión o el archivo de precios no está disponible por ahora. Revisa tu conexión e inténtalo otra vez; si sigue igual, vuelve en unos minutos.' }), boton));
  }

  function mostrar(productos, modificado) {
    var lista = Tarjetas.hallazgos(productos, hoy);
    var fecha = H.fechaLarga(H.fechaMasReciente(productos));
    var d = modificado ? new Date(modificado) : null;
    var hora = d && isFinite(d) ? d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }) : '';
    if (fecha) $('actualizacion').appendChild(h('p', { 'class': 'apoyo', texto: 'Precios actualizados el ' + fecha + (hora ? ' a las ' + hora : '') + '.' }));
    $('estado').textContent = '';
    if (!lista.length) {
      $('estado').appendChild(h('div', { 'class': 'aviso aviso--info' }, h('p', { texto: 'Hoy no hay hallazgos: ningún grupo tiene precios al día en más de una tienda. Vuelve mañana, cuando se actualicen los precios.' })));
      return;
    }
    var rejilla = h('div', { 'class': 'rejilla' });
    lista.forEach(function (g) {
      var t = Tarjetas.tarjeta(g, g.barata);
      var cuerpo = t.querySelector('.producto__cuerpo');
      cuerpo.insertBefore(h('p', { 'class': 'hallazgo__grupo', texto: Tarjetas.tituloGrupo(g) }), cuerpo.firstChild);
      rejilla.appendChild(t);
    });
    $('hallazgos').textContent = '';
    $('hallazgos').appendChild(rejilla);
    $('hallazgos').hidden = false;
  }

  function cargar() {
    var estado = $('estado');
    estado.textContent = '';
    estado.appendChild(h('p', { 'class': 'apoyo', role: 'status', texto: 'Buscando el mejor precio para tu peludito…' }));
    var modificado = '';
    fetch('data/precios.csv', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); modificado = r.headers.get('Last-Modified') || ''; return r.text(); })
      .then(function (texto) {
        var productos = H.leerProductos(texto);
        if (!productos.length) throw new Error('sin datos');
        mostrar(productos, modificado);
      })
      .catch(mostrarError);
  }
  cargar();
})();
