/* Mercado de las Huellas — interfaz del buscador. La lógica vive en logica.js. */
(function () {
  'use strict';
  var H = Huellas;
  var RUTA_IMG = 'assets/ilustraciones/';
  var GRUPOS_POR_PAGINA = 15;
  var TARJETAS_POR_GRUPO = 6;
  var MAX_RESUMEN = 12;

  var estado = { texto: '', especie: '', categoria: '', subcategoria: '', marca: '', local: false, limite: GRUPOS_POR_PAGINA, estricto: false };
  var productos = [];
  var hoy = new Date();

  var $ = function (id) { return document.getElementById(id); };
  var el = { estado: $('estado'), resultados: $('resultados'), conteo: $('conteo'), grupos: $('grupos'),
    resumen: $('resumen'), bloqueResumen: $('bloque-resumen'), verMas: $('ver-mas'), quitar: $('quitar'),
    buscar: $('buscar'), actualizacion: $('actualizacion'), pieFecha: $('pie-fecha'), avisos: $('avisos'), anuncio: $('anuncio') };

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
  function img(archivo, alt, w, hh) {
    return h('img', { src: RUTA_IMG + archivo, alt: alt, width: w, height: hh });
  }
  /* «por kg», «por ml»… y, para piezas sueltas, «por tapete», «por pañal»… */
  var POR_PIEZA = { 'tapete': 'por tapete', 'tapete atrapa arena': 'por tapete', 'pañal': 'por pañal', 'paño': 'por paño', 'bolsa recolectora': 'por bolsa' };
  function porUnidad(p) { return (p.unidad === 'unidad' && POR_PIEZA[p.subcategoria]) || H.UNIDADES[p.unidad]; }
  var ICONO_MENSAJE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8.5L6 20.5V16.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z"/></svg>';
  function urlSegura(u) { return /^https?:\/\//i.test(u) ? u : null; }

  var HUELLA = '<svg viewBox="0 0 36 44" aria-hidden="true"><ellipse cx="18" cy="32" rx="11" ry="9"/><ellipse cx="6" cy="19" rx="4.5" ry="6" transform="rotate(-18 6 19)"/><ellipse cx="14" cy="10" rx="4.5" ry="6.5"/><ellipse cx="23" cy="10" rx="4.5" ry="6.5"/><ellipse cx="31" cy="19" rx="4.5" ry="6" transform="rotate(18 31 19)"/></svg>';

  function avisoBloque(clase, partes, boton) {
    var a = h('div', { 'class': 'aviso ' + clase });
    partes.forEach(function (t) { a.appendChild(h('p', { texto: t })); });
    if (boton) a.appendChild(boton);
    return a;
  }
  function botonAccion(texto, alClick) {
    var b = h('button', { 'class': 'boton', type: 'button', texto: texto });
    b.addEventListener('click', alClick);
    return b;
  }
  function botonSugerir(alClick) {
    var b = h('button', { 'class': 'boton boton--icono', type: 'button' });
    b.innerHTML = ICONO_MENSAJE;
    b.appendChild(h('span', { texto: 'Sugiere un producto' }));
    b.addEventListener('click', alClick);
    return b;
  }
  function dondeBuscaste() {
    var d = [];
    if (estado.marca) d.push('de ' + estado.marca);
    if (estado.categoria) d.push('en ' + H.categoria(estado.categoria).etiqueta + (estado.subcategoria ? ' (' + estado.subcategoria + ')' : ''));
    if (estado.especie) d.push('para ' + H.especie(estado.especie).etiqueta);
    if (estado.local) d.push('solo en emprendimientos colombianos');
    return d.join(' ');
  }
  var AVISO_MICROCHIP = 'Los microchips los implanta tu veterinario, por eso no los comparamos. Pregúntale por él en tu próxima visita; aquí sí puedes comparar placas de identificación y collares con GPS.';
  function anunciar(texto) { el.anuncio.textContent = texto; }

  /* Estados: carga, vacío y error. Cada uno dice qué pasó, por qué y qué hacer. */
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
      var q = estado.texto.trim();
      var que = q ? 'No encontramos «' + q + '» ' + (dondeBuscaste() || 'en el catálogo') + '.' : 'No encontramos nada con esos filtros.';
      var botones = h('div', { 'class': 'botones' });
      if (estado.estricto && q) botones.appendChild(botonAccion('Ver en todas las categorías', function () { estado.estricto = false; refrescar(); }));
      botones.appendChild(botonAccion('Quitar filtros', quitarFiltros));
      var sugerir = h('div', { 'class': 'estado__sugerir' }, h('p', { texto: '¿No encuentras lo que buscas? Cuéntanos' }),
        botonSugerir(function () { Comun.abrirSugerencia({ tipo: Comun.TIPOS[0], detalle: q }, this); }));
      t = h('div', { 'class': 'tarjeta estado', role: 'status' },
        img('camas.svg', 'Gato durmiendo en su cama', 160, 133),
        h('p', { 'class': 'titulo-estado', texto: que }),
        H.pideMicrochip(q) ? h('p', { texto: AVISO_MICROCHIP }) : null,
        h('p', { texto: 'Puede que esté escrito distinto o que ninguna tienda lo tenga hoy. Prueba otra palabra o quita un filtro.' }),
        botones, sugerir);
      anunciar('Sin resultados. ' + que);
    } else {
      t = h('div', { 'class': 'tarjeta estado estado--error', role: 'alert' },
        img('bolsos-transportadores.svg', 'Gato asomado en su bolso transportador', 160, 133),
        h('p', { 'class': 'titulo-estado', texto: 'No pudimos traer los precios.' }),
        h('p', { texto: 'Se cortó la conexión o el archivo de precios no está disponible por ahora. Revisa tu conexión e inténtalo otra vez; si sigue igual, vuelve en unos minutos.' }),
        botonAccion('Reintentar', cargar));
      anunciar('No pudimos traer los precios. Revisa tu conexión e inténtalo otra vez.');
    }
    el.estado.appendChild(t);
  }

  /* Chips: se crean una vez; al filtrar solo cambia aria-pressed (así el foco no se pierde). */
  function chip(texto, alAlternar, ilustracion) {
    var b = h('button', { 'class': 'chip' + (ilustracion ? '' : ' chip--solo'), type: 'button', 'aria-pressed': 'false' },
      ilustracion ? img(ilustracion, '', 40, 40) : null, texto);
    b.addEventListener('click', function () { estado.estricto = false; alAlternar(); });
    return b;
  }
  var chipsEspecie = [], chipsCategoria = [], chipLocal = null;
  function dibujarChips() {
    var e = $('chips-especie'), c = $('chips-categoria');
    e.textContent = ''; c.textContent = '';
    chipsEspecie = H.ESPECIES.map(function (x) {
      var b = chip(x.id === 'ambos' ? 'Para los dos' : x.etiqueta, function () { estado.especie = estado.especie === x.id ? '' : x.id; refrescar(); });
      b.dataset.id = x.id; e.appendChild(b); return b;
    });
    // «Apoya lo local»: solo tiendas tipo emprendimiento. Filtra, no reordena: el orden sigue siendo por precio.
    chipLocal = chip('Emprendimientos colombianos', function () { estado.local = !estado.local; refrescar(); });
    $('chips-local').textContent = ''; $('chips-local').appendChild(chipLocal);
    var todas = chip('Todas las categorías', function () { estado.categoria = ''; estado.subcategoria = ''; estado.marca = ''; refrescar(); });
    todas.dataset.id = ''; c.appendChild(todas);
    chipsCategoria = [todas].concat(H.CATEGORIAS.map(function (x) {
      var b = chip(x.etiqueta, function () { estado.categoria = estado.categoria === x.id ? '' : x.id; estado.subcategoria = ''; estado.marca = ''; refrescar(); }, x.img);
      b.dataset.id = x.id; c.appendChild(b); return b;
    }));
    dibujarMarcas();
    marcarChips();
  }
  var chipsMarca = [];
  function dibujarMarcas() {
    var m = $('chips-marca');
    m.textContent = '';
    var todas = chip('Todas las marcas', function () { estado.marca = ''; refrescar(); });
    todas.dataset.id = ''; m.appendChild(todas);
    chipsMarca = [todas].concat(H.marcasConcentrado(productos).map(function (x) {
      var b = chip(x.marca, function () { estado.marca = estado.marca === x.marca ? '' : x.marca; refrescar(); });
      b.dataset.id = x.marca; m.appendChild(b); return b;
    }));
  }
  /* Subcategorías de la categoría elegida (solo si hay más de una con productos). Se redibujan al cambiar de categoría. */
  var chipsSub = [], subDe = null;
  function dibujarSubcategorias() {
    var c = $('chips-sub'), lista = estado.categoria ? H.subcategorias(productos, estado.categoria) : [];
    if (subDe === estado.categoria) return;
    subDe = estado.categoria;
    c.textContent = '';
    if (lista.length < 2) { chipsSub = []; return; }
    var todas = chip('Todas', function () { estado.subcategoria = ''; refrescar(); });
    todas.dataset.id = ''; c.appendChild(todas);
    chipsSub = [todas].concat(lista.map(function (x) {
      var b = chip(x.sub.charAt(0).toUpperCase() + x.sub.slice(1), function () { estado.subcategoria = estado.subcategoria === x.sub ? '' : x.sub; refrescar(); });
      b.dataset.id = x.sub; c.appendChild(b); return b;
    }));
  }
  function marcarChips() {
    $('filtro-marca').hidden = estado.categoria !== 'concentrado';
    dibujarSubcategorias();
    $('filtro-sub').hidden = !chipsSub.length;
    chipsSub.forEach(function (b) { b.setAttribute('aria-pressed', String(estado.subcategoria === b.dataset.id)); });
    chipsMarca.forEach(function (b) { b.setAttribute('aria-pressed', String(estado.marca === b.dataset.id)); });
    flechas.forEach(function (f) { f(); });
    chipsEspecie.forEach(function (b) { b.setAttribute('aria-pressed', String(estado.especie === b.dataset.id)); });
    chipsCategoria.forEach(function (b) { b.setAttribute('aria-pressed', String(estado.categoria === b.dataset.id)); });
    chipLocal.setAttribute('aria-pressed', String(estado.local));
    el.quitar.hidden = !(estado.texto || estado.especie || estado.categoria || estado.subcategoria || estado.marca || estado.local);
  }

  function quitarFiltros() {
    estado.texto = ''; estado.especie = ''; estado.categoria = ''; estado.subcategoria = ''; estado.marca = ''; estado.local = false; estado.estricto = false;
    el.buscar.value = '';
    refrescar();
  }

  /* Títulos de grupo */
  function tituloGrupo(g) {
    var base = H.categoria(g.categoria).etiqueta + (g.subcategoria ? ' · ' + g.subcategoria.charAt(0).toUpperCase() + g.subcategoria.slice(1) : '') + ' · ' + H.especie(g.especie).etiqueta;
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

  /* Tarjeta de producto: foto arriba; debajo insignia, tienda, nombre, precio real, precio por unidad, datos y botón. */
  function tarjeta(g, o) {
    var p = o.producto;
    var ins = h('div', { 'class': 'insignias' });
    if (p.emprendimiento) ins.appendChild(h('span', { 'class': 'insignia insignia--local', texto: 'Emprendimiento colombiano' }));
    if (o.masBarata) ins.appendChild(h('span', { 'class': 'insignia insignia--barata', texto: 'La más barata ' + (porUnidad(p) || '') }));
    if (o.advertencia) ins.appendChild(h('span', { 'class': 'insignia insignia--vieja',
      texto: o.edad === null ? 'Precio de fecha desconocida' : 'Precio de hace ' + o.edad + ' días' }));

    var porU = p.precioUnidad !== null
      ? h('p', { 'class': 'precio-unidad cifra' }, H.formatoPesos(p.precioUnidad) + ' ', h('span', { texto: porUnidad(p) }))
      : h('p', { 'class': 'precio-unidad sin-unidad', texto: 'Sin precio por unidad' });

    var cantidad = H.textoCantidad(p) + (p.caracteristica ? ' · ' + p.caracteristica : '');
    var fecha = (H.fechaLarga(p.fecha) || 'Fecha desconocida') + (o.edad === null ? '' : ' (' + H.textoEdad(o.edad) + ')');
    var dl = h('dl', null,
      p.marca ? filaDato('Marca', p.marca) : null,
      filaDato('Cantidad', cantidad),
      filaDato('Fecha', fecha, o.advertencia ? 'viejo' : ''));

    var notas = [];
    if (o.edad === null) notas.push(h('p', { 'class': 'nota nota--ambar', texto: 'No sabemos cuándo se tomó este precio, así que puede haber cambiado. Confírmalo en la tienda antes de comprar.' }));
    else if (o.vencida) notas.push(h('p', { 'class': 'nota nota--ambar', texto: 'Este precio tiene ' + o.edad + ' días: puede haber cambiado y por eso no cuenta para la más barata. Confírmalo en la tienda.' }));
    else if (o.advertencia) notas.push(h('p', { 'class': 'nota nota--ambar', texto: 'Este precio se tomó hace ' + o.edad + ' días y puede haber cambiado. Confírmalo en la tienda antes de comprar.' }));
    if (p.precioUnidad === null) notas.push(h('p', { 'class': 'nota apoyo', texto: 'No podemos calcular el precio por unidad porque la tienda no informa la cantidad. Revisa el tamaño en la tienda para comparar.' }));

    var url = urlSegura(p.url);
    var acciones = h('div', { 'class': 'acciones' },
      url ? h('a', { 'class': 'boton', href: url, target: '_blank', rel: 'noopener noreferrer' },
        'Ir a ' + p.tienda + ' ', h('span', { 'aria-hidden': 'true', texto: '↗' }), h('span', { 'class': 'solo-lectores', texto: '(se abre en una pestaña nueva)' })) : null);
    var cuerpo = h('div', { 'class': 'producto__cuerpo' }, ins,
      h('p', { 'class': 'tienda', texto: p.tienda }),
      h('p', { 'class': 'nombre', texto: p.producto }),
      h('p', { 'class': 'precio cifra', texto: H.formatoPesos(p.precio) }),
      porU, dl, notas, acciones);
    return h('article', { 'class': 'tarjeta producto' + (o.masBarata ? ' producto--barata' : '') }, foto(p), cuerpo);
  }

  function notaGrupo(g) {
    if (g.tipo === 'sin-equivalente') {
      return avisoBloque('aviso--info', ['Estos productos no tienen con qué compararse: ninguna otra tienda vende uno igual o equivalente, por eso no marcamos la más barata.']);
    }
    if (!g.barata) {
      return avisoBloque('aviso--info', ['No marcamos la más barata: hoy solo una tienda tiene precios al día de este grupo. Cuando otra lo publique, los compararemos.']);
    }
    return null;
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
      h('p', { 'class': 'apoyo', texto: subtituloGrupo(g) }), notaGrupo(g), rejilla);
    var resto = g.ofertas.length - TARJETAS_POR_GRUPO;
    if (resto > 0) {
      var b = h('button', { 'class': 'boton', type: 'button', 'aria-expanded': 'false', texto: 'Ver las ' + resto + ' opciones que faltan' });
      b.addEventListener('click', function () {
        var abierto = b.getAttribute('aria-expanded') === 'true';
        tarjetas.forEach(function (t, i) { if (i >= TARJETAS_POR_GRUPO) t.hidden = abierto; });
        b.setAttribute('aria-expanded', String(!abierto));
        b.textContent = abierto ? 'Ver las ' + resto + ' opciones que faltan' : 'Ver menos';
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
      el.resumen.appendChild(h('div', { 'class': 'tarjeta' },
        h('span', { 'class': 'insignia insignia--barata', texto: 'La más barata ' + (porUnidad(p) || '') }),
        h('span', { 'class': 'etiqueta', texto: tituloGrupo(x.g) }),
        h('p', { 'class': 'tienda', texto: p.tienda }),
        h('p', { 'class': 'precio cifra', texto: H.formatoPesos(p.precio) }),
        h('p', { 'class': 'precio-unidad cifra' }, H.formatoPesos(p.precioUnidad) + ' ', h('span', { texto: porUnidad(p) })),
        h('p', { texto: p.producto }),
        h('p', { 'class': 'apoyo', texto: H.textoCantidad(p) }),
        h('p', null, enlace)));
    });
  }

  function lista_y(palabras) {
    return palabras.length > 1 ? palabras.slice(0, -1).join(', ') + ' y ' + palabras[palabras.length - 1] : palabras[0];
  }

  /* Avisos de la búsqueda: ampliación a otras categorías, sinónimos y correcciones. */
  function dibujarAvisos(r) {
    el.avisos.textContent = '';
    var cont = h('div', { 'class': 'avisos-rejilla' });
    var q = estado.texto.trim();
    if (r.ampliada) {
      var a = r.ampliada;
      cont.appendChild(avisoBloque('aviso--ambar', [
        'No hay «' + q + '» ' + a.dentro + '. Te mostramos ' + a.cantidad + (a.cantidad === 1 ? ' resultado ' : ' resultados ') + a.preposicion + ' ' + a.en + '.'],
        botonAccion('Volver al filtro', function () { estado.estricto = true; refrescar(); })));
    }
    if (H.pideMicrochip(q)) cont.appendChild(avisoBloque('aviso--info', [AVISO_MICROCHIP]));
    r.avisos.sinonimos.forEach(function (s) {
      cont.appendChild(avisoBloque('aviso--info', ['Mostrando ' + s.grupo + ', también buscamos ' + lista_y(s.palabras) + '.']));
    });
    if (r.avisos.dijo) {
      cont.appendChild(avisoBloque('aviso--info', ['¿Quisiste decir ' + r.avisos.dijo + '? Te mostramos lo que encontramos con esa escritura.']));
    }
    if (cont.children.length) el.avisos.appendChild(cont);
  }

  function dibujar() {
    var r = H.buscar(productos, estado);
    var lista = r.lista;
    if (!lista.length) { mostrarEstado('vacio'); return; }
    var grupos = H.agrupar(lista, hoy);
    el.estado.textContent = '';
    el.resultados.hidden = false;
    dibujarAvisos(r);
    el.conteo.textContent = 'Encontramos ' + String(lista.length).replace(/\B(?=(\d{3})+$)/g, '.') + (lista.length === 1 ? ' opción' : ' opciones') + ' para tu peludo';
    anunciar(lista.length + (lista.length === 1 ? ' opción' : ' opciones') + (r.ampliada ? ' en otras categorías' : ''));
    dibujarResumen(grupos);
    el.grupos.textContent = '';
    grupos.slice(0, estado.limite).forEach(function (g, i) { el.grupos.appendChild(dibujarGrupo(g, i)); });
    el.verMas.hidden = grupos.length <= estado.limite;
  }

  function refrescar() {
    estado.limite = GRUPOS_POR_PAGINA;
    marcarChips();
    dibujar();
  }

  function horaDe(cabecera) {
    var d = cabecera ? new Date(cabecera) : null;
    return d && isFinite(d) ? d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }) : '';
  }

  function mostrarActualizacion(fechaCsv, modificado) {
    var fecha = H.fechaLarga(fechaCsv), hora = horaDe(modificado);
    var msg = fecha ? 'Precios actualizados el ' + fecha + (hora ? ' a las ' + hora : '') : '';
    el.actualizacion.textContent = '';
    el.pieFecha.textContent = msg ? msg + '.' : '';
    if (!msg) return;
    var dias = H.edadEnDias(fechaCsv, hoy);
    if (dias !== null && dias > H.DIAS_ADVERTENCIA) {
      el.actualizacion.appendChild(avisoBloque('aviso--ambar', [msg + '.',
        'Los precios se actualizan cada día, pero esta vez la actualización no llegó hace ' + dias + ' días. Pueden haber cambiado: confirma el precio en la tienda antes de comprar.']));
    } else {
      el.actualizacion.appendChild(h('p', { 'class': 'apoyo', texto: msg }));
    }
  }

  function cargar() {
    mostrarEstado('carga');
    var sinonimos = fetch('data/sinonimos.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    var modificado = '';
    fetch('data/precios.csv', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); modificado = r.headers.get('Last-Modified') || ''; return r.text(); })
      .then(function (texto) {
        productos = H.leerProductos(texto);
        if (!productos.length) throw new Error('sin datos');
        return sinonimos;
      })
      .then(function (datos) {
        if (datos) H.configurarSinonimos(datos); // sin sinónimos la búsqueda sigue funcionando
        hoy = new Date();
        mostrarActualizacion(H.fechaMasReciente(productos), modificado);
        try { aplicarFiltroDeURL(new URLSearchParams(location.search)); } catch (e) { /* sin filtros en la URL */ }
        dibujarChips();
        dibujar();
      })
      .catch(function () { mostrarEstado('error'); });
  }

  var temporizador;
  el.buscar.addEventListener('input', function () {
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { estado.texto = el.buscar.value; estado.estricto = false; refrescar(); }, 150);
  });
  $('form-busqueda').addEventListener('submit', function (e) {
    e.preventDefault();
    clearTimeout(temporizador);
    estado.texto = el.buscar.value;
    estado.estricto = false;
    refrescar();
    var destino = el.resultados.hidden ? el.estado : (el.bloqueResumen.hidden ? el.conteo : el.bloqueResumen);
    destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.buscar.blur();
  });
  el.quitar.addEventListener('click', quitarFiltros);
  el.verMas.addEventListener('click', function () { estado.limite += GRUPOS_POR_PAGINA; dibujar(); });

  /* Chips en celular: flechas y degradado según haya más a cada lado */
  var flechas = [];
  function conectarTira(idEnvoltorio, idTira) {
    var env = $(idEnvoltorio), tira = $(idTira);
    var ant = env.querySelector('.flecha--ant'), sig = env.querySelector('.flecha--sig');
    function actualizar() {
      var max = tira.scrollWidth - tira.clientWidth - 2, hay = max > 0;
      ant.hidden = !hay || tira.scrollLeft <= 2;
      sig.hidden = !hay || tira.scrollLeft >= max;
      env.classList.toggle('hay-ant', !ant.hidden);
      env.classList.toggle('hay-sig', !sig.hidden);
    }
    ant.addEventListener('click', function () { tira.scrollBy({ left: -tira.clientWidth * .7, behavior: 'smooth' }); });
    sig.addEventListener('click', function () { tira.scrollBy({ left: tira.clientWidth * .7, behavior: 'smooth' }); });
    tira.addEventListener('scroll', actualizar, { passive: true });
    window.addEventListener('resize', actualizar);
    new MutationObserver(actualizar).observe(tira, { childList: true });
    flechas.push(actualizar);
  }
  conectarTira('envoltorio-categoria', 'chips-categoria');
  conectarTira('envoltorio-marca', 'chips-marca');
  conectarTira('envoltorio-sub', 'chips-sub');

  /* Enlaces del pie y de la URL (?categoria=, ?especie=) que activan un filtro */
  function aplicarFiltroDeURL(params) {
    var c = params.get('categoria'), e = params.get('especie');
    if (params.get('local') === '1') estado.local = true;
    if (c && H.categoria(c)) { estado.categoria = c; estado.subcategoria = ''; estado.marca = ''; }
    if (e && H.especie(e)) estado.especie = e;
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('a[data-categoria], a[data-especie]') : null;
    if (!a) return;
    ev.preventDefault();
    if (a.dataset.categoria) { estado.categoria = a.dataset.categoria; estado.subcategoria = ''; estado.marca = ''; }
    if (a.dataset.especie) estado.especie = a.dataset.especie;
    refrescar();
    $('filtros').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* Onda: un gato persigue a un perro siguiendo la curva (6 s de carrera, 4 s de pausa). Con movimiento reducido quedan quietos en el centro. */
  (function () {
    var onda = document.querySelector('.onda--asoma'); if (!onda) return;
    var perro = onda.querySelector('.onda__pj--perro'), gato = onda.querySelector('.onda__pj--gato');
    var mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    function alto(x, w) { // y de la curva de 80 px de periodo, centrada en la onda
      var p = (((x - (w - 80) / 2) % 80) + 80) % 80, t = (p % 40) / 40, u = 1 - t;
      return p < 40 ? 12 * (u * u + t * t) : 12 * u * u + 48 * u * t + 12 * t * t;
    }
    function poner(el, x, w) {
      var ang = Math.atan2(alto(x + 3, w) - alto(x - 3, w), 6) * 57.3;
      el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + alto(x, w).toFixed(1) + 'px) rotate(' + ang.toFixed(1) + 'deg)';
    }
    function quieto() {
      var w = onda.clientWidth;
      [perro, gato].forEach(function (e) { e.classList.remove('corre'); e.style.opacity = 1; });
      poner(perro, w / 2 + 26, w); poner(gato, w / 2 - 26, w);
    }
    function cuadro(ahora) {
      if (mq && mq.matches) { quieto(); return; }
      var w = onda.clientWidth, t = ahora % 10000, vis = t < 6000, sep = w < 720 ? 52 : 90, margen = 60;
      [perro, gato].forEach(function (e) { e.classList.toggle('corre', vis); e.style.opacity = vis ? 1 : 0; });
      if (vis) {
        var x = -margen - sep + (t / 6000) * (w + 2 * margen + sep);
        poner(perro, x + sep, w); poner(gato, x, w);
      }
      requestAnimationFrame(cuadro);
    }
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!mq.matches) requestAnimationFrame(cuadro); });
    window.addEventListener('resize', function () { if (mq && mq.matches) quieto(); });
    requestAnimationFrame(cuadro);
  })();

  cargar();
})();
