# Mercado de las Huellas

Web que compara precios de productos y accesorios para gatos y perros entre tiendas de Colombia y muestra la opción más barata para productos equivalentes.

## Reglas

- Sitio estático en HTML, CSS y JavaScript, sin frameworks ni build; debe funcionar en GitHub Pages.
- Todo el texto en español de Colombia. Precios en pesos colombianos con formato `$ 45.900`.
- Diseño primero para celular (mobile first).
- Los datos viven en `data/precios.csv` y se leen en el navegador. Nunca inventes ni edites precios a mano.
- Cada precio muestra tienda y fecha.
- Las fotos se enlazan desde la tienda (columna `imagen` del CSV, URL tal como la publica la tienda); nunca se descargan ni se copian al repositorio. La tarjeta siempre lleva a esa tienda.
- Los precios deben estar siempre al día: se actualizan solos cada día, tienda por tienda, y la web muestra la fecha y hora de la última actualización.
- Catálogo, una categoría por chip (cada una con su ilustración en `assets/ilustraciones/`):
  - Concentrado: alimento seco para perros y gatos (croquetas).
  - Arena y areneras: arena, areneras, palas y bolsas para arenero.
  - Rascadores y gimnasios.
  - Comederos y bebederos: platos, tazones, comederos dobles, elevados, lentos y automáticos, fuentes, bebederos y contenedores para alimento.
  - Paseo: collares, correas, arneses, bozales, bolsas recolectoras de popó y sus dispensadores, coches y paseadores.
  - Camas y descanso: camas, colchonetas, mantas, cojines, sofás, cuchas y casas.
  - Juguetes, incluidos catnip y pasto para gato.
  - Higiene y aseo: shampoo, paños y toallitas, tapetes absorbentes y pañales, colonias, eliminadores de olores y manchas, cepillos y peines, cortaúñas y limpieza dental no medicada.
  - Ropa: sacos, buzos, impermeables, chaquetas y disfraces.
  - Transporte y seguridad: guacales, bolsos, morrales, cinturones y protectores para el carro, rejas y corrales.
  - Rastreo e identificación: collares con GPS, rastreadores GPS, soportes para AirTag, placas con código QR y placas de identificación grabadas. No se incluyen los microchips implantables (los implanta el veterinario): si alguien busca microchip, la web se lo explica.
- Exclusiones (el scraper las descarta): snacks, premios, alimento húmedo (latas y sobres), medicamentos, antipulgas, suplementos, dietas veterinarias de prescripción, collares isabelinos y productos para otras especies. Los collares normales, areneras, palas, cepillos, cortaúñas, tapetes y pañales sí entran.
- El CSV trae la columna `subcategoria` (al final: collar, correa, tapete, pala, plato...). Dentro de cada categoría se filtra por subcategoría (fila «¿Qué tipo?»).
- Se compara por precio por unidad de medida, no por paquete:
  - Arena y concentrado: por kg (la arena por litro si la tienda solo informa litros, sin convertir; en concentrado la cantidad se convierte de gramos y libras a kg).
  - Shampoo, colonias y eliminadores de olores y manchas: por ml.
  - Catnip y pasto para gato: por g.
  - Tapetes, pañales, paños y bolsas recolectoras: por unidad (un paquete x 30 tapetes se compara por tapete).
  - Los demás accesorios y el rastreo: por unidad.
- Solo se comparan productos de la misma categoría, subcategoría, especie y característica (tipo, talla, capacidad, etapa o tamaño de raza).
  - Concentrado: misma marca, línea, etapa (cachorro, adulto o senior) y tamaño de raza (pequeña, mediana o grande) cuando el nombre lo diga; se compara el mismo concentrado entre tiendas y tamaños de bolsa. Hay filtro por marca (incluye Br for Dog, Br for Cat y Monello).
  - Rastreo: solo el mismo tipo (GPS, porta-AirTag, placa QR o placa grabada).
- Filtros por especie (Gatos, Perros, Ambos) y por categoría.
- La búsqueda usa `data/sinonimos.json` (palabras que se usan en Colombia, por categoría o por grupo de subcategorías); amplíalo cuando aparezcan variantes nuevas.
- Siempre visible: "Mercado de las Huellas compara precios; no reemplaza la recomendación de tu veterinario".
- La lista de tiendas no es cerrada: el proyecto debe seguir buscando tiendas de mascotas de Colombia competitivas en precio que no estén en la lista.
- Tiendas, distribuidores y marcas a buscar (Trixie, Chuckit): ver `TIENDAS.md`.
- Identidad visual y de voz: ver `BRAND.md`. Toda pantalla debe seguirlo (colores, tipografía, ilustraciones, voz y movimiento). La referencia visual es `brand.html`.

- Sugerencias de la gente: formulario anónimo (sin correo, nombre ni cuenta) que envía a un Google Form; sus constantes están en `assets/js/comun.js`.
