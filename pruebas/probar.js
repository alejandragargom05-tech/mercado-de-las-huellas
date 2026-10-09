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
print(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en orden');
