#!/usr/bin/env python3
"""Consulta catálogos públicos (VTEX y Shopify) de tiendas de mascotas de Colombia.

Solo usa la biblioteca estándar. Genera:
  data/tiendas.csv          estado de cada tienda (aprobada, bloqueada por robots.txt, sin catálogo público)
  data/scrapeado-hoy.csv    productos disponibles clasificados, con precio por unidad de medida

Respeta robots.txt (se revisa cada URL antes de pedirla) y espera 1,5 s entre consultas.
"""
import csv
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlsplit

RAIZ = Path(__file__).resolve().parent
TIENDAS_MD = RAIZ / "TIENDAS.md"
SALIDA_TIENDAS = RAIZ / "data" / "tiendas.csv"
SALIDA_PRODUCTOS = RAIZ / "data" / "scrapeado-hoy.csv"

USER_AGENT = (
    "MercadoDeLasHuellasBot/1.0 (comparador de precios de mascotas en Colombia; "
    "+https://github.com/alejandragargom05-tech/mercado-de-las-huellas)"
)
ESPERA = 1.5
TIMEOUT = 20
MAX_PAGINAS_SHOPIFY = 30

# Tiendas encontradas en la web que no están en TIENDAS.md (máximo 5).
# Fuente: búsqueda web del 2026-10-09. La competitividad en precio aún no está verificada.
TIENDAS_EXTRA = [
    ("Mascolandia", "https://www.mascolandia.com.co"),
    ("Abyapet", "https://abyapet.com"),
    ("KeikoPets", "https://www.keikopets.com"),
    ("La Casa del Granjero", "https://lacasadelgranjero.com"),
    ("La Res", "https://lares.com.co"),
]

VTEX_SONDA = "/api/catalog_system/pub/products/search?ft=arena&_from=0&_to=0"
SHOPIFY_SONDA = "/products.json?limit=1"
# Rutas que se usan de verdad al consultar; robots.txt debe permitirlas también.
RECORRIDO = {
    "vtex": "/api/catalog_system/pub/products/search?ft=arena&_from=0&_to=49",
    "shopify": "/products.json?limit=250&page=1",
}

TERMINOS = [
    "arena para gatos", "rascador", "gimnasio para gatos", "fuente para gatos",
    "comedero automatico", "arnes para perro", "correa para perro", "juguete interactivo",
    "lanzador de pelotas", "cama para perro", "cama para gato", "shampoo para perro",
    "paños humedos mascotas", "bolso transportador", "trixie", "chuckit",
]

HOY = date.today().isoformat()


# ---------------------------------------------------------------- utilidades

