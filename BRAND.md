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

Reglas:
- La interfaz es siempre clara, también con el celular en modo oscuro (`color-scheme: light`). Nunca fondos oscuros, salvo los bloques azules.
- Contraste mínimo de 4,5:1 para texto. Blanco sobre azul: 9,3:1. Azul sobre crema: 8,2:1. Gris sobre crema: 4,6:1.
- Titulares en azul sobre crema o blanco. Bloques destacados: tarjetas azules con texto blanco rotulado.

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
| Botón a la tienda | IR A LA TIENDA |
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
- Tarjeta con orden de lectura fijo: precio por unidad (grande), precio total, tienda, cantidad y característica, hace cuánto se tomó. Números alineados a la derecha.
- Insignias "La más barata" y "Precio de hace X días".
- Foco visible, textos alternativos en toda ilustración, aviso del veterinario siempre visible en el pie.
- Muestras y maquetas usan marcadores (`$ 00.000`), nunca precios inventados.
