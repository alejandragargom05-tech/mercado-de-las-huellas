# Marca — Mercado de las Huellas

Toda pantalla debe seguir este documento. Si algo no está aquí, decide con el espíritu de la marca: calidez, serenidad y criterio.

## Idea
- **Concepto:** branding experiencial (lifestyle) de corte premium, con estética mediterránea cicládica y minimalista.
- **Mensaje:** no vendemos productos; acompañamos el amor por tu peludito.
- **Problema que resolvemos:** encontrar sitios seguros y económicos para comprarle lo que necesita.
- **Posicionamiento:** frente a las plataformas básicas de precios, vendemos una actitud: cuidar con cariño y con criterio.
- **Frase ancla:** "Mismo producto. Menos pesos."

## Color
| Rol | Valor | Uso | Nunca |
|---|---|---|---|
| Crema cálido | `#F4F0EA` | Fondo de las secciones | — |
| Blanco | `#FFFFFF` | Tarjetas (sombra suave, esquinas de 24 px) | — |
| Azul cicládico | `#2B3CA0` | Solo titulares, cifras, enlaces y botones; también bloques destacados y pie | Texto largo |
| Texto principal | `#2E2B33` | Cuerpo de texto | — |
| Gris cálido | `#6F6B76` | Solo texto de apoyo | Precios, botones, instrucciones |
| Lavanda | `#C8CBE8` | Solo patrones e ilustraciones de fondo, con poca opacidad | Texto, bordes de controles |

### Colores semánticos
Se usan con moderación, siempre acompañados de texto (nunca solo el color) y con contraste AA. Cada uno trae su fondo suave.

| Significado | Modo claro (texto / fondo) | Modo oscuro (texto / fondo) | Uso |
|---|---|---|---|
| Verde oliva: "La más barata" y el ahorro | `#4F5B17` / `#EEF2DC` | `#BCCE6C` / `#2A3114` | Insignia, borde de la tarjeta más barata, chip activo |
| Ámbar: precio de más de 7 días | `#7A4700` / `#FFF1D1` | `#F2B84B` / `#3A2A0A` | Insignia "Precio de hace X días", fecha y avisos de precios viejos |
| Terracota: errores | `#A23D24` / `#FBE9E4` | `#F4A08A` / `#3E1D17` | Error de carga y fallos |

Contrastes: oliva 7,4:1, ámbar 7,7:1 y terracota 6,5:1 sobre blanco; en oscuro, todos por encima de 7:1 sobre las tarjetas.
El azul se reserva para el precio por unidad, los enlaces, los titulares y el botón principal; el resto de la interfaz va en texto principal sobre blanco o crema.

Reglas:
- **Dos modos: claro y oscuro** (`color-scheme: light dark`). Por defecto sigue la preferencia del sistema; un interruptor accesible en la barra superior permite cambiarlo y recuerda la elección (`localStorage`, protegido con `try/catch`). El modo claro es el de la paleta de arriba.
- **Modo oscuro:** fondo azul noche `#0F1330`, tarjetas un poco más claras `#1A2052`, texto `#ECEBF2`, gris de apoyo `#B4B1C2` y azul aclarado `#A9B6FF` (precio por unidad, enlaces, titulares y botón principal, con texto azul noche encima). Pie `#1F2766`. Las ilustraciones van siempre sobre una base blanca para conservar su trazo. Las fotos de producto también van sobre blanco.
- Contraste mínimo de 4,5:1 para texto en ambos modos. Claro: blanco sobre azul 9,3:1, azul sobre crema 8,2:1, gris sobre crema 4,6:1. Oscuro: azul aclarado sobre tarjeta 7,9:1, texto 12,9:1, gris 7,3:1.
- Titulares en azul sobre crema o blanco. Fondo crema y tarjetas blancas; los bloques azules grandes ya no se usan: el resumen "Las más baratas" son tarjetas blancas con borde verde oliva e insignia.

## Forma y estructura
- Secciones separadas por ondas suaves; bajo cada titular, un trazo ondulado dibujado a mano.
- El fondo crema puede llevar ramas de olivo en lavanda muy tenue.
- Pie de página azul con una onda de entrada. Siempre lleva el aviso: "Mercado de las Huellas compara precios; no reemplaza la recomendación de tu veterinario".
- Menú con etiquetas en mayúsculas espaciadas; la sección activa se subraya con un trazo ondulado azul.
- Botones principales: píldoras azules, texto blanco en mayúsculas espaciadas.

## Tipografía
- **Titulares:** Patrick Hand (Google Fonts, licencia OFL), mayúsculas, espaciado amplio. Respaldo: `"Segoe Print", "Comic Sans MS", cursive`. Nunca la tipografía propia de otra marca.
- **Etiquetas pequeñas:** Jost, mayúsculas, 4 px de espaciado.
- **Texto:** Jost 400. **Cifras:** Jost 600 con números tabulares (`font-variant-numeric: tabular-nums`). Respaldo: `"Helvetica Neue", Arial, sans-serif`.
- Texto principal de al menos 16 px, interlineado de 1,6 o más.

