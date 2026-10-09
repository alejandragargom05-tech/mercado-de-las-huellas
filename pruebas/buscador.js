/* Prueba de la búsqueda con JavaScriptCore (viene con macOS):
   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc pruebas/buscador.js */
load('assets/js/logica.js');
var texto = read('data/precios.csv');
var productos = Huellas.leerProductos(texto);
Huellas.configurarSinonimos(JSON.parse(read('data/sinonimos.json')));
var fallas = 0;
function ok(cond, msg) { if (!cond) { fallas++; print('  FALLA: ' + msg); } }
function cats(lista) { var c = {}; lista.forEach(function (p) { c[p.categoria] = (c[p.categoria] || 0) + 1; }); return JSON.stringify(c); }
function aviso(r) {
  return r.avisos.sinonimos.map(function (s) { return 'Mostrando ' + s.grupo + ', también buscamos ' + s.palabras.join(' y '); })
    .concat(r.avisos.dijo ? ['¿Quisiste decir ' + r.avisos.dijo + '?'] : []).join(' | ') || '-';
}

// 1. "arena" con el chip Juguetes activo: muestra las arenas y avisa
var r = Huellas.buscar(productos, { texto: 'arena', categoria: 'juguetes', especie: '' });
print('arena + chip Juguetes -> ' + r.lista.length + ' resultados ' + cats(r.lista));
print('  aviso: No hay «arena» ' + (r.ampliada && r.ampliada.dentro) + '. Te mostramos ' + (r.ampliada && r.ampliada.cantidad) + ' resultados en ' + (r.ampliada && r.ampliada.en));
ok(r.ampliada && r.lista.length > 0 && r.lista.every(function (p) { return p.categoria === 'arena'; }), 'arena con Juguetes debe mostrar solo arenas con aviso');
var e = Huellas.buscar(productos, { texto: 'arena', categoria: 'juguetes', especie: '', estricto: true });
ok(e.lista.length === 0 && !e.ampliada, 'con "volver al filtro" no debe ampliar');

// 2. "sofa" encuentra camas
r = Huellas.buscar(productos, { texto: 'sofa', categoria: '', especie: '' });
print('sofa -> ' + r.lista.length + ' ' + cats(r.lista) + ' | ' + aviso(r));
ok(r.lista.length > 0 && r.lista.every(function (p) { return p.categoria === 'camas'; }), 'sofa debe encontrar solo camas');
ok(r.avisos.sinonimos.length === 1, 'sofa debe avisar el sinónimo');

// 3. "arnes perro" y "harnes" encuentran arneses
['arnes perro', 'harnes', 'arneses', 'ARNÉS', 'pechera'].forEach(function (q) {
  r = Huellas.buscar(productos, { texto: q, categoria: '', especie: '' });
  print(q + ' -> ' + r.lista.length + ' ' + cats(r.lista) + ' | ' + aviso(r));
  ok(r.lista.length > 0 && r.lista.every(function (p) { return p.categoria === 'arneses-correas'; }), q + ' debe encontrar solo arneses');
});
r = Huellas.buscar(productos, { texto: 'harnes', categoria: '', especie: '' });
ok(r.avisos.dijo === 'arnés', 'harnes debe sugerir arnés, dijo: ' + r.avisos.dijo);

// Otros: varias palabras, plural, sinónimos de la lista, orden por relevancia
[['guacal', 'transportadores'], ['champu', 'shampoo'], ['panitos', 'panos'], ['bebedero', 'fuentes-comederos'], ['kennel', 'transportadores'], ['cucha', 'camas'], ['arena gatos', 'arena'], ['aren', 'arena']].forEach(function (c) {
  r = Huellas.buscar(productos, { texto: c[0], categoria: '', especie: '' });
  print(c[0] + ' -> ' + r.lista.length + ' ' + cats(r.lista) + ' | ' + aviso(r));
  ok(r.lista.length > 0, c[0] + ' no encontró nada');
});
var g = Huellas.agrupar(Huellas.buscar(productos, { texto: 'cama perro' , categoria: '', especie: '' }).lista, new Date());
ok(g.length > 0 && g[0].puntaje >= g[g.length - 1].puntaje, 'grupos sin ordenar por relevancia');
ok(Huellas.buscar(productos, { texto: 'zzzzqqq', categoria: '', especie: '' }).lista.length === 0, 'texto absurdo no debe encontrar nada');

var con = productos.filter(function (p) { return p.imagen; }).length;
print('\nFilas con imagen: ' + con + ' de ' + productos.length + ' (' + (100 * con / productos.length).toFixed(1) + ' %)');
print(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en orden');
