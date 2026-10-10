/* Prueba de concentrado y rastreo:
   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc pruebas/nuevas-categorias.js */
load('assets/js/logica.js');
var productos = Huellas.leerProductos(read('data/precios.csv'));
Huellas.configurarSinonimos(JSON.parse(read('data/sinonimos.json')));
var fallas = 0;
function ok(cond, msg) { if (!cond) { fallas++; print('  FALLA: ' + msg); } }
function buscar(q) { return Huellas.buscar(productos, { texto: q, categoria: '', especie: '' }).lista; }

var r = buscar('pepas');
print('pepas -> ' + r.length + ' resultados');
ok(r.length > 0 && r.every(function (p) { return p.categoria === 'concentrado'; }), '"pepas" debe encontrar solo concentrado');

r = buscar('gps');
print('gps -> ' + r.length + ' resultados');
ok(r.length > 0 && r.every(function (p) { return p.categoria === 'rastreo'; }), '"gps" debe encontrar solo rastreo');

var MALOS = /snack|galleta|premio|treat|\blatas?\b|\bsobres?\b|pouch|h[uú]med|pat[eé]\b|prescri|veterinar/i;
var colados = productos.filter(function (p) { return (p.categoria === 'concentrado') && MALOS.test(p.producto); });
print('snacks, latas o sobres colados en concentrado: ' + colados.length);
colados.slice(0, 5).forEach(function (p) { print('  ' + p.producto); });
ok(colados.length === 0, 'no deben colarse snacks, premios, latas ni sobres');
ok(productos.filter(function (p) { return p.categoria === 'concentrado' && (p.unidad !== 'kg' || p.cantidad < 0.3); }).length === 0, 'el concentrado va en kg');
ok(productos.filter(function (p) { return /microchip/i.test(p.producto); }).length === 0, 'sin microchips');
ok(productos.filter(function (p) { return p.categoria === 'rastreo' && /antipulga/i.test(p.producto); }).length === 0, 'sin collares antipulgas');
ok(Huellas.pideMicrochip('Micro chip para perro') && !Huellas.pideMicrochip('gps'), 'detecta la búsqueda de microchip');

var marcas = Huellas.marcasConcentrado(productos);
print('marcas de concentrado: ' + marcas.map(function (m) { return m.marca + ' (' + m.n + ')'; }).join(', '));
var grupos = Huellas.agrupar(productos.filter(function (p) { return p.categoria === 'concentrado'; }), new Date());
var multi = grupos.filter(function (g) { var t = {}; g.ofertas.forEach(function (o) { t[o.producto.tienda] = 1; }); return Object.keys(t).length > 1; });
print('grupos de concentrado en más de una tienda: ' + multi.length);
if (multi[0]) multi[0].ofertas.slice(0, 3).forEach(function (o) { print('  ' + multi[0].caracteristica + ' | ' + o.producto.tienda + ' | ' + o.producto.cantidad + ' kg | ' + Huellas.formatoPesos(o.producto.precioUnidad) + '/kg'); });
print(fallas ? fallas + ' fallas' : 'Todo bien');
