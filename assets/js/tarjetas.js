/* Mercado de las Huellas — piezas que comparten el buscador y «Hallazgos del día»: nodos, foto y tarjeta de producto. */
var Tarjetas = (function () {
  'use strict';
  var H = Huellas;
  var RUTA_IMG = 'assets/ilustraciones/';

  /* Crea nodos con textContent: nada del CSV se interpreta como HTML. */
  function h(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      [].concat(c).forEach(function (x) {
        if (x != null) n.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
      });
    }
    return n;
  }
  /* «por kg», «por ml»… y, para piezas sueltas, «por tapete», «por pañal»… */
  var POR_PIEZA = { 'tapete': 'por tapete', 'tapete atrapa arena': 'por tapete', 'pañal': 'por pañal', 'paño': 'por paño', 'bolsa recolectora': 'por bolsa' };
  function porUnidad(p) { return (p.unidad === 'unidad' && POR_PIEZA[p.subcategoria]) || H.UNIDADES[p.unidad]; }
  function urlSegura(u) { return /^https?:\/\//i.test(u) ? u : null; }
  /* Títulos de grupo */
  function tituloGrupo(g) {
    var base = H.categoria(g.categoria).etiqueta + (g.subcategoria ? ' · ' + g.subcategoria.charAt(0).toUpperCase() + g.subcategoria.slice(1) : '') + ' · ' + H.especie(g.especie).etiqueta;
    if (g.tipo === 'caracteristica') return base + ' · ' + g.caracteristica;
    if (g.tipo === 'producto') return base + ' · ' + g.nombre;
    return base + ' · Sin equivalente';
  }
  function filaDato(clave, valor, extra) {
    return h('div', { 'class': 'fila' }, h('dt', { texto: clave }), h('dd', extra ? { 'class': extra, texto: valor } : { texto: valor }));
  }

  /* Foto enlazada desde la tienda, cuadrada y sin recortar; si no hay o falla, la ilustración de su categoría. */
  function foto(p) {
    var cat = H.categoria(p.categoria), ilus = RUTA_IMG + cat.img;
    var altIlus = 'Ilustración de ' + cat.etiqueta.toLowerCase();
    var f = h('img', { 'class': 'foto__img' + (p.imagen ? '' : ' foto__img--ilustracion'), src: p.imagen || ilus,
      alt: p.imagen ? 'Foto de ' + p.producto : altIlus, width: 400, height: 400, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    f.addEventListener('error', function () {
      f.classList.add('foto__img--ilustracion'); f.alt = altIlus; f.src = ilus;
    }, { once: true });
    return h('div', { 'class': 'foto' }, f);
  }

  /* Panel «Mismo producto, más barato»: foto, tienda, precio real, precio por unidad, ahorro y enlace. */
  function panelMasBarato(g, o, desde) {
    var s = H.sugerirMasBarato(g, o), p = o.producto;
    var ref = s.estado === 'ahorro' ? s.mejor.producto : p;
    var url = urlSegura(ref.url);
    var nodos = [foto(ref), h('p', { 'class': 'tienda', texto: ref.tienda }), h('p', { 'class': 'nombre', texto: ref.producto }),
      h('p', { 'class': 'precio cifra', texto: H.formatoPesos(ref.precio) + ' · ' + H.textoCantidad(ref) })];
    if (ref.precioUnidad !== null) nodos.push(h('p', { 'class': 'precio-unidad cifra' }, H.formatoPesos(ref.precioUnidad) + ' ', h('span', { texto: porUnidad(ref) })));
    if (s.estado === 'ahorro') {
      nodos.push(h('p', { 'class': 'nota', role: 'status' }, h('b', { texto: 'Ahorras ' + H.formatoPesos(s.ahorro) + ' en ' + H.textoCantidad(p) + ', ' + s.porcentaje + ' % menos' }),
        ' que en ' + p.tienda + ' (' + H.formatoPesos(p.precio) + ').'));
    } else if (s.estado === 'ya-barata') {
      nodos.push(h('p', { 'class': 'nota', role: 'status' }, h('b', { texto: 'Ya es el más barato: ' }), 'ninguna otra tienda lo tiene a menor precio por unidad.'));
    } else {
      nodos.push(h('p', { 'class': 'nota apoyo', role: 'status', texto: s.motivo }));
    }
    if (url) nodos.push(h('p', null, h('a', { 'class': 'boton', href: url, target: '_blank', rel: 'noopener noreferrer' },
      'Ir a ' + ref.tienda + ' ', h('span', { 'aria-hidden': 'true', texto: '↗' }), h('span', { 'class': 'solo-lectores', texto: '(se abre en una pestaña nueva)' }))));
    Comun.abrirPanel('Mismo producto, más barato', nodos, desde);
  }

  /* Tarjeta de producto: foto arriba; debajo insignia, tienda, nombre, precio real, precio por unidad, datos y botón. */
  function tarjeta(g, o) {
    var p = o.producto;
    var ins = h('div', { 'class': 'insignias' });
    if (p.emprendimiento) ins.appendChild(h('span', { 'class': 'insignia insignia--local', texto: 'Emprendimiento colombiano' }));
    if (o.masBarata) ins.appendChild(h('span', { 'class': 'insignia insignia--barata', texto: 'La más barata ' + (porUnidad(p) || '') }));
    if (o.advertencia) ins.appendChild(h('span', { 'class': 'insignia insignia--vieja',
      texto: o.edad === null ? 'Precio de fecha desconocida' : 'Precio de hace ' + o.edad + ' días' }));

    if (p.sinActualizar && !o.advertencia) ins.appendChild(h('span', { 'class': 'insignia insignia--vieja', texto: 'No actualizado' }));

    var porU = p.precioUnidad !== null
      ? h('p', { 'class': 'precio-unidad cifra' }, H.formatoPesos(p.precioUnidad) + ' ', h('span', { texto: porUnidad(p) }))
      : h('p', { 'class': 'precio-unidad sin-unidad', texto: 'Sin precio por unidad' });

    var cantidad = H.textoCantidad(p) + (p.caracteristica ? ' · ' + p.caracteristica : '');
    var fecha = (H.fechaLarga(p.fecha) || 'Fecha desconocida') +(o.edad === null ? '' : ' (' + H.textoEdad(o.edad) + ')');
    var dl = h('dl', null,
      p.marca ? filaDato('Marca', p.marca) : null,
      filaDato('Cantidad', cantidad),
      filaDato('Fecha', fecha, o.advertencia ? 'viejo' : ''));

    var notas = [];
    if (o.edad === null) notas.push(h('p', { 'class': 'nota nota--ambar', texto: 'No sabemos cuándo se tomó este precio, así que puede haber cambiado. Confírmalo en la tienda antes de comprar.' }));
    else if (o.vencida) notas.push(h('p', { 'class': 'nota nota--ambar', texto: 'Este precio tiene ' + o.edad + ' días: puede haber cambiado y por eso no cuenta para la más barata. Confírmalo en la tienda.' }));
    else if (o.advertencia) notas.push(h('p', { 'class': 'nota nota--ambar', texto: 'Este precio se tomó hace ' + o.edad + ' días y puede haber cambiado. Confírmalo en la tienda antes de comprar.' }));
    if (p.sinActualizar && o.edad !== null && !o.vencida && !o.advertencia) notas.push(h('p', { 'class': 'nota nota--ambar', texto: 'No pudimos actualizar este precio en la última revisión de la tienda. Es el último que tomamos, con su fecha original: confírmalo en la tienda antes de comprar.' }));
    if (p.precioUnidad === null) notas.push(h('p', { 'class': 'nota apoyo', texto: 'No podemos calcular el precio por unidad porque la tienda no informa la cantidad. Revisa el tamaño en la tienda para comparar.' }));

    var url = urlSegura(p.url);
    var mas = h('button', { 'class': 'boton boton--suave', type: 'button', texto: 'Mismo producto, más barato' });
    mas.addEventListener('click', function () { panelMasBarato(g, o, mas); });
    var acciones = h('div', { 'class': 'acciones' }, mas,
      url ? h('a', { 'class': 'boton', href: url, target: '_blank', rel: 'noopener noreferrer' },
        'Ir a ' + p.tienda + ' ', h('span', { 'aria-hidden': 'true', texto: '↗' }), h('span', { 'class': 'solo-lectores', texto: '(se abre en una pestaña nueva)' })) : null);
    var cuerpo = h('div', { 'class': 'producto__cuerpo' }, ins,
      h('p', { 'class': 'tienda', texto: p.tienda }),
      h('p', { 'class': 'nombre', texto: p.producto }),
      h('p', { 'class': 'precio cifra', texto: H.formatoPesos(p.precio) }),
      porU, dl, notas, acciones);
    return h('article', { 'class': 'tarjeta producto' + (o.masBarata ? ' producto--barata' : '') }, foto(p), cuerpo);
  }

  /* Hallazgos del día: la más barata de los primeros grupos que tienen una. */
  var MAX_HALLAZGOS = 12;
  function hallazgos(productos, hoy) {
    return H.agrupar(productos, hoy).filter(function (g) { return g.barata; }).slice(0, MAX_HALLAZGOS);
  }

  return { hallazgos: hallazgos, h: h, porUnidad: porUnidad, urlSegura: urlSegura, tituloGrupo: tituloGrupo, foto: foto, tarjeta: tarjeta, RUTA_IMG: RUTA_IMG };
})();
