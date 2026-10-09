/* Mercado de las Huellas — interfaz del buscador. La lógica vive en logica.js. */
(function () {
  'use strict';
  var H = Huellas;
  var RUTA_IMG = 'assets/ilustraciones/';
  var GRUPOS_POR_PAGINA = 15;
  var TARJETAS_POR_GRUPO = 6;
  var MAX_RESUMEN = 12;

  var estado = { texto: '', especie: '', categoria: '', limite: GRUPOS_POR_PAGINA };
  var productos = [];
  var hoy = new Date();

  var $ = function (id) { return document.getElementById(id); };
  var el = { estado: $('estado'), resultados: $('resultados'), conteo: $('conteo'), grupos: $('grupos'),
    resumen: $('resumen'), bloqueResumen: $('bloque-resumen'), verMas: $('ver-mas'), quitar: $('quitar'),
    buscar: $('buscar'), actualizacion: $('actualizacion'), pieFecha: $('pie-fecha') };

  /* Crea nodos con textContent: nada del CSV se interpreta como HTML. */
  function h(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }
  function img(archivo, alt, w, hh) {
    return h('img', { src: RUTA_IMG + archivo, alt: alt, width: w, height: hh });
  }
  function urlSegura(u) { return /^https?:\/\//i.test(u) ? u : null; }

  var HUELLA = '<svg viewBox="0 0 36 44" aria-hidden="true"><ellipse cx="18" cy="32" rx="11" ry="9"/><ellipse cx="6" cy="19" rx="4.5" ry="6" transform="rotate(-18 6 19)"/><ellipse cx="14" cy="10" rx="4.5" ry="6.5"/><ellipse cx="23" cy="10" rx="4.5" ry="6.5"/><ellipse cx="31" cy="19" rx="4.5" ry="6" transform="rotate(18 31 19)"/></svg>';

  /* Estados: carga, vacío y error */
  function mostrarEstado(tipo) {
    el.estado.textContent = '';
    el.resultados.hidden = true;
    if (!tipo) return;
    var t;
    if (tipo === 'carga') {
      var huellas = h('div', { 'class': 'huellas', 'aria-hidden': 'true' });
      huellas.innerHTML = HUELLA + HUELLA + HUELLA + HUELLA;
      t = h('div', { 'class': 'tarjeta estado', role: 'status' }, huellas,
        img('juguetes-interactivos.svg', 'Mascota jugando con su juguete', 160, 133),
        h('p', { texto: 'Buscando el mejor precio para tu peludito…' }));
    } else if (tipo === 'vacio') {
      var q = h('button', { 'class': 'boton', type: 'button', texto: 'Quitar filtros' });
      q.addEventListener('click', quitarFiltros);
      t = h('div', { 'class': 'tarjeta estado', role: 'status' },
        img('camas.svg', 'Gato durmiendo en su cama', 160, 133),
        h('p', { texto: 'No encontramos nada con esos filtros. Prueba otra palabra o quita un filtro.' }), q);
    } else {
      var r = h('button', { 'class': 'boton', type: 'button', texto: 'Reintentar' });
      r.addEventListener('click', cargar);
      t = h('div', { 'class': 'tarjeta estado', role: 'alert' },
        img('bolsos-transportadores.svg', 'Gato asomado en su bolso transportador', 160, 133),
        h('p', { texto: 'No pudimos traer los precios. Revisa tu conexión e inténtalo otra vez.' }), r);
    }
    el.estado.appendChild(t);
  }

  /* Chips */
  function chip(texto, activo, alAlternar, ilustracion) {
    var b = h('button', { 'class': 'chip' + (ilustracion ? '' : ' chip--solo'), type: 'button', 'aria-pressed': String(activo) },
      ilustracion ? img(ilustracion, '', 40, 40) : null, texto);
    b.addEventListener('click', alAlternar);
    return b;
  }
  function dibujarChips() {
    var e = $('chips-especie'), c = $('chips-categoria');
    e.textContent = ''; c.textContent = '';
    H.ESPECIES.forEach(function (x) {
      e.appendChild(chip(x.etiqueta, estado.especie === x.id, function () {
        estado.especie = estado.especie === x.id ? '' : x.id; refrescar();
      }));
    });
    c.appendChild(chip('Todas las categorías', !estado.categoria, function () { estado.categoria = ''; refrescar(); }));
    H.CATEGORIAS.forEach(function (x) {
      c.appendChild(chip(x.etiqueta, estado.categoria === x.id, function () {
        estado.categoria = estado.categoria === x.id ? '' : x.id; refrescar();
      }, x.img));
    });
    el.quitar.hidden = !(estado.texto || estado.especie || estado.categoria);
  }

  function quitarFiltros() {
    estado.texto = ''; estado.especie = ''; estado.categoria = '';
    el.buscar.value = '';
    refrescar();
  }

  /* Títulos de grupo */
  function tituloGrupo(g) {
    var base = H.categoria(g.categoria).etiqueta + ' · ' + H.especie(g.especie).etiqueta;
    if (g.tipo === 'caracteristica') return base + ' · ' + g.caracteristica;
    if (g.tipo === 'producto') return base + ' · ' + g.nombre;
    return base + ' · Sin equivalente';
  }
  function subtituloGrupo(g) {
    var por = H.UNIDADES[g.unidad] ? 'Precio ' + H.UNIDADES[g.unidad] : 'Sin unidad de medida para comparar';
    if (g.tipo === 'producto') {
      var t = {}; g.ofertas.forEach(function (o) { t[o.producto.tienda] = 1; });
      return 'Mismo producto en ' + Object.keys(t).length + ' tiendas · ' + por;
    }
    if (g.tipo === 'sin-equivalente') return 'No hay el mismo producto en otras tiendas · ' + por;
    return por;
  }

  function filaDato(clave, valor, extra) {
    return h('div', { 'class': 'fila' }, h('dt', { texto: clave }), h('dd', extra ? { 'class': extra, texto: valor } : { texto: valor }));
  }

  /* Tarjeta de producto, en el orden de lectura de BRAND.md */
  function tarjeta(g, o) {
    var p = o.producto;
    var ins = h('div', { 'class': 'insignias' });
    if (o.masBarata) ins.appendChild(h('span', { 'class': 'insignia insignia--barata', texto: 'La más barata' }));
    if (o.advertencia) ins.appendChild(h('span', { 'class': 'insignia insignia--vieja',
      texto: o.edad === null ? 'Precio de fecha desconocida' : 'Precio de hace ' + o.edad + ' días' }));

    var unidad = p.precioUnidad !== null
      ? h('div', { 'class': 'unidad cifra' }, H.formatoPesos(p.precioUnidad) + ' ', h('small', { texto: H.UNIDADES[p.unidad] }))
      : h('div', { 'class': 'unidad sin-unidad' }, h('small', { texto: 'Sin precio por unidad de medida' }));

    var cantidad = H.textoCantidad(p) + (p.caracteristica ? ' · ' + p.caracteristica : '');
    var dl = h('dl', null,
      filaDato('Precio total', H.formatoPesos(p.precio), 'cifra'),
      filaDato('Tienda', p.tienda),
      filaDato('Cantidad', cantidad),
      filaDato('Precio tomado', H.textoEdad(o.edad)));

    var url = urlSegura(p.url);
    var art = h('article', { 'class': 'tarjeta producto' + (o.masBarata ? ' producto--barata' : '') },
      ins, unidad,
      h('p', { 'class': 'nombre', texto: p.producto }),
      h('p', { 'class': 'marca-nombre', texto: p.marca }),
      dl,
      o.vencida && o.edad !== null ? h('p', { 'class': 'aviso-vencido apoyo', texto: 'Con más de ' + H.DIAS_MAXIMO + ' días: no cuenta para la más barata.' }) : null,
      url ? h('a', { 'class': 'boton', href: url, target: '_blank', rel: 'noopener noreferrer', texto: 'Ir a la tienda' }) : null);
    return art;
  }

  function dibujarGrupo(g, indice) {
    var rejilla = h('div', { 'class': 'rejilla' });
    var tarjetas = g.ofertas.map(function (o, i) {
      var t = tarjeta(g, o);
      if (i >= TARJETAS_POR_GRUPO) t.hidden = true;
      rejilla.appendChild(t);
      return t;
    });
    var s = h('section', { 'class': 'grupo', id: 'grupo-' + indice, 'aria-labelledby': 'grupo-t-' + indice },
      h('h3', { id: 'grupo-t-' + indice, texto: tituloGrupo(g) }),
      h('p', { 'class': 'apoyo', texto: subtituloGrupo(g) }), rejilla);
    var resto = g.ofertas.length - TARJETAS_POR_GRUPO;
    if (resto > 0) {
      var b = h('button', { 'class': 'boton', type: 'button', 'aria-expanded': 'false', texto: 'Ver las ' + resto + ' restantes' });
      b.addEventListener('click', function () {
        var abierto = b.getAttribute('aria-expanded') === 'true';
        tarjetas.forEach(function (t, i) { if (i >= TARJETAS_POR_GRUPO) t.hidden = abierto; });
        b.setAttribute('aria-expanded', String(!abierto));
        b.textContent = abierto ? 'Ver las ' + resto + ' restantes' : 'Ver menos';
      });
      s.appendChild(h('p', null, b));
    }
    return s;
  }

  function dibujarResumen(grupos) {
    el.resumen.textContent = '';
    var con = grupos.map(function (g, i) { return { g: g, i: i }; }).filter(function (x) { return x.g.barata; });
    el.bloqueResumen.hidden = con.length === 0;
    con.slice(0, MAX_RESUMEN).forEach(function (x) {
      var p = x.g.barata.producto;
      var enlace = h('a', { href: '#grupo-' + x.i, texto: 'Ver el grupo' });
      enlace.addEventListener('click', function () { // el grupo puede no estar dibujado aún
        if (x.i >= estado.limite) { estado.limite = x.i + 1; dibujar(); }
      });
      el.resumen.appendChild(h('div', { 'class': 'tarjeta tarjeta--azul' },
        h('span', { 'class': 'etiqueta', texto: tituloGrupo(x.g) }),
        h('div', { 'class': 'cifra' }, H.formatoPesos(p.precioUnidad) + ' ', h('small', { texto: H.UNIDADES[p.unidad] })),
        h('p', { texto: p.producto }),
        h('p', { texto: p.tienda + ' · ' + H.textoCantidad(p) }),
        h('p', null, enlace)));
    });
  }

  function dibujar() {
    var lista = H.filtrar(productos, estado);
    if (!lista.length) { mostrarEstado('vacio'); return; }
    var grupos = H.agrupar(lista, hoy);
    el.estado.textContent = '';
    el.resultados.hidden = false;
    el.conteo.textContent = lista.length + (lista.length === 1 ? ' producto' : ' productos') + ' en ' +
      grupos.length + (grupos.length === 1 ? ' grupo' : ' grupos');
    dibujarResumen(grupos);
    el.grupos.textContent = '';
    grupos.slice(0, estado.limite).forEach(function (g, i) { el.grupos.appendChild(dibujarGrupo(g, i)); });
    el.verMas.hidden = grupos.length <= estado.limite;
  }

  function refrescar() {
    estado.limite = GRUPOS_POR_PAGINA;
    dibujarChips();
    dibujar();
  }

  function cargar() {
    mostrarEstado('carga');
    fetch('data/precios.csv', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (texto) {
        productos = H.leerProductos(texto);
        if (!productos.length) throw new Error('sin datos');
        var fecha = H.fechaLarga(H.fechaMasReciente(productos));
        var msg = fecha ? 'Precios actualizados el ' + fecha : '';
        el.actualizacion.textContent = msg;
        el.pieFecha.textContent = msg ? msg + '.' : '';
        hoy = new Date();
        dibujarChips();
        dibujar();
      })
      .catch(function () { mostrarEstado('error'); });
  }

  var temporizador;
  el.buscar.addEventListener('input', function () {
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { estado.texto = el.buscar.value; refrescar(); }, 150);
  });
  $('form-busqueda').addEventListener('submit', function (e) {
    e.preventDefault();
    clearTimeout(temporizador);
    estado.texto = el.buscar.value;
    refrescar();
    var destino = el.bloqueResumen.hidden ? el.conteo : el.bloqueResumen;
    destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.buscar.blur();
  });
  el.quitar.addEventListener('click', quitarFiltros);
  el.verMas.addEventListener('click', function () { estado.limite += GRUPOS_POR_PAGINA; dibujar(); });

  cargar();
})();
