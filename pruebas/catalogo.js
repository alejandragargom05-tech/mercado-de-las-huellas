/* Prueba del catálogo completo: cada palabra encuentra su categoría y no se colaron snacks, latas ni medicamentos.
   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc pruebas/catalogo.js */
load('assets/js/logica.js');
var productos = Huellas.leerProductos(read('data/precios.csv'));
Huellas.configurarSinonimos(JSON.parse(read('data/sinonimos.json')));
var fallas = 0;
function ok(cond, msg) { if (!cond) { fallas++; print('  FALLA: ' + msg); } }

// 1. Cada palabra encuentra su categoría (al menos la mitad de lo primero que sale; «tapete» también trae tapetes atrapa arena)
[['tapete', 'higiene'], ['popo', 'paseo'], ['saco', 'ropa'], ['plato', 'comederos'], ['collar', 'paseo'], ['arenera', 'arena']].forEach(function (c) {
  var lista = Huellas.buscar(productos, { texto: c[0], categoria: '', especie: '' }).lista;
  lista.sort(function (a, b) { return b.puntaje - a.puntaje; });
  var primeros = lista.slice(0, 20), propios = primeros.filter(function (p) { return p.categoria === c[1]; }).length;
  print(c[0] + ' -> ' + lista.length + ' resultados; ' + propios + ' de los ' + primeros.length + ' primeros son de ' + c[1] +
    (lista[0] ? ' | primero: ' + lista[0].producto + ' (' + lista[0].subcategoria + ')' : ''));
  ok(lista.length > 0 && propios >= primeros.length / 2, '«' + c[0] + '» debe encontrar ' + c[1]);
});

// 2. Todas las categorías tienen productos, y las subcategorías vienen del CSV
var porCat = {};
productos.forEach(function (p) { porCat[p.categoria] = (porCat[p.categoria] || 0) + 1; });
Huellas.CATEGORIAS.forEach(function (c) {
  ok(porCat[c.id] > 0, 'categoría sin productos: ' + c.id);
  if (c.id !== 'concentrado') ok(productos.filter(function (p) { return p.categoria === c.id && !p.subcategoria; }).length === 0, 'productos sin subcategoría en ' + c.id);
});
print('productos por categoría: ' + Huellas.CATEGORIAS.map(function (c) { return c.id + ' ' + (porCat[c.id] || 0); }).join(', '));

// 3. Unidades de comparación
function sub(cat, s) { return productos.filter(function (p) { return p.categoria === cat && p.subcategoria === s; }); }
['shampoo', 'colonia', 'eliminador'].forEach(function (s) { ok(sub('higiene', s).every(function (p) { return p.unidad === 'ml' || p.unidad === ''; }), s + ' va en ml (o sin precio por unidad si no dice el volumen)'); });
['tapete', 'pañal', 'paño'].forEach(function (s) { ok(sub('higiene', s).every(function (p) { return p.unidad === 'unidad' || p.unidad === ''; }), s + ' va por unidad'); });
ok(sub('juguetes', 'catnip').every(function (p) { return p.unidad === 'g' || p.unidad === 'ml' || p.unidad === ''; }), 'catnip va en g');
ok(productos.filter(function (p) { return p.categoria === 'concentrado' && p.unidad !== 'kg'; }).length === 0, 'concentrado en kg');

// 4. Nada de snacks, latas, medicamentos ni collares isabelinos (los paños húmedos sí valen)
var MALOS = /snack|galleta|premio|\btreats?\b|\blatas?\b|\bsobres? de \d|pouch|medicament|antipulga|pipeta|isabelino|suplemento|vitamina|desparasit|garrapata|prescri|microchip/i;
var colados = productos.filter(function (p) { return MALOS.test(p.producto); });
print('colados (snacks, latas, medicamentos): ' + colados.length);
colados.slice(0, 8).forEach(function (p) { print('  ' + p.categoria + ' | ' + p.producto); });
ok(colados.length === 0, 'no deben colarse snacks, latas ni medicamentos');
var hum = productos.filter(function (p) { return /h[uú]med/i.test(p.producto) && !(p.categoria === 'higiene' && p.subcategoria === 'paño'); });
ok(hum.length === 0, 'alimento húmedo colado: ' + (hum[0] && hum[0].producto));

// 5. Grupos: nunca mezclan subcategorías
var grupos = Huellas.agrupar(productos, new Date());
ok(grupos.every(function (g) { return g.ofertas.every(function (o) { return o.producto.subcategoria === g.subcategoria && o.producto.categoria === g.categoria; }); }), 'grupo con subcategorías mezcladas');
print(fallas ? fallas + ' FALLAS' : 'Todo en orden');
