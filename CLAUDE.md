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
- Catálogo: arena sanitaria, gimnasios y rascadores, fuentes y comederos automáticos, arneses y correas, juguetes interactivos, camas, shampoo y paños húmedos, bolsos transportadores, concentrado y rastreo e identificación.
  - Concentrado: alimento seco para perros y gatos (croquetas). Siguen excluidos snacks, premios, alimento húmedo (latas y sobres), medicamentos y dietas veterinarias de prescripción.
  - Rastreo e identificación: collares con GPS, rastreadores GPS, soportes para AirTag, placas con código QR y placas de identificación grabadas. No se incluyen los microchips implantables (los implanta el veterinario): si alguien busca microchip, la web se lo explica.
- Se compara por precio por unidad de medida, no por paquete:
  - Arena: por kg (por litro si la tienda solo informa litros, sin convertir).
  - Shampoo: por ml.
  - Paños húmedos: por paño.
  - Concentrado: por kg (la cantidad se convierte de gramos y libras a kg).
  - Accesorios y rastreo: por unidad.
- Solo se comparan productos equivalentes: misma especie, mismo tipo y características similares (talla, capacidad en litros, altura en cm o tipo de arena).
  - Concentrado: misma marca, línea, etapa (cachorro, adulto o senior) y tamaño de raza (pequeña, mediana o grande) cuando el nombre lo diga; se compara el mismo concentrado entre tiendas y tamaños de bolsa. Hay filtro por marca.
  - Rastreo: solo el mismo tipo (GPS, porta-AirTag, placa QR o placa grabada).
- Filtros por especie (Gatos, Perros, Ambos) y por categoría.
- La búsqueda usa `data/sinonimos.json` (palabras que se usan en Colombia); amplíalo cuando aparezcan variantes nuevas.
- Siempre visible: "Mercado de las Huellas compara precios; no reemplaza la recomendación de tu veterinario".
- La lista de tiendas no es cerrada: el proyecto debe seguir buscando tiendas de mascotas de Colombia competitivas en precio que no estén en la lista.
- Tiendas, distribuidores y marcas a buscar (Trixie, Chuckit): ver `TIENDAS.md`.
- Identidad visual y de voz: ver `BRAND.md`. Toda pantalla debe seguirlo (colores, tipografía, ilustraciones, voz y movimiento). La referencia visual es `brand.html`.

- Sugerencias de la gente: formulario anónimo (sin correo, nombre ni cuenta) que envía a un Google Form; sus constantes están en `assets/js/comun.js`.