def norm(texto):
    """Minúsculas y sin tildes (la ñ también pierde la tilde: paños -> panos)."""
    texto = unicodedata.normalize("NFD", str(texto or "").lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


_ultima = [0.0]


def esperar():
    falta = ESPERA - (time.monotonic() - _ultima[0])
    if falta > 0:
        time.sleep(falta)
    _ultima[0] = time.monotonic()


def pedir(url):
    """GET con espera previa. Devuelve (estado_http, texto); estado 0 si falla la conexión."""
    esperar()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return 0, ""


def pedir_json(url):
    estado, texto = pedir(url)
    try:
        return estado, json.loads(texto)
    except ValueError:
        return estado, None


# ---------------------------------------------------------------- robots.txt

class Robots:
    """Intérprete mínimo de robots.txt (RFC 9309): comodines * y $, gana la regla más larga."""

    def __init__(self, texto):
        self.reglas = []
        grupos, agentes, reglas, en_reglas = [], [], [], False
        for linea in texto.splitlines():
            linea = linea.split("#", 1)[0].strip()
            if ":" not in linea:
                continue
            clave, valor = (x.strip() for x in linea.split(":", 1))
            clave = clave.lower()
            if clave == "user-agent":
                if en_reglas:
                    grupos.append((agentes, reglas))
                    agentes, reglas, en_reglas = [], [], False
                agentes.append(valor.lower())
            elif clave in ("allow", "disallow"):
                en_reglas = True
                reglas.append((clave == "allow", valor))
        if agentes:
            grupos.append((agentes, reglas))
        propio = "mercadodelashuellasbot"
        elegido = [g for g in grupos if any(a != "*" and a in propio for a in g[0])]
        if not elegido:
            elegido = [g for g in grupos if "*" in g[0]]
        for _, rs in elegido:
            for permite, patron in rs:
                if patron:
                    self.reglas.append((permite, patron, self._regex(patron)))

    @staticmethod
    def _regex(patron):
        fin = patron.endswith("$")
        cuerpo = re.escape(patron[:-1] if fin else patron).replace(r"\*", ".*")
        return re.compile("^" + cuerpo + ("$" if fin else ""))

    def permitido(self, ruta):
        mejor = (-1, True)
        for permite, patron, rx in self.reglas:
            if rx.match(ruta) and (len(patron), permite) > mejor:
                mejor = (len(patron), permite)
        return mejor[1]


def leer_robots(base):
    """Devuelve (Robots, error). Sin robots.txt (4xx) todo está permitido; si falla (5xx/red, tras un reintento) no se consulta."""
    estado, texto = pedir(base + "/robots.txt")
    if estado == 0 or estado >= 500:  # fallo de conexión o del servidor: un solo reintento
        estado, texto = pedir(base + "/robots.txt")
    if estado == 200:
        return Robots(texto), None
    if 400 <= estado < 500:
        return Robots(""), None
    return None, "no se pudo leer robots.txt (%s)" % (estado or "sin conexión")


def ruta_de(url):
    p = urlsplit(url)
    return p.path + ("?" + p.query if p.query else "")


# ---------------------------------------------------------------- tiendas

def cargar_tiendas():
    tiendas = []
    for linea in TIENDAS_MD.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^- (.+?):\s*(https?://\S+)", linea)
        if m:
            nombre = re.sub(r"\s*\(.*?\)", "", m.group(1)).strip()
            tiendas.append((nombre, m.group(2).rstrip("/")))
        elif linea.startswith("- Jarapets"):
            tiendas.append(("Jarapets", ""))
    conocidas = {urlsplit(u).netloc.replace("www.", "") for _, u in tiendas}
    for nombre, url in TIENDAS_EXTRA[:5]:
        if urlsplit(url).netloc.replace("www.", "") not in conocidas:
            tiendas.append((nombre, url))
    return tiendas


def revisar_tienda(nombre, url):
    fila = {"tienda": nombre, "url": url, "plataforma": "", "estado": "", "motivo": "", "fecha_revision": HOY}
    if not url:
        fila.update(estado="sin catálogo público", motivo="TIENDAS.md no trae sitio web verificado")
        return fila, None
    base = "{0.scheme}://{0.netloc}".format(urlsplit(url))
    fila["url"] = base
    robots, error = leer_robots(base)
    if error:
        fila.update(estado="sin catálogo público", motivo=error)
        return fila, None
    prohibidas = []
    for plataforma, sonda in (("vtex", VTEX_SONDA), ("shopify", SHOPIFY_SONDA)):
        if not robots.permitido(ruta_de(sonda)):
            prohibidas.append(plataforma)
            continue
        estado, datos = pedir_json(base + sonda)
        valido = isinstance(datos, list) if plataforma == "vtex" else isinstance(datos, dict) and "products" in datos
        if valido and not robots.permitido(ruta_de(base + RECORRIDO[plataforma])):
            prohibidas.append(plataforma + " (recorrido)")
            continue
        if valido:
            fila.update(plataforma=plataforma, estado="aprobada",
                        motivo="%s responde JSON y robots.txt lo permite" % ("VTEX" if plataforma == "vtex" else "Shopify"))
            return fila, robots
    if prohibidas:
        rutas = {"vtex": "/api/catalog_system/", "shopify": "/products.json",
                 "vtex (recorrido)": "la consulta de productos de /api/catalog_system/",
                 "shopify (recorrido)": "el recorrido paginado de /products.json"}
        fila.update(estado="bloqueada por robots.txt",
                    motivo="robots.txt prohíbe " + " y ".join(rutas[p] for p in prohibidas))
    else:
        fila.update(estado="sin catálogo público", motivo="ni la API de VTEX ni /products.json responden JSON")
    return fila, None


# ---------------------------------------------------------------- clasificación

EXCLUIR = re.compile(
    r"alimento|concentrado|snack|galleta|premio|croqueta|comida|\bpate\b|medicament|antipulga|pulga|garrapata|"
    r"pipeta|desparasit|antiparasit|vermifug|vitamina|suplemento|jarabe|pastilla|tableta|inyectable|\bkit\b|combo|"
    r"medicad|clorhex|insecticida|keracleen|sebocalm|antiseborre|recuperacion|isabelino|talco|panal|"
    r"mix de carne|comestible|hueso.*(?:\bres\b|beff|beef|cerdo|femur|caramelo|bono|my pet|antisarro)|"
    r"milk bone|(?:snack|galleta|premio|stick|barra|tira|masticable|comestible)s?\s+dental|dental\s+(?:snack|stick|treat|galleta|premio|masticable|comestible)s?|arener[oa]|\bpala\b|destructor de olores|caja de arena|amarre|oreja|traquea|pezuna|cuerno|tendon|cuerito|"
    r"hamster|pajaro|\bloro|cepillo|furminator|corta ?unas|collar"
)

# Orden importa: la primera regla que coincide decide la categoría.
CATEGORIAS = [
    ("panos", re.compile(r"\bpan(?:o|ito)s?\b.*humed|humed.*\bpan(?:o|ito)s?\b|toallitas")),
    ("shampoo", re.compile(r"shampoo|champu")),
    ("arena", re.compile(r"\barenas?\b")),
    ("transportadores", re.compile(r"bolso|morral|transportador|guacal|maletin|cargador")),
    ("rascadores", re.compile(r"rascador|gimnasio|\bgym\b|torre para gato|arbol para gato|cat tower|poste")),
    ("fuentes-comederos", re.compile(r"fuente|bebedero|(comedero|alimentador|dispensador).*(automatic|programable)|(automatic|programable).*(comedero|alimentador|dispensador)")),
    ("arneses-correas", re.compile(r"arnes|correa|pechera|trailla")),
    ("camas", re.compile(r"\bcamas?\b|colchon|cucha")),
    ("juguetes", re.compile(
        r"juguete|\btoys?\b|pelota|\bball\b|\bbola\b|lanzador|frisbee|peluche|interactiv|jalador|boomerang|"
        r"catnip|ovillo|\bvara\b|cascabel|resorte|\braton\b|pluma|\bkong\b|nylabone|petstages|outward hound")),
]

RE_GATO = re.compile(r"\bgat[oa]s?\b|felin|\bcats?\b")
RE_PERRO = re.compile(r"\bperr[oa]s?\b|canin|\bdogs?\b|cachorro")

POR_DEFECTO = {"arena": "gato", "rascadores": "gato"}


def clasificar(nombre, extra):
    n, e = norm(nombre), norm(extra)
    if EXCLUIR.search(n) or EXCLUIR.search(e):
        return None, None
    # La categoría sale solo del nombre: la de la tienda mezcla cepillos, comida y otros productos.
    categoria = next((c for c, rx in CATEGORIAS if rx.search(n)), None)
    if not categoria:
        return None, None
    gato = RE_GATO.search(n) or None
    perro = RE_PERRO.search(n) or None
    if not gato and not perro:
        gato, perro = RE_GATO.search(e), RE_PERRO.search(e)
    if "chuckit" in n and not gato:
        perro = perro or True
    if gato and perro:
        especie = "ambos"
    elif gato:
        especie = "gato"
    elif perro:
        especie = "perro"
    else:
        especie = POR_DEFECTO.get(categoria, "ambos")
    return categoria, especie


NUM = r"(\d+(?:[.,]\d+)?)"
RE_PESO = re.compile(r"(?:(\d+)\s*[x×]\s*)?" + NUM + r"\s*(kg|kgs|kls?|kilos?|kilogramos?|g|gr|grs|gramos?|lb|lbs|libras?)\b")
RE_VOLUMEN = re.compile(r"(?:(\d+)\s*[x×]\s*)?" + NUM + r"\s*(ml|cc|l|lt|lts|litros?)\b")
RE_PANOS = re.compile(r"(\d+)\s*(?:panos?|toallitas|unidades|und|uds)\b|\b(?:x|pack de)\s*(\d+)\b")


def numero(s):
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        return float(s.replace(".", ""))
    return float(s.replace(",", "."))


def cantidad_unidad(nombre, categoria, variante=""):
    """Devuelve (cantidad, unidad) o (None, None) si el nombre no trae cantidad utilizable.

    Si la variante (p. ej. "25 Kg") trae una cantidad, manda sobre la del título del producto."""
    if variante:
        cant, unidad = cantidad_unidad(variante, categoria)
        if cant and not (categoria in ("arena", "shampoo", "panos") and unidad == "unidad"):
            return cant, unidad
    n = norm(nombre)
    if categoria == "arena":
        m = RE_PESO.search(n)
        if m:
            cant = numero(m.group(2)) * int(m.group(1) or 1)
            u = m.group(3)
            if u.startswith("k"):
                return cant, "kg"
            if u in ("lb", "lbs") or u.startswith("libra"):
                return cant * 0.45359237, "kg"
            return cant / 1000, "kg"
        m = RE_VOLUMEN.search(n)
        if m and not m.group(3) in ("ml", "cc"):
            return numero(m.group(2)) * int(m.group(1) or 1), "l"  # solo litros: no se convierte a kg
        return None, None
    if categoria == "shampoo":
        m = RE_VOLUMEN.search(n)
        if m:
            cant = numero(m.group(2)) * int(m.group(1) or 1)
            return (cant if m.group(3) in ("ml", "cc") else cant * 1000), "ml"
        return None, None
    if categoria == "panos":
        m = RE_PANOS.search(n)
        if m:
            return float(m.group(1) or m.group(2)), "paño"
        return None, None
    return 1.0, "unidad"


RE_TALLA = re.compile(r"talla\s*(xxs|xs|s|m|l|xl|xxl|xxxl)\b", re.I)
RE_TALLA_MAYUS = re.compile(r"(?<!\d)(?<!\d )\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b")
RE_ALTURA = re.compile(r"(\d+(?:[.,]\d+)?)\s*cm\b", re.I)
# Orden importa: la primera que coincide decide el tipo.
TIPOS_ARENA = [
    ("sílice", r"silice|silica|cristales"),
    ("vegetal", r"calabaza|maiz|tofu|madera|pellet|vegetal|yuca|cassava|soya|cascara|pino|pine"),
    ("aglomerante", r"bentonita|aglomera|agromera|aglutinante|scoopable|scopable|\bscoop"),
    ("absorbente", r"absorbente|sepiolita|no aglomerante"),
]


def caracteristica(nombre, categoria, cantidad, unidad):
    partes = []
    n = norm(nombre)
    if categoria == "arena":
        partes = [next((t for t, rx in TIPOS_ARENA if re.search(rx, n)), "sin especificar")]
    else:
        m = RE_TALLA.search(nombre) or RE_TALLA_MAYUS.search(nombre)
        if m:
            partes.append("talla " + m.group(1).upper())
        if categoria in ("rascadores", "camas", "juguetes", "transportadores"):
            h = RE_ALTURA.search(nombre)
            if h:
                partes.append(h.group(1) + " cm")
        if categoria == "fuentes-comederos":
            m = RE_VOLUMEN.search(n)
            if m and m.group(3) not in ("ml", "cc"):
                partes.append("%s L" % (m.group(2)))
    return "; ".join(partes)


CIUDADES = {norm(c) for c in (
    "Bogotá", "Barranquilla", "Pereira", "Medellín", "Cali", "Bucaramanga", "Cartagena", "Manizales",
    "Cúcuta", "Ibagué", "Armenia", "Villavicencio", "Santa Marta", "Montería", "Neiva", "Pasto", "Soacha",
    "Chía", "Envigado", "Itagüí", "Sabaneta", "Bello", "Palmira", "Tunja", "Popayán", "Valledupar",
)}


def sin_ciudad(titulo, variante):
    """Quita de la variante las partes que solo indican ciudad ("Bogotá / 25 Kg" -> "25 Kg")."""
    partes = [x.strip() for x in (variante or "").split("/")]
    partes = [x for x in partes if x and norm(x) not in CIUDADES and norm(x) not in norm(titulo)]
    return " / ".join(partes)


def agregar(filas, fila):
    """Una fila por tienda, producto y tamaño; si solo cambia el precio (por ciudad), gana el menor."""
    clave = (fila["tienda"], fila["url"], fila["producto"])
    previa = filas.get(clave)
    if previa is None or float(fila["precio"]) < float(previa["precio"]):
        filas[clave] = fila


def fmt(x):
    return "" if x is None else (str(int(x)) if float(x).is_integer() else str(round(x, 2)))


def armar_fila(tienda, nombre, marca, extra, url, precio, precio_lista, variante=""):
    categoria, especie = clasificar(nombre, extra)
    if not categoria:
        return None
    cant, unidad = cantidad_unidad(nombre, categoria, variante)
    p_unidad = round(precio / cant, 2) if cant else None
    return {
        "fecha": HOY, "tienda": tienda, "categoria": categoria, "especie": especie,
        "producto": nombre.strip(), "marca": (marca or "").strip(),
        "caracteristica": caracteristica(nombre, categoria, cant, unidad),
        "cantidad": fmt(round(cant, 3)) if cant else "", "unidad": unidad if cant else "",
        "precio": fmt(precio), "precio_lista": fmt(precio_lista) if precio_lista and precio_lista >= precio else "",
        "precio_unidad": fmt(p_unidad) if p_unidad is not None else "", "url": url,
    }


# ---------------------------------------------------------------- consultas

def consultar_vtex(fila_tienda, robots, filas):
    base = fila_tienda["url"]
    for termino in TERMINOS:
        url = base + "/api/catalog_system/pub/products/search?ft=%s&_from=0&_to=49" % urllib.parse.quote(termino)
        if not robots.permitido(ruta_de(url)):
            print("  robots.txt no permite %r; se omite" % termino)
            continue
        _, datos = pedir_json(url)
        if not isinstance(datos, list):
            continue
        for p in datos:
            cats = " ".join(p.get("categories") or [])
            for item in p.get("items") or []:
                oferta = next((s.get("commertialOffer") or {} for s in item.get("sellers") or []
                               if (s.get("commertialOffer") or {}).get("IsAvailable")
                               and (s.get("commertialOffer") or {}).get("Price")), None)
                if not oferta:
                    continue
                nombre = item.get("nameComplete") or p.get("productName") or ""
                fila = armar_fila(fila_tienda["tienda"], nombre, p.get("brand"), cats,
                                  urljoin(base + "/", p.get("link") or ""),
                                  float(oferta["Price"]), float(oferta.get("ListPrice") or 0))
                if fila:
                    agregar(filas, fila)


def consultar_shopify(fila_tienda, robots, filas):
    """Recorre /products.json por páginas (una sola vez por tienda) y filtra localmente por los términos."""
    base = fila_tienda["url"]
    claves = {norm(t.split()[0]).rstrip("s") for t in TERMINOS}  # arena, rascador, gimnasio, fuente, ...
    for pagina in range(1, MAX_PAGINAS_SHOPIFY + 1):
        url = base + "/products.json?limit=250&page=%d" % pagina
        if not robots.permitido(ruta_de(url)):
            print("  robots.txt no permite %s; se detiene" % ruta_de(url))
            return
        _, datos = pedir_json(url)
        productos = (datos or {}).get("products") if isinstance(datos, dict) else None
        if not productos:
            return
        for p in productos:
            tags = p.get("tags") or []
            extra = "%s %s" % (p.get("product_type") or "", tags if isinstance(tags, str) else " ".join(tags))
            pajar = norm(" ".join([p.get("title") or "", p.get("vendor") or "", extra]))
            if not any(c in pajar for c in claves):
                continue
            for v in p.get("variants") or []:
                precio = float(v.get("price") or 0)
                if not v.get("available") or precio <= 0:
                    continue
                nombre = p.get("title") or ""
                titulo_v = sin_ciudad(nombre, v.get("title")) if v.get("title") != "Default Title" else ""
                if titulo_v:
                    nombre += " - " + titulo_v
                fila = armar_fila(fila_tienda["tienda"], nombre, p.get("vendor"), extra,
                                  "%s/products/%s" % (base, p.get("handle")),
                                  precio, float(v.get("compare_at_price") or 0), titulo_v)
                if fila:
                    agregar(filas, fila)
        if len(productos) < 250:
            return


# ---------------------------------------------------------------- salida

def escribir_csv(ruta, columnas, filas):
    ruta.parent.mkdir(exist_ok=True)
    with ruta.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columnas)
        w.writeheader()
        w.writerows(filas)


def imprimir_tabla(columnas, filas, anchos=None):
    anchos = anchos or {}
    ancho = {c: min(anchos.get(c, 60), max(len(c), *(len(str(f[c])) for f in filas))) for c in columnas}
    corte = lambda f, c: str(f[c])[: ancho[c]].ljust(ancho[c])
    print(" | ".join(c.ljust(ancho[c]) for c in columnas))
    print("-+-".join("-" * ancho[c] for c in columnas))
    for f in filas:
        print(" | ".join(corte(f, c) for c in columnas))


COL_TIENDAS = ["tienda", "url", "plataforma", "estado", "motivo", "fecha_revision"]
COL_PRODUCTOS = ["fecha", "tienda", "categoria", "especie", "producto", "marca", "caracteristica",
                 "cantidad", "unidad", "precio", "precio_lista", "precio_unidad", "url"]


def main():
    revisadas = []
    for nombre, url in cargar_tiendas():
        print("Revisando %s ..." % nombre, flush=True)
        fila, robots = revisar_tienda(nombre, url)
        revisadas.append((fila, robots))
    escribir_csv(SALIDA_TIENDAS, COL_TIENDAS, [f for f, _ in revisadas])
    print("\nTIENDAS (guardado en %s)\n" % SALIDA_TIENDAS.relative_to(RAIZ))
    imprimir_tabla(COL_TIENDAS, [f for f, _ in revisadas], {"motivo": 55, "url": 38})

    filas = {}
    for fila_tienda, robots in revisadas:
        if fila_tienda["estado"] != "aprobada":
            continue
        print("\nConsultando %s (%s) ..." % (fila_tienda["tienda"], fila_tienda["plataforma"]), flush=True)
        antes = len(filas)
        if fila_tienda["plataforma"] == "vtex":
            consultar_vtex(fila_tienda, robots, filas)
        else:
            consultar_shopify(fila_tienda, robots, filas)
        print("  %d filas nuevas" % (len(filas) - antes), flush=True)
    resultado = sorted(filas.values(), key=lambda f: (f["categoria"], f["especie"], f["tienda"], f["producto"]))
    escribir_csv(SALIDA_PRODUCTOS, COL_PRODUCTOS, resultado)
    print("\n%d filas guardadas en %s" % (len(resultado), SALIDA_PRODUCTOS.relative_to(RAIZ)))

    arena = [f for f in resultado if f["categoria"] == "arena" and f["especie"] == "gato"]
    arena.sort(key=lambda f: (f["precio_unidad"] == "", float(f["precio_unidad"] or 0)))
    print("\nARENA PARA GATOS (%d filas, de menor a mayor precio por unidad)\n" % len(arena))
    if arena:
        imprimir_tabla(["tienda", "producto", "caracteristica", "cantidad", "unidad", "precio", "precio_unidad"], arena,
                       {"producto": 60})
    return 0


if __name__ == "__main__":
    sys.exit(main())