## Voz
Cálida, serena y segura. Español de Colombia, tuteando. Frases cortas. Sin exclamaciones ni jerga de ofertas ("súper oferta", "imperdible", "aprovecha").

| Lugar | Texto |
|---|---|
| Buscador | Busca arena, arnés, cama… |
| Botón principal | VER LA MÁS BARATA |
| Botón a la tienda | IR A [TIENDA] ↗ |
| Botón limpiar | QUITAR FILTROS |
| Filtro de especie | Gatos · Perros · Ambos |
| Filtro de categoría | Todas las categorías |
| Insignia | LA MÁS BARATA |
| Insignia de fecha | Precio de hace X días |
| Frase de marca | Mismo producto. Menos pesos. |
| Carga | Buscando el mejor precio para tu peludito… |
| Vacío | No encontramos nada con esos filtros. Prueba otra palabra o quita un filtro. |
| Error | No pudimos traer los precios. Revisa tu conexión e inténtalo otra vez. |
| Botón de error | REINTENTAR |
| Última actualización | Precios actualizados el [fecha] a las [hora] |
| Error (con por qué y qué hacer) | No pudimos traer los precios. Se cortó la conexión o el archivo de precios no está disponible por ahora. Revisa tu conexión e inténtalo otra vez; si sigue igual, vuelve en unos minutos. |
| Precio de más de 7 días | Este precio se tomó hace X días y puede haber cambiado. Confírmalo en la tienda antes de comprar. |
| Sin con qué compararse | Estos productos no tienen con qué compararse: ninguna otra tienda vende uno igual o equivalente, por eso no marcamos la más barata. |
| Búsqueda ampliada | No hay «arena» en Juguetes. Te mostramos 199 resultados en Arena. [VOLVER AL FILTRO] |
| Sinónimo | Mostrando camas, también buscamos sofá y colchoneta. |
| Corrección | ¿Quisiste decir arnés? |

Regla de los mensajes: todo estado vacío, error o advertencia dice qué pasó, por qué y qué hacer.

## Ilustración
Es el corazón de la marca. Muy ilustrativa, creativa y 100 % original: no se calcan mascotas, personajes ni ilustraciones de otras marcas o cuentas. Cuatro técnicas en una sola familia:
1. **Line art monolínea** azul sobre blanco.
2. **Trazo a mano** orgánico e imperfecto, artesanal.
3. **Cerámica griega** de figuras rojas y negras: siluetas de ánforas, grecas y ramas de olivo. Se traduce a la paleta: azul hace de "negro" y lavanda de "rojo".
4. **Piezas planas y geométricas** para íconos (pelotas, frascos, huellas).

Cada categoría del catálogo tiene su ilustración en `assets/ilustraciones/`, con una mascota en acción. Úsalas en el encabezado, los chips de categoría, los estados de carga, vacío y error, y entre secciones; nunca como relleno. Los momentos peculiares extra se harán cuando la web ya funcione.

## Movimiento
- Solo animaciones SVG y CSS ligeras, de 1 segundo o menos. Nada de GIF.
- El trazo de la ilustración principal se dibuja al cargar; una huella camina mientras cargan los precios; micro-movimientos en las mascotas (cola, orejas, parpadeo).
- Todo se desactiva con `prefers-reduced-motion`.

## Experiencia móvil
- Buscador fijo arriba. Chips de especie y de categoría (con su ilustración), desplazables, de al menos 44 px.
- Arriba de los resultados, un resumen con la opción más barata de cada grupo.
- Barra superior fija y delgada: a la izquierda el logo (ilustración de 56 px y el nombre en la letra rotulada); a la derecha el interruptor de modo claro u oscuro y el enlace a Instagram (ícono, texto accesible, pestaña nueva). El enlace vive en una sola constante (`URL_INSTAGRAM` en `assets/js/app.js`).
- Tarjeta con orden de lectura fijo: insignia "La más barata" (solo si aplica), tienda en negrita, precio por unidad grande con su unidad, nombre del producto, foto cuadrada de 88 px al lado (fondo blanco, `object-fit: contain`, carga diferida; si falta o falla, la ilustración de su categoría), lista corta de datos (marca, cantidad, precio total, fecha; cifras a la derecha) y botón "IR A [TIENDA] ↗" en pestaña nueva. Queda espacio para el botón "Mismo producto, más barato".
- La tarjeta más barata lleva borde verde oliva.
- Búsqueda: entiende sinónimos colombianos (`data/sinonimos.json`), singular y plural, tildes y errores de una o dos letras, y lo dice arriba de los resultados. Si el filtro activo no da resultados, muestra los de otras categorías con un aviso y un botón para volver al filtro; el filtro activo siempre se ve marcado (borde, relleno suave y ✓).
- Insignias "La más barata" y "Precio de hace X días".
- Teclado completo, foco visible, botones y chips de al menos 44 px, aviso `aria-live` con el número de resultados, `prefers-reduced-motion`, textos alternativos en toda ilustración y foto, aviso del veterinario siempre visible en el pie.
- Muestras y maquetas usan marcadores (`$ 00.000`), nunca precios inventados.
