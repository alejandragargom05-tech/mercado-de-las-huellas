/* Prueba de la lógica con JavaScriptCore (viene con macOS, no se instala nada):
   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc pruebas/probar.js */
load('assets/js/logica.js');
var texto = read('data/precios.csv');
var productos = Huellas.leerProductos(texto);
var hoy = new Date(), fallas = 0;
function ok(cond, msg) { if (!cond) { fallas++; print('  FALLA: ' + msg); } }

function revisar(titulo, filtro, esperaTipo) {
  var lista = Huellas.filtrar(productos, filtro);
  var grupos = Huellas.agrupar(lista, hoy);
  print('\n== ' + titulo + ': ' + lista.length + ' productos, ' + grupos.length + ' grupos');
  var vistos = {};
  grupos.forEach(function (g) {
    var pu = g.ofertas.map(function (o) { return o.producto.precioUnidad; }).filter(function (x) { return x !== null; });
    var ordenado = pu.every(function (x, i) { return i === 0 || pu[i - 1] <= x; });
    var barata = g.ofertas.filter(function (o) { return o.masBarata; });
    print('  ' + g.tipo + ' | ' + (g.caracteristica || g.nombre || '-') + ' | ' + (g.unidad || 'sin unidad') +
      ' | ' + g.ofertas.length + ' ofertas | min ' + (pu.length ? Huellas.formatoPesos(pu[0]) : '-') +
      ' | barata: ' + (barata.length ? barata[0].producto.tienda : 'no'));
    ok(ordenado, 'grupo sin ordenar ' + g.clave);
    ok(!vistos[g.clave], 'clave de grupo repetida ' + g.clave); vistos[g.clave] = 1;
    if (g.tipo === 'caracteristica') g.ofertas.forEach(function (o) {
      ok(Huellas.normalizar(o.producto.caracteristica) === Huellas.normalizar(g.caracteristica), 'característica mezclada en ' + g.clave);
      ok(o.producto.unidad === g.unidad && o.producto.especie === g.especie, 'unidad o especie mezclada en ' + g.clave);
    });
    if (g.tipo === 'sin-equivalente') ok(!barata.length, 'insignia en grupo sin equivalente');
  });
  ok(grupos.some(function (g) { return g.barata; }), titulo + ': ningún grupo con la más barata');
  if (esperaTipo) ok(grupos.filter(function (g) { return g.tipo === esperaTipo; }).length > 1, titulo + ': se esperaban varios grupos ' + esperaTipo);
  return grupos;
}

var arena = revisar('arena + Gatos', { texto: 'arena', especie: 'gato' }, 'caracteristica');
var arnes = revisar('arnés + Perros', { texto: 'arnés', especie: 'perro' }, 'caracteristica');
arnes.forEach(function (g) { if (g.tipo === 'caracteristica') print('  talla/medida: ' + g.caracteristica); });

/* Dos tarjetas al azar: precio por unidad = precio / cantidad, contra el CSV crudo */
var crudo = Huellas.parsearCSV(texto), cab = crudo.shift();
var col = {}; cab.forEach(function (k, i) { col[k] = i; });
var todas = [];
Huellas.agrupar(productos, hoy).forEach(function (g) { g.ofertas.forEach(function (o) { if (o.producto.precioUnidad !== null) todas.push(o.producto); }); });
print('\n== Dos tarjetas al azar');
for (var n = 0; n < 2; n++) {
  var p = todas[Math.floor(Math.random() * todas.length)];
  var r = crudo.filter(function (f) { return f[col.url] === p.url && f[col.producto] === p.producto && f[col.cantidad] === String(p.cantidad); })[0];
  var esperado = Number(r[col.precio]) / Number(r[col.cantidad]);
  print('  ' + p.tienda + ' | ' + p.producto + ' | ' + r[col.precio] + ' / ' + r[col.cantidad] + ' ' + r[col.unidad] + ' = ' + esperado.toFixed(2) +
    ' | CSV precio_unidad ' + r[col.precio_unidad] + ' | web ' + p.precioUnidad);
  ok(Math.abs(p.precioUnidad - esperado) <= 0.01 * esperado, 'precio por unidad no cuadra (más de 1 %)');
}

/* Sanidad: precio por unidad del CSV vs precio / cantidad en todas las filas */
var malas = todas.filter(function (p) { return p.cantidad > 0 && Math.abs(p.precioUnidad - p.precio / p.cantidad) > 0.01 * p.precioUnidad; });
print('\nFilas con precio por unidad a más de 1 % de precio/cantidad (cantidad redondeada en el CSV): ' + malas.length);
/* Hora de la última actualización (data/estado.json) y categorías del panel */
print('\n== Actualización y panel');
var ahora = new Date('2026-10-10T20:00:00Z'); // 3:00 p. m. en Colombia
var t = Huellas.textoActualizacion({ actualizado: '2026-10-10T06:03:11-05:00', tiendas_consultadas: 38, productos_actualizados: 9120, tiendas_con_problemas: [] }, ahora);
print('  ' + (t && t.titulo) + ' | ' + (t && t.detalle));
ok(t && /^Precios actualizados hoy a las 6:03/.test(t.titulo), 'el título debe decir «hoy a las 6:03»');
ok(t && /38 tiendas/.test(t.detalle) && /9\.120 productos/.test(t.detalle), 'tiendas y productos en el detalle');
var ayer = Huellas.textoActualizacion({ actualizado: '2026-10-09T23:00:00Z', tiendas_consultadas: 1, productos_actualizados: 1, tiendas_con_problemas: ['X'] }, ahora);
ok(ayer && /el 9 de octubre de 2026 a las 6:00/.test(ayer.titulo) && /1 tienda y/.test(ayer.detalle) && /No actualizado/.test(ayer.detalle), 'fecha de ayer y tiendas con problemas: ' + (ayer && ayer.titulo));
ok(Huellas.textoActualizacion({ actualizado: 'basura' }, ahora) === null && Huellas.textoActualizacion(null, ahora) === null, 'estado inválido -> null');
var cat0 = Huellas.CATEGORIAS.map(function (c) { return c.id; });
ok(!Huellas.configurarCategorias({ categorias: [{ id: 'inventada', orden: 1, visible: true }] }), 'categoría inexistente se rechaza');
ok(Huellas.CATEGORIAS.length === cat0.length, 'un archivo inválido no cambia nada');
ok(Huellas.configurarCategorias({ categorias: [{ id: 'ropa', orden: 1, visible: true }, { id: 'concentrado', orden: 2, visible: true }, { id: 'rastreo', orden: 3, visible: false }] }), 'archivo válido');
var ids = Huellas.CATEGORIAS.map(function (c) { return c.id; });
ok(ids[0] === 'ropa' && ids[1] === 'concentrado' && ids.indexOf('rastreo') === -1, 'orden y categoría oculta: ' + ids.join(','));
ok(Huellas.leerProductos(texto).every(function (p) { return p.categoria !== 'rastreo'; }), 'los productos de una categoría oculta no entran');
print(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en orden');
