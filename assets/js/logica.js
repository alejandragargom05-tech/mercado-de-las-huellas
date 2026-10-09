/* Mercado de las Huellas — lectura del CSV, búsqueda, agrupación y comparación.
   Sin DOM: lo usan la web (app.js) y la prueba (pruebas/probar.js). */
var Huellas = (function () {
  'use strict';

  var DIAS_ADVERTENCIA = 7;
  var DIAS_MAXIMO = 30;

  var CATEGORIAS = [
    { id: 'arena', etiqueta: 'Arena', slugs: ['arena'], img: 'arena-sanitaria.svg', claves: 'arena sanitaria aglomerante' },
    { id: 'rascadores', etiqueta: 'Gimnasios y rascadores', slugs: ['rascadores'], img: 'gimnasios-rascadores.svg', claves: 'gimnasio rascador' },
    { id: 'fuentes-comederos', etiqueta: 'Fuentes y comederos', slugs: ['fuentes-comederos'], img: 'fuentes-comederos.svg', claves: 'fuente comedero automatico' },
    { id: 'arneses-correas', etiqueta: 'Arneses y correas', slugs: ['arneses-correas'], img: 'arneses-correas.svg', claves: 'arnes correa' },
    { id: 'juguetes', etiqueta: 'Juguetes', slugs: ['juguetes'], img: 'juguetes-interactivos.svg', claves: 'juguete interactivo' },
    { id: 'camas', etiqueta: 'Camas', slugs: ['camas'], img: 'camas.svg', claves: 'cama' },
    { id: 'shampoo-panos', etiqueta: 'Shampoo y paños', slugs: ['shampoo', 'panos'], img: 'shampoo-panos.svg', claves: 'shampoo pano humedo' },
    { id: 'transportadores', etiqueta: 'Bolsos transportadores', slugs: ['transportadores'], img: 'bolsos-transportadores.svg', claves: 'bolso transportador' }
  ];
  var ESPECIES = [
    { id: 'gato', etiqueta: 'Gatos' },
    { id: 'perro', etiqueta: 'Perros' },
    { id: 'ambos', etiqueta: 'Ambos' }
  ];
  var UNIDADES = {
    kg: 'por kg', l: 'por litro', ml: 'por ml', 'paño': 'por paño', unidad: 'por unidad'
  };

  var categoriaPorSlug = {};
  CATEGORIAS.forEach(function (c) { c.slugs.forEach(function (s) { categoriaPorSlug[s] = c; }); });

  function categoria(id) {
    return CATEGORIAS.filter(function (c) { return c.id === id; })[0];
  }
  function especie(id) {
    return ESPECIES.filter(function (e) { return e.id === id; })[0];
  }

  /* Sin tildes ni mayúsculas; la ñ pasa a n. */
  function normalizar(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* CSV con campos entre comillas, comillas dobles escapadas y saltos de línea. */
  function parsearCSV(texto) {
    var filas = [], fila = [], campo = '', entre = false, i = 0, c;
    if (texto.charCodeAt(0) === 0xFEFF) i = 1;
    for (; i < texto.length; i++) {
      c = texto[i];
      if (entre) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; } else { entre = false; }
        } else { campo += c; }
      } else if (c === '"') { entre = true; }
      else if (c === ',') { fila.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); campo = '';
        if (fila.length > 1 || fila[0] !== '') filas.push(fila);
        fila = [];
      } else { campo += c; }
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  function numero(s) {
    if (s == null || String(s).trim() === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  /* Texto del CSV -> productos listos para buscar y comparar. */
  function leerProductos(texto) {
    var tabla = parsearCSV(texto);
    var cab = tabla.shift() || [];
    var out = [];
    tabla.forEach(function (celdas) {
      var r = {};
      cab.forEach(function (k, i) { r[k.trim()] = (celdas[i] || '').trim(); });
      var cat = categoriaPorSlug[r.categoria];
      var precio = numero(r.precio);
      if (!cat || !precio || precio <= 0 || !especie(r.especie)) return;
      var cantidad = numero(r.cantidad);
      var unidad = UNIDADES[r.unidad] ? r.unidad : '';
      var pu = numero(r.precio_unidad);
      if (pu === null && cantidad > 0 && unidad) pu = precio / cantidad;
      if (!unidad) pu = null;
      var carac = normalizar(r.caracteristica) === 'sin especificar' ? '' : r.caracteristica;
      out.push({
        fecha: r.fecha, tienda: r.tienda, categoria: cat.id, especie: r.especie,
        producto: r.producto, marca: r.marca, caracteristica: carac,
        cantidad: cantidad, unidad: unidad, precio: precio, precioUnidad: pu, url: r.url,
        busqueda: normalizar([r.producto, r.marca, r.tienda, cat.etiqueta, cat.claves, r.categoria,
          r.especie === 'gato' ? 'gato gatos' : r.especie === 'perro' ? 'perro perros' : 'gato gatos perro perros'].join(' '))
      });
    });
    return out;
  }

  /* Busca por palabras (todas deben aparecer) y filtra por especie y categoría. */
  function filtrar(productos, f) {
    var palabras = normalizar(f.texto).split(' ').filter(Boolean);
    return productos.filter(function (p) {
      if (f.especie && p.especie !== f.especie) return false;
      if (f.categoria && p.categoria !== f.categoria) return false;
      return palabras.every(function (w) { return p.busqueda.indexOf(w) !== -1; });
    });
  }

  function dia(fecha) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }
  function edadEnDias(fecha, hoy) {
    var h = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    var d = Math.round((h - dia(fecha)) / 86400000);
    return isFinite(d) ? Math.max(0, d) : null;
  }
  function textoEdad(d) {
    if (d === null) return 'fecha desconocida';
    return d === 0 ? 'hoy' : d === 1 ? 'hace 1 día' : 'hace ' + d + ' días';
  }

  function porPrecioUnidad(a, b) {
    var x = a.producto.precioUnidad, y = b.producto.precioUnidad;
    if (x === null && y === null) return a.producto.precio - b.producto.precio;
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y || a.producto.precio - b.producto.precio || a.producto.tienda.localeCompare(b.producto.tienda, 'es');
  }

  /* Agrupa por categoría, especie y característica equivalente (más la unidad de medida).
     Sin característica: solo se agrupa el mismo producto (marca, nombre y cantidad) en otras tiendas;
     lo demás va a un grupo "sin equivalente". */
  function agrupar(productos, hoy) {
    var grupos = {};
    function meter(clave, base, p) {
      var g = grupos[clave] || (grupos[clave] = Object.assign({ clave: clave, ofertas: [] }, base));
      g.ofertas.push({ producto: p, edad: edadEnDias(p.fecha, hoy) });
    }
    var sueltos = {};
    productos.forEach(function (p) {
      var base = { categoria: p.categoria, especie: p.especie, unidad: p.unidad };
      if (p.caracteristica) {
        meter([p.categoria, p.especie, 'c', normalizar(p.caracteristica), p.unidad].join('|'),
          Object.assign({ tipo: 'caracteristica', caracteristica: p.caracteristica }, base), p);
      } else {
        var k = [p.categoria, p.especie, normalizar(p.marca), normalizar(p.producto), p.cantidad, p.unidad].join('|');
        (sueltos[k] = sueltos[k] || []).push(p);
      }
    });
    Object.keys(sueltos).forEach(function (k) {
      var lista = sueltos[k], p0 = lista[0];
      var tiendas = {};
      lista.forEach(function (p) { tiendas[p.tienda] = 1; });
      var base = { categoria: p0.categoria, especie: p0.especie, unidad: p0.unidad };
      if (Object.keys(tiendas).length > 1) {
        lista.forEach(function (p) { meter('p|' + k, Object.assign({ tipo: 'producto', nombre: p0.producto, marca: p0.marca, cantidad: p0.cantidad }, base), p); });
      } else {
        lista.forEach(function (p) { meter([p0.categoria, p0.especie, 's', p0.unidad].join('|'), Object.assign({ tipo: 'sin-equivalente' }, base), p); });
      }
    });

    var orden = { caracteristica: 0, producto: 1, 'sin-equivalente': 2 };
    var lista = Object.keys(grupos).map(function (k) {
      var g = grupos[k];
      g.ofertas.sort(porPrecioUnidad);
      g.ofertas.forEach(function (o) {
        o.advertencia = o.edad === null || o.edad > DIAS_ADVERTENCIA;
        o.vencida = o.edad === null || o.edad > DIAS_MAXIMO;
        o.masBarata = false;
      });
      if (g.tipo !== 'sin-equivalente') {
        var elegibles = g.ofertas.filter(function (o) { return o.producto.precioUnidad !== null && !o.vencida; });
        var tiendas = {};
        elegibles.forEach(function (o) { tiendas[o.producto.tienda] = 1; });
        if (Object.keys(tiendas).length > 1) {
          var min = elegibles[0].producto.precioUnidad;
          elegibles.forEach(function (o) { if (o.producto.precioUnidad === min) o.masBarata = true; });
          g.barata = elegibles[0];
        }
      }
      return g;
    });
    function idx(arr, id) { return arr.map(function (x) { return x.id; }).indexOf(id); }
    lista.sort(function (a, b) {
      return idx(CATEGORIAS, a.categoria) - idx(CATEGORIAS, b.categoria) ||
        idx(ESPECIES, a.especie) - idx(ESPECIES, b.especie) ||
        orden[a.tipo] - orden[b.tipo] ||
        (a.caracteristica || a.nombre || '').localeCompare(b.caracteristica || b.nombre || '', 'es', { numeric: true }) ||
        a.unidad.localeCompare(b.unidad);
    });
    return lista;
  }

  function formatoPesos(n) {
    return '$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function formatoNumero(n) {
    return String(Number(n.toFixed(2))).replace('.', ',');
  }
  function textoCantidad(p) {
    if (p.cantidad === null) return 'Sin cantidad';
    var u = p.unidad === 'paño' ? (p.cantidad === 1 ? 'paño' : 'paños')
      : p.unidad === 'unidad' ? (p.cantidad === 1 ? 'unidad' : 'unidades') : p.unidad;
    return formatoNumero(p.cantidad) + ' ' + u;
  }
  function fechaLarga(fecha) {
    var d = new Date(dia(fecha));
    return isFinite(d) ? d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  }
  function fechaMasReciente(productos) {
    return productos.reduce(function (m, p) { return p.fecha > m ? p.fecha : m; }, '');
  }

  return {
    CATEGORIAS: CATEGORIAS, ESPECIES: ESPECIES, UNIDADES: UNIDADES,
    DIAS_ADVERTENCIA: DIAS_ADVERTENCIA, DIAS_MAXIMO: DIAS_MAXIMO,
    categoria: categoria, especie: especie, normalizar: normalizar,
    parsearCSV: parsearCSV, leerProductos: leerProductos, filtrar: filtrar, agrupar: agrupar,
    edadEnDias: edadEnDias, textoEdad: textoEdad,
    formatoPesos: formatoPesos, formatoNumero: formatoNumero, textoCantidad: textoCantidad,
    fechaLarga: fechaLarga, fechaMasReciente: fechaMasReciente
  };
})();
