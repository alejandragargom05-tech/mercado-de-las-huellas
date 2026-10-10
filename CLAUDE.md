# Mercado de las Huellas

Web que compara precios de productos y accesorios para gatos y perros entre tiendas de Colombia y muestra la opción más barata para productos equivalentes.

## Reglas

- Sitio estático en HTML, CSS y JavaScript, sin frameworks ni build; debe funcionar en GitHub Pages.
- Todo el texto en español de Colombia. Precios en pesos colombianos con formato `$ 45.900`.
- Diseño primero para celular (mobile first).
- Los datos viven en `data/precios.csv` y se leen en el navegador. Nunca inventes ni edites precios a mano.
- Cada precio muestra tienda y fecha. El número grande de la tarjeta es el precio real del producto como se vende; el precio por unidad de medida va debajo, más pequeño.
- Las fotos se enlazan desde la tienda (columna `imagen` del CSV, URL tal como la publica la tienda); nunca se descargan ni se copian al repositorio. La tarjeta siempre lleva a esa tienda.
- Los precios deben estar siempre al día: `.github/workflows/actualizar-precios.yml` los actualiza solo dos veces al día, a las 6:00 a. m. y 6:00 p. m. de Colombia (11:00 y 23:00 UTC), y a mano con `workflow_dispatch` (`gh workflow run actualizar-precios.yml`). La web muestra arriba «Precios actualizados hoy a las [hora]» con la fecha y hora reales de la última corrida, las tiendas consultadas y los productos actualizados (sale de `data/estado.json`).
  - `scraper.py` lee `data/tiendas.csv`, consulta solo las tiendas aprobadas y reescribe `data/precios.csv` con precio, tienda, `fecha_hora` de la consulta y `estado_precio`. Cada precio nuevo o que cambió se agrega a `data/historico.csv`; ese archivo solo crece, nunca se borran filas.
  - Si una tienda o un producto falla, se conserva el último precio válido con su fecha original y queda `estado_precio = no actualizado` (la tarjeta lo dice). Nunca se rellena ni se estima un precio. Una tienda que pasa a bloqueada, sin catálogo o pausada pierde sus filas.
  - Mercado Libre Colombia (sitio MCO) se consulta con su API oficial y lee `ML_CLIENT_ID` y `ML_CLIENT_SECRET` de los secretos de GitHub (nunca en el código); si no están, se salta y el log lo avisa.
  - Si falla la tarea se abre un issue; si pasan 50 días sin commits, la tarea hace un commit de mantenimiento en `data/` para que GitHub no la apague. Los commits de la tarea tocan solo `data/` («Precios actualizados AAAA-MM-DD»).
  - Cada domingo corre un trabajo semanal: `scripts/descubrir_tiendas.py` y `scraper.py --solo-revision` vuelven a revisar `robots.txt`, términos de uso y catálogo de cada tienda, y el mensaje del commit cuenta qué cambió.
- Panel en Google Sheets, para lo del día a día sin tocar el código. Una hoja con cuatro pestañas: Tiendas (tienda, url, tipo, acción: sumar, pausar o bloquear, nota), Sinónimos (palabra, categoría), Textos (clave y valor: aviso superior, texto del banner de hallazgos, enlace de Instagram, enlace del formulario) y Categorías (categoría, orden, visible). `panel/plantillas/` trae un CSV por pestaña con los valores actuales.
  - `scripts/leer_panel.py` descarga cada pestaña desde `ENLACE_DE_MI_PANEL` (vacía: no hace nada y no falla), valida (urls reales, categorías existentes, sin columnas de precio) y actualiza `data/tiendas-candidatas.csv`, `data/sinonimos.json`, `data/textos.json` y `data/categorias.json`. Corre al inicio de la tarea automática, antes del scraper.
  - Cada pestaña se aplica entera o no se aplica. Si el panel no responde o trae errores se conservan los últimos datos válidos y se abre un issue con la fila que falló.
  - El panel nunca puede editar precios ni el orden por precio. «Pausar» y «bloquear» dejan la tienda fuera del scraper; solo «sumar» la reactiva. La web lee textos y categorías de `data/textos.json` y `data/categorias.json`; sin esos archivos usa los valores por defecto del código.
- Catálogo, una categoría por chip (cada una con su ilustración en `assets/ilustraciones/`; los chips y los resultados van en orden de demanda: Concentrado, Arena, Higiene, Paseo, Juguetes, Comederos, Camas, Rascadores, Transporte, Ropa, Rastreo). Ninguna categoría visible puede quedar vacía; el color o estampado del nombre nunca decide la categoría:
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
- Cómo se leen los catálogos (`scraper.py`), solo si `robots.txt` y los términos de uso lo permiten: VTEX, Shopify, WooCommerce (`/wp-json/wc/store/v1/products`) y, si no hay ninguno, el sitemap con los datos estructurados de producto (JSON-LD de schema.org). Sin navegadores ni simular personas; 1,5 s entre consultas. Si `robots.txt` cierra la API de una tienda, no se rodea leyendo sus páginas. Productos con variantes de distinto precio que la fuente no separa se omiten.
- Cada tienda tiene un `tipo` en `data/tiendas.csv` (cadena, tienda o emprendimiento; sale del encabezado de su sección en `TIENDAS.md`) y `precios.csv` lo trae como `tipo_tienda`. Las de tipo emprendimiento llevan la insignia «Emprendimiento colombiano» y el filtro «Apoya lo local»; la insignia nunca cambia el orden por precio.
- Crecimiento automático: `scripts/descubrir_tiendas.py` prueba las tiendas de `data/tiendas-candidatas.csv` y las respuestas «Quiero sumar mi tienda» de la hoja del formulario; deja cada una aprobada, bloqueada (robots.txt o términos de uso) o sin catálogo público, con su motivo. Se programa cada semana.
- La lista de tiendas no es cerrada: el proyecto debe seguir buscando tiendas de mascotas de Colombia competitivas en precio que no estén en la lista.
- Tiendas, distribuidores y marcas a buscar (Trixie, Chuckit): ver `TIENDAS.md`.
- Identidad visual y de voz: ver `BRAND.md`. Toda pantalla debe seguirlo (colores, tipografía, ilustraciones, voz y movimiento). La referencia visual es `brand.html`.

- Sugerencias de la gente: formulario anónimo (sin correo, nombre ni cuenta) que envía a un Google Form; sus constantes están en `assets/js/comun.js`. Los campos cuyo `entry.*` aún no está conectado no se muestran ni se envían; «Quiero sumar mi tienda» pide el enlace de la tienda cuando esa pregunta exista.
