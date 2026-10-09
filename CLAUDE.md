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
- Catálogo: arena sanitaria, gimnasios y rascadores, fuentes y comederos automáticos, arneses y correas, juguetes interactivos, camas, shampoo y paños húmedos, y bolsos transportadores.
- Se compara por precio por unidad de medida, no por paquete:
  - Arena: por kg (por litro si la tienda solo informa litros, sin convertir).
  - Shampoo: por ml.
  - Paños húmedos: por paño.
  - Accesorios: por unidad.
- Solo se comparan productos equivalentes: misma especie, mismo tipo y características similares (talla, capacidad en litros, altura en cm o tipo de arena).
- Filtros por especie (Gatos, Perros, Ambos) y por categoría.
- La búsqueda usa `data/sinonimos.json` (palabras que se usan en Colombia); amplíalo cuando aparezcan variantes nuevas.
- Siempre visible: "Mercado de las Huellas compara precios; no reemplaza la recomendación de tu veterinario".
- La lista de tiendas no es cerrada: el proyecto debe seguir buscando tiendas de mascotas de Colombia competitivas en precio que no estén en la lista.
- Tiendas, distribuidores y marcas a buscar (Trixie, Chuckit): ver `TIENDAS.md`.
- Identidad visual y de voz: ver `BRAND.md`. Toda pantalla debe seguirlo (colores, tipografía, ilustraciones, voz y movimiento). La referencia visual es `brand.html`.
