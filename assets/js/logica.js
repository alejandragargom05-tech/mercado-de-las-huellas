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
      var nombreN = normalizar(r.producto);
      out.push({
        fecha: r.fecha, tienda: r.tienda, categoria: cat.id, especie: r.especie,
        producto: r.producto, marca: r.marca, caracteristica: carac,
        cantidad: cantidad, unidad: unidad, precio: precio, precioUnidad: pu, url: r.url,
        imagen: /^https?:\/\//i.test(r.imagen || '') ? r.imagen : '',
        nombreN: nombreN, puntaje: 0,
        busqueda: [nombreN, normalizar(r.marca), normalizar(r.tienda),
          r.especie === 'gato' ? 'gato gatos' : r.especie === 'perro' ? 'perro perros' : 'gato gatos perro perros'].join(' ')
      });
    });
    return out;
  }

  /* ---------- Búsqueda inteligente ----------
     Sin servicios externos: sinónimos de data/sinonimos.json, singular/plural, sin tildes ni mayúsculas,
     errores de una o dos letras, varias palabras (todas deben coincidir) y orden por relevancia. */
  var PALABRAS_VACIAS = { de: 1, del: 1, para: 1, con: 1, y: 1, el: 1, la: 1, los: 1, las: 1, un: 1, una: 1, en: 1, por: 1, x: 1 };
  var indiceSin = {};      // palabra normalizada (y sus formas) -> grupo
  var frasesSin = [];      // sinónimos de varias palabras
  var grupos = [];         // grupos de sinónimos
  var presentacion = {};   // palabra normalizada -> cómo se escribe (con tildes)
  var vocabulario = null, vocabularioDe = null;

  function formas(w) {
    var f = [w];
    if (w.length > 3 && /s$/.test(w)) f.push(w.slice(0, -1));
    if (w.length > 4 && /[rlnzdjs]es$/.test(w)) f.push(w.slice(0, -2));
    return f;
  }

  /* Recibe el contenido de data/sinonimos.json. Sin llamarla, la búsqueda funciona sin sinónimos. */
  function configurarSinonimos(datos) {
    indiceSin = {}; frasesSin = []; grupos = []; presentacion = {}; vocabulario = null;
    function registrar(palabra, grupo, esSinonimo) {
      var n = normalizar(palabra);
      if (!n) return;
      if (!presentacion[n]) presentacion[n] = String(palabra).toLowerCase();
      if (!esSinonimo) return;
      if (n.indexOf(' ') !== -1) { frasesSin.push({ frase: n, grupo: grupo }); return; }
      formas(n).forEach(function (k) { if (!indiceSin[k]) indiceSin[k] = grupo; });
    }
    var cats = (datos && datos.categorias) || {};
    Object.keys(cats).forEach(function (id) {
      var c = categoria(id);
      if (!c) return;
      var g = { tipo: 'categoria', id: id, nombre: c.etiqueta.toLowerCase(), palabras: cats[id].sinonimos || [] };
      grupos.push(g);
      g.palabras.forEach(function (w) { registrar(w, g, true); });
      (cats[id].variantes || []).forEach(function (w) { registrar(w, g, false); });
    });
    var esp = (datos && datos.especies) || {};
    Object.keys(esp).forEach(function (id) {
      var e = especie(id);
      if (!e) return;
      var g = { tipo: 'especie', id: id, nombre: e.etiqueta.toLowerCase(), palabras: esp[id] };
      grupos.push(g);
      g.palabras.forEach(function (w) { registrar(w, g, true); });
    });
  }

  function distancia(a, b, tope) {
    if (Math.abs(a.length - b.length) > tope) return tope + 1;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  function armarVocabulario(productos) {
    if (vocabulario && vocabularioDe === productos) return vocabulario;
    var v = {};
    productos.forEach(function (p) {
      (p.nombreN.match(/[a-z]{4,}/g) || []).forEach(function (w) { v[w] = (v[w] || 0) + 1; });
    });
    Object.keys(presentacion).forEach(function (w) { if (/^[a-z]{4,}$/.test(w)) v[w] = (v[w] || 0) + 1000; });
    vocabulario = v; vocabularioDe = productos;
    return v;
  }

  function contiene(texto, f) {
    return f.length <= 3 ? (' ' + texto + ' ').indexOf(' ' + f + ' ') !== -1 : texto.indexOf(f) !== -1;
  }
  /* Cuántos productos contienen alguna de las formas (se detiene en `tope`). */
  function cuantos(productos, fs, tope) {
    var n = 0;
    for (var i = 0; i < productos.length && n < tope; i++) {
      for (var k = 0; k < fs.length; k++) if (contiene(productos[i].busqueda, fs[k])) { n++; break; }
    }
    return n;
  }
  function grupoDe(fs) {
    for (var i = 0; i < fs.length; i++) if (indiceSin[fs[i]]) return indiceSin[fs[i]];
    return null;
  }

  /* Convierte lo escrito en una lista de condiciones; además devuelve los avisos de sinónimos y correcciones. */
  function interpretar(productos, texto) {
    var q = normalizar(texto), condiciones = [], avisos = { sinonimos: [], correcciones: [], dijo: '' };
    frasesSin.forEach(function (f) {
      if (q.indexOf(f.frase) !== -1) {
        q = (' ' + q + ' ').replace(' ' + f.frase + ' ', ' ').trim();
        condiciones.push({ token: f.frase, formas: [], grupo: f.grupo, frase: true });
      }
    });
    var dijo = [], cambio = false;
    q.split(' ').filter(function (w) { return w && !PALABRAS_VACIAS[w]; }).forEach(function (w) {
      var fs = formas(w), g = grupoDe(fs), c = { token: w, formas: fs, grupo: g };
      var n = g || w.length < 5 ? 3 : cuantos(productos, fs, 3);
      if (!g && n < 3 && w.length >= 5) {
        // Casi no aparece tal cual: se busca la palabra parecida más común (una letra de error, dos si es muy larga).
        var tope = w.length >= 9 ? 2 : 1, voc = armarVocabulario(productos), mejor = null, md = 9, mf = -1;
        Object.keys(voc).forEach(function (cand) {
          var d = distancia(w, cand, tope);
          if (d >= 1 && d <= tope && (d < md || (d === md && voc[cand] > mf))) { mejor = cand; md = d; mf = voc[cand]; }
        });
        if (mejor && voc[mejor] >= 10 * Math.max(n, 1)) {
          c.formas = formas(mejor); c.grupo = grupoDe(c.formas); c.corregida = mejor;
          avisos.correcciones.push({ de: w, a: presentacion[mejor] || mejor });
          cambio = true;
        }
      }
      dijo.push(c.corregida ? (presentacion[c.corregida] || c.corregida) : w);
      condiciones.push(c);
    });
    if (cambio) avisos.dijo = dijo.join(' ');
    condiciones.forEach(function (c) {
      var g = c.grupo;
      if (!g || c.corregida) return;
      var propia = normalizar(g.palabras[0]);
      if (c.frase ? c.token === propia : formas(propia).indexOf(c.token) !== -1 || c.formas.indexOf(propia) !== -1) return;
      var visible = c.frase ? c.token : (presentacion[c.token] || c.formas.map(function (f) { return presentacion[f]; }).filter(Boolean)[0] || c.token);
      var otra = g.palabras.slice(1).filter(function (x) { var n = normalizar(x); return n !== c.token && n.indexOf(' ') === -1 && c.formas.indexOf(n) === -1; })[0];
      avisos.sinonimos.push({ grupo: g.nombre, palabras: otra ? [visible, otra.toLowerCase()] : [visible] });
    });
    return { condiciones: condiciones, avisos: avisos };
  }

  /* Puntaje de un producto para una condición: 0 = no coincide. */
  function puntajeDe(p, c) {
    var mejor = 0;
    c.formas.forEach(function (f) {
      if (!f) return;
      if ((' ' + p.nombreN + ' ').indexOf(' ' + f + ' ') !== -1) mejor = Math.max(mejor, 3);
      else if (contiene(p.nombreN, f)) mejor = Math.max(mejor, 2.5);
      else if (contiene(p.busqueda, f)) mejor = Math.max(mejor, 2);
    });
    if (c.grupo && !mejor) {
      var g = c.grupo;
      if (g.tipo === 'categoria' ? p.categoria === g.id : (p.especie === g.id || p.especie === 'ambos')) mejor = 1;
    }
    return mejor;
  }

  function coincidencias(productos, interpretacion, especieId, categoriaId) {
    var cond = interpretacion.condiciones, frase = interpretacion.frase;
    var lista = [];
    productos.forEach(function (p) {
      if (especieId && p.especie !== especieId) return;
      if (categoriaId && p.categoria !== categoriaId) return;
      var total = 0;
      for (var i = 0; i < cond.length; i++) {
        var s = puntajeDe(p, cond[i]);
        if (!s) return;
        total += s;
      }
      if (frase && p.nombreN.indexOf(frase) !== -1) total += 2;
      p.puntaje = total;
      lista.push(p);
    });
    return lista;
  }

  /* Busca y filtra por especie y categoría. Si el texto no da nada dentro del filtro activo, busca en las demás
     categorías (y especies) y lo avisa. f.estricto = true desactiva esa ampliación.
     Devuelve { lista, avisos, ampliada: { dentro, cantidad, en } | null }. */
  function buscar(productos, f) {
    var texto = f.texto || '';
    var inter = texto.trim() ? interpretar(productos, texto) : { condiciones: [], avisos: { sinonimos: [], correcciones: [], dijo: '' } };
    inter.frase = inter.condiciones.length > 1 ? normalizar(texto) : '';
    var lista = coincidencias(productos, inter, f.especie, f.categoria), ampliada = null;
    if (!lista.length && inter.condiciones.length && (f.especie || f.categoria) && !f.estricto) {
      var otra = f.categoria ? coincidencias(productos, inter, f.especie, '') : [];
      var quitoEspecie = false;
      if (!otra.length) { otra = coincidencias(productos, inter, '', ''); quitoEspecie = !!f.especie; }
      if (otra.length) {
        lista = otra;
        var dentro = [];
        if (f.categoria) dentro.push('en ' + categoria(f.categoria).etiqueta);
        if (f.especie) dentro.push('para ' + especie(f.especie).etiqueta);
        var usaCats = !!f.categoria, claves = {}, nombres = [];
        otra.forEach(function (p) {
          var k = usaCats ? categoria(p.categoria).etiqueta : especie(p.especie).etiqueta;
          if (!claves[k]) { claves[k] = 1; nombres.push(k); }
        });
        var en = nombres.length === 1 ? nombres[0]
          : nombres.length <= 3 ? nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1]
          : (usaCats ? 'otras categorías' : 'otras especies');
        ampliada = { dentro: dentro.join(' '), cantidad: otra.length, en: en, quitoEspecie: quitoEspecie, preposicion: usaCats ? 'en' : 'para' };
      }
    }
    return { lista: lista, avisos: inter.avisos, ampliada: ampliada };
  }
  function filtrar(productos, f) { return buscar(productos, f).lista; }

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
      g.puntaje = g.ofertas.reduce(function (m, o) { return Math.max(m, o.producto.puntaje || 0); }, 0);
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
      return (b.puntaje - a.puntaje) ||
        idx(CATEGORIAS, a.categoria) - idx(CATEGORIAS, b.categoria) ||
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
    configurarSinonimos: configurarSinonimos, buscar: buscar,
    parsearCSV: parsearCSV, leerProductos: leerProductos, filtrar: filtrar, agrupar: agrupar,
    edadEnDias: edadEnDias, textoEdad: textoEdad,
    formatoPesos: formatoPesos, formatoNumero: formatoNumero, textoCantidad: textoCantidad,
    fechaLarga: fechaLarga, fechaMasReciente: fechaMasReciente
  };
})();
