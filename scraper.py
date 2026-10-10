#!/usr/bin/env python3
"""Consulta catálogos públicos de tiendas de mascotas de Colombia: VTEX, Shopify, WooCommerce y, si no hay ninguno,
sitemap + datos estructurados de producto (JSON-LD de schema.org). Sin navegadores ni simular personas.

Solo usa la biblioteca estándar. Genera:
  data/tiendas.csv          estado de cada tienda (aprobada, bloqueada por robots.txt, sin catálogo público)
  data/scrapeado-hoy.csv    productos disponibles clasificados, con precio por unidad de medida
  data/precios.csv          copia de la misma corrida: es el archivo que lee la web

Respeta robots.txt (se revisa cada URL antes de pedirla) y espera 1,5 s entre consultas.
"""
import csv
import html
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
SALIDA_PRECIOS = RAIZ / "data" / "precios.csv"  # lo que lee la web; sale de la misma corrida, sin editar a mano

USER_AGENT = (
    "MercadoDeLasHuellasBot/1.0 (comparador de precios de mascotas en Colombia; "
    "+https://github.com/alejandragargom05-tech/mercado-de-las-huellas)"
)
ESPERA = 1.5
TIMEOUT = 20
MAX_PAGINAS_SHOPIFY = 30
MAX_PAGINAS_WOO = 30
MAX_PAGINAS_JSONLD = 250  # páginas de producto por tienda y corrida (1,5 s entre cada una)
CANDIDATAS = RAIZ / "data" / "tiendas-candidatas.csv"

# Tiendas encontradas en la web que no están en TIENDAS.md (máximo 5).
# Fuente: búsqueda web del 2026-10-09. La competitividad en precio aún no está verificada.
TIENDAS_EXTRA = [
    ("Mascolandia", "https://www.mascolandia.com.co", "tienda"),
    ("Abyapet", "https://abyapet.com", "tienda"),
    ("KeikoPets", "https://www.keikopets.com", "tienda"),
    ("La Casa del Granjero", "https://lacasadelgranjero.com", "tienda"),
    ("La Res", "https://lares.com.co", "tienda"),
]
TIPOS_TIENDA = ("cadena", "tienda", "emprendimiento")

# Tiendas cuyos términos de uso prohíben leer el sitio con herramientas automáticas (revisión manual del 2026-10-09).
# Las candidatas bloqueadas por scripts/descubrir_tiendas.py se suman a esta lista al cargar el CSV.
BLOQUEO_TERMINOS = {
    "lares.com.co": "los términos de uso prohíben usar herramientas automatizadas («bots», «spiders») para acceder o copiar el contenido",
}
ESTADO_TERMINOS = "bloqueada por términos de uso"

VTEX_SONDA = "/api/catalog_system/pub/products/search?ft=arena&_from=0&_to=0"
SHOPIFY_SONDA = "/products.json?limit=1"
WOO_SONDA = "/wp-json/wc/store/v1/products?per_page=1"
# Rutas que se usan de verdad al consultar; robots.txt debe permitirlas también.
RECORRIDO = {
    "vtex": "/api/catalog_system/pub/products/search?ft=arena&_from=0&_to=49",
    "shopify": "/products.json?limit=250&page=1",
    "woocommerce": "/wp-json/wc/store/v1/products?per_page=100&page=1",
}

TERMINOS = [
    "arena para gatos", "rascador", "gimnasio para gatos", "fuente para gatos",
    "comedero automatico", "arnes para perro", "correa para perro", "juguete interactivo",
    "lanzador de pelotas", "cama para perro", "cama para gato", "shampoo para perro",
    "paños humedos mascotas", "bolso transportador", "trixie", "chuckit",
    # Concentrado (alimento seco): términos genéricos y marcas más vendidas en Colombia
    "concentrado para perro", "concentrado para gato", "croquetas",
    "hill's", "royal canin", "pro plan", "dog chow", "cat chow", "pedigree", "whiskas", "chunky",
    "agility gold", "ringo", "mirringo", "max", "equilibrio", "taste of the wild", "nutra nuggets",
    "br for dog", "br for cat", "monello",
    # Rastreo e identificación (los microchips implantables no se incluyen: los implanta el veterinario)
    "collar gps", "rastreador gps", "soporte airtag", "placa qr", "placa de identificacion",
    # Arena y areneras
    "arenera", "arenero", "pala para arena", "bolsas para arenero",
    # Rascadores
    "poste rascador", "torre para gatos",
    # Comederos y bebederos
    "plato para perro", "plato para gato", "comedero doble", "comedero elevado", "comedero lento",
    "bebedero", "tazon para mascotas", "contenedor de alimento", "dispensador de agua",
    # Paseo
    "collar para perro", "collar para gato", "pechera para perro", "bozal", "bolsas recolectoras popo",
    "bolsitas para paseo", "dispensador de bolsas", "recogedor de popo", "coche para perro", "paseador",
    # Camas y descanso
    "colchoneta para perro", "manta para mascotas", "cojin para perro", "sofa para perro", "cucha", "casa para gato",
    # Juguetes
    "catnip", "pasto para gato", "hierba gatera", "mordedor", "peluche para perro",
    # Higiene y aseo
    "tapete de entrenamiento", "pads de entrenamiento", "panal para perro", "toallitas humedas mascotas",
    "colonia para perro", "eliminador de olores", "eliminador de manchas", "cepillo para perro", "peinilla para gato",
    "cortaunas para perro", "limpieza dental perro", "cepillo de dientes mascotas",
    # Ropa
    "saco para perro", "buzo para perro", "impermeable para perro", "chaqueta para perro", "disfraz para mascotas",
    "ropa para gato",
    # Transporte y seguridad
    "guacal", "morral para perro", "cinturon de seguridad perro", "protector asiento carro perro",
    "reja para carro perro", "corral para perro", "reja de seguridad mascotas",
]
# Palabras que solo sirven para filtrar el catálogo completo de Shopify.
CLAVES_SHOPIFY_EXTRA = ["concentrado", "croqueta", "alimento", "gps", "airtag", "placa", "collar", "rastread", "qr",
                        "panal", "tapete", "pad", "bolsa", "bolsita", "bozal", "cepillo", "peine", "saco", "buzo", "impermeable",
                        "chaqueta", "disfraz", "tazon", "coca", "contenedor", "manta", "cojin", "sofa", "casa", "reja", "corral",
                        "cinturon", "morral", "eliminador", "colonia", "catnip", "pasto", "hierba", "arenera", "arenero"]

HOY = date.today().isoformat()
CANDIDATOS_RASTREO = set()  # nombres con collar/placa/GPS/AirTag que se descartaron (para revisar la regla)


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


def pedir(url, acepta="application/json, text/plain, */*"):
    """GET con espera previa. Devuelve (estado_http, texto); estado 0 si falla la conexión."""
    esperar()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": acepta})
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
        self.sitemaps = []
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
            elif clave == "sitemap" and valor.startswith("http"):
                self.sitemaps.append(valor)
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

def dominio(url):
    return urlsplit(url).netloc.lower().replace("www.", "")


def cargar_candidatas():
    if not CANDIDATAS.exists():
        return []
    with CANDIDATAS.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def cargar_tiendas():
    """(nombre, url, tipo). El tipo sale del encabezado de TIENDAS.md (cadenas, emprendimientos o tienda)."""
    tiendas, tipo, candidatas = [], "tienda", False
    for linea in TIENDAS_MD.read_text(encoding="utf-8").splitlines():
        if linea.startswith("#"):
            t = norm(linea)
            candidatas = "candidatas" in t  # las prueba scripts/descubrir_tiendas.py; su tipo vive en el CSV
            tipo = "cadena" if "cadena" in t else "emprendimiento" if "emprendimiento" in t else "tienda"
            continue
        if candidatas:
            continue
        m = re.match(r"^- (.+?):\s*(https?://\S+)", linea)
        if m:
            nombre = re.sub(r"\s*\(.*?\)", "", m.group(1)).strip()
            tiendas.append((nombre, m.group(2).rstrip("/"), tipo))
        elif linea.startswith("- Jarapets"):
            tiendas.append(("Jarapets", "", "tienda"))
    for c in cargar_candidatas():
        if c.get("estado") == ESTADO_TERMINOS and c.get("url"):
            BLOQUEO_TERMINOS[dominio(c["url"])] = c.get("motivo") or "los términos de uso prohíben la lectura automática"
    conocidas = {dominio(u) for _, u, _ in tiendas}
    extras = list(TIENDAS_EXTRA[:5]) + [(c["tienda"], c["url"], c.get("tipo") or "tienda") for c in cargar_candidatas()
                                         if c.get("url")]
    for nombre, url, tipo in extras:
        if dominio(url) not in conocidas:
            conocidas.add(dominio(url))
            tiendas.append((nombre, url.rstrip("/"), tipo if tipo in TIPOS_TIENDA else "tienda"))
    return tiendas


def probar_plataforma(plataforma, base, robots):
    """None si la ruta está prohibida por robots.txt; True/False según responda o no el catálogo."""
    sonda = {"vtex": VTEX_SONDA, "shopify": SHOPIFY_SONDA, "woocommerce": WOO_SONDA}[plataforma]
    if not robots.permitido(ruta_de(sonda)):
        return None
    _, datos = pedir_json(base + sonda)
    if plataforma == "vtex":
        valido = isinstance(datos, list)
    elif plataforma == "shopify":
        valido = isinstance(datos, dict) and "products" in datos
    else:
        valido = isinstance(datos, list) and bool(datos) and isinstance(datos[0], dict) and "prices" in datos[0]
    if valido and not robots.permitido(ruta_de(base + RECORRIDO[plataforma])):
        return None
    return valido


NOMBRE_PLATAFORMA = {"vtex": "VTEX", "shopify": "Shopify", "woocommerce": "WooCommerce"}
RUTA_PLATAFORMA = {"vtex": "/api/catalog_system/", "shopify": "/products.json", "woocommerce": "/wp-json/wc/store/v1/products"}


RE_PROHIBE = re.compile(
    r"(?:no\s+(?:utiliz|usar|emple|intent)\w*|queda\s+prohibid\w*|prohib\w+|proh[ií]be)[^.]{0,200}?"
    r"(?:ara[nñ]a|\brob[oó]ts?\b|\bbots\b|\bspiders?\b|scrap\w*|raspado|rastreo|crawl\w*|automatizad\w*|extracci[oó]n\s+(?:de\s+datos|masiva))"
    r"|phish\w*,[^.]{0,60}?(?:ara[nñ]a|spider\w*|crawl\w*|scrap\w*|raspado)"  # plantilla de Shopify: «spam, phishing, ..., scraping»
    r"|(?:ara[nñ]a|\brob[oó]ts?\b|\bbots\b|\bspiders?\b|scraping|raspado|crawling)[^.]{0,120}?prohibid", re.I)


def terminos_prohiben(base):
    """Motivo si los términos de uso prohíben leer el sitio con herramientas automáticas; '' si no (o no hay página de términos).
    Prueba rutas comunes y, si no, los enlaces de «términos» de la portada. No es infalible: la revisión final es humana."""
    rutas = ["/policies/terms-of-service", "/terminos-y-condiciones", "/terminos-condiciones", "/terminos"]
    candidatas, probadas = [base + r for r in rutas], set()
    while candidatas and len(probadas) < 8:
        u = candidatas.pop(0)
        if u in probadas:
            continue
        probadas.add(u)
        estado, texto = pedir(u, "text/html, */*")
        if estado != 200 or len(texto) < 2000:
            if len(probadas) == len(rutas):  # ninguna ruta común: se buscan los enlaces de la portada
                _, portada = pedir(base, "text/html, */*")
                candidatas += [urljoin(base + "/", m) for m in re.findall(r"href=[\"']([^\"']*(?:termino|terms|condiciones)[^\"']*)[\"']", portada, re.I)[:3]]
            continue
        limpio = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(?:script|style)[^>]*>.*?</(?:script|style)>", " ", texto)))
        m = RE_PROHIBE.search(limpio)
        if m:
            return "los términos de uso prohíben la lectura automática: «%s»" % limpio[max(0, m.start()):m.end()][:160].strip()
        return ""
    return ""


def revisar_tienda(nombre, url, tipo="tienda"):
    fila = {"tienda": nombre, "tipo": tipo, "url": url, "plataforma": "", "estado": "", "motivo": "", "fecha_revision": HOY}
    if not url:
        fila.update(estado="sin catálogo público", motivo="TIENDAS.md no trae sitio web verificado")
        return fila, None
    base = "{0.scheme}://{0.netloc}".format(urlsplit(url))
    fila["url"] = base
    if dominio(base) in BLOQUEO_TERMINOS:
        fila.update(estado=ESTADO_TERMINOS, motivo=BLOQUEO_TERMINOS[dominio(base)])
        return fila, None
    robots, error = leer_robots(base)
    if error:
        fila.update(estado="sin catálogo público", motivo=error)
        return fila, None
    prohibidas = []
    for plataforma in ("vtex", "shopify", "woocommerce"):
        r = probar_plataforma(plataforma, base, robots)
        if r is None:
            prohibidas.append(plataforma)
        elif r:
            if plataforma == "shopify":  # /products.json no trae la moneda: se lee de la portada
                _, portada = pedir(base, "text/html, */*")
                m = re.search(r'Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"', portada)
                if m and m.group(1) != "COP":
                    fila.update(estado="sin catálogo público", motivo="los precios están en %s, no en pesos colombianos" % m.group(1))
                    return fila, None
            fila.update(plataforma=plataforma, estado="aprobada",
                        motivo="%s responde JSON y robots.txt lo permite" % NOMBRE_PLATAFORMA[plataforma])
            return fila, robots
    if prohibidas:  # si robots.txt cierra una API, no se rodea leyendo las páginas
        fila.update(estado="bloqueada por robots.txt",
                    motivo="robots.txt prohíbe " + " y ".join(RUTA_PLATAFORMA[p] for p in prohibidas))
        return fila, None
    ok, motivo = probar_jsonld(base, robots)
    if ok:
        fila.update(plataforma="jsonld", estado="aprobada", motivo=motivo)
        return fila, robots
    fila.update(estado="sin catálogo público", motivo=motivo)
    return fila, None


# ---------------------------------------------------------------- clasificación

# Siguen fuera: snacks, premios, alimento húmedo (latas y sobres), medicamentos, antipulgas, suplementos,
# dietas de prescripción, collares isabelinos y productos para otras especies.
RE_MEDICO = re.compile(
    r"medicament|antipulga|pulga|garrapata|pipeta|desparasit|antiparasit|vermifug|vitamina|suplemento|jarabe|pastilla|"
    r"tableta|inyectable|medicad|clorhex|insecticida|keracleen|sebocalm|antiseborre|recuperacion|isabelino|"
    r"microchip|lector de chip|quirurgic|post ?operatori"
)
RE_COMIDA_FIJA = re.compile(  # snacks y alimento húmedo: fuera en toda categoría
    r"snack|galleta|premio|\btreats?\b|\bpate\b|comestible|mix de carne|milk bone|\blatas?\b|\bsobres? de \d|pouch|"
    r"alimento humedo|comida humeda|oreja|traquea|pezuna|cuerno|tendon|cuerito|"
    r"hueso.*(?:\bres\b|beff|beef|cerdo|femur|caramelo|bono|my pet|antisarro)|"
    r"(?:snack|galleta|premio|stick|barra|tira|masticable|comestible)s?\s+dental|dental\s+(?:snack|stick|treat|galleta|premio|masticable|comestible)s?"
)
RE_COMIDA = re.compile(r"alimento|concentrado|croqueta|comida")  # no aplica a comederos: "contenedor de alimento" sí entra
RE_OTROS = re.compile(r"\bkit\b|combo|talco|amarre")
RE_OTRA_ESPECIE = re.compile(  # solo si el nombre no menciona perro ni gato
    r"hamster|pajaro|\bloro|acuario|pecera|conejo|roedor|\bcuy|huron|reptil|tortuga|canario|periquito|cobaya|"
    r"\bpercha|jaula para (?:ave|loro|pajaro)|\bpeces\b|\baves\b|caballo|equino|bovino|porcino"
)

# Concentrado (alimento seco). Solo entra si el nombre lo dice o es de una marca conocida con peso en kg/lb.
# Siguen fuera: snacks, premios, alimento húmedo (latas y sobres), medicamentos y dietas veterinarias de prescripción.
MARCAS_CONCENTRADO = {
    # nombre que se muestra: (expresión que lo reconoce, especie fija o None)
    "Hill's": (r"hill'?s|hills", None),
    "Royal Canin": (r"royal canin", None),
    "Pro Plan": (r"pro ?plan", None),
    "Dog Chow": (r"dog chow", "perro"),
    "Cat Chow": (r"cat chow", "gato"),
    "Pedigree": (r"pedigree", "perro"),
    "Whiskas": (r"whiskas", "gato"),
    "Chunky": (r"chunky", "perro"),
    "Agility Gold": (r"agility(?: gold)?", "perro"),
    "Ringo": (r"ringo", "perro"),
    "Mirringo": (r"mirringo", "gato"),
    "Max": (r"max", None),
    "Equilibrio": (r"equilibrio", None),
    "Taste of the Wild": (r"taste of the wild", None),
    "Nutra Nuggets": (r"nutra nuggets?", None),
    "Br for Dog": (r"br ?for ?dog", "perro"),
    "Br for Cat": (r"br ?for ?cat", "gato"),
    "Monello": (r"monello", None),
}
# Marcas con más productos en las tiendas aprobadas que no estaban en la lista (se llena sola al correr).
MARCAS_DESCUBIERTAS = {}
RE_CONC_FUERTE = re.compile(
    r"concentrado|croqueta|alimento (?:seco|completo|balanceado|para (?:perro|gato|cachorro|gatito))|"
    r"comida (?:seca|para (?:perro|gato))|\bcuido\b|\bpepas?\b|dry food")
RE_NO_CONC = re.compile(
    r"snack|galleta|premio|treat|\blatas?\b|\bsobres?\b|pouch|humed|\bpate\b|medicament|prescri|veterinar|"
    r"\b[rkicz]/d\b|renal|hepatic|urinar|gastro|hydroliz|hidroliz|hypoalerg|neurocare|diabetic|cardiac|vet ?life|"
    r"pipeta|antipulga|vitamina|suplemento|jarabe|pastilla|"
    r"comedero|bebedero|dispensador|plato|bowl|contenedor|recipiente|lanzador|juguete|medidor|cuchara|bolso|"
    r"\bpala\b|hueso|mordedor|dental|arena|combo|\bkit\b")
MIN_KG_CONCENTRADO = 0.3  # por debajo suelen ser sobres, latas o premios


RE_RAZON_SOCIAL = re.compile(r"\b(?:sas|s a s|s a|sca|ltda|cia|group|grupo|logisticos|comercial|servicios|distribuciones?|importaciones|colombia|sa|occidente)\b")


def marca_comercial(marca):
    """Algunas tiendas ponen la razón social como marca (p. ej. "NESTLE PURINA PET CARE DE COLOMBIA SA"): se deja la marca."""
    n = norm(marca)
    if "purina" in n:
        return "Purina"
    return "" if RE_RAZON_SOCIAL.search(re.sub(r"[^a-z0-9]+", " ", n)) else marca


def marca_concentrado(n, marca):
    """Devuelve (nombre de marca, especie fija) si el nombre o la marca de la tienda es de concentrado conocida."""
    m = norm(marca)
    for nombre, (rx, esp) in list(MARCAS_CONCENTRADO.items()) + [(k, (re.escape(norm(k)), None)) for k in MARCAS_DESCUBIERTAS]:
        patron = re.compile(r"\b(?:%s)\b" % rx)
        if nombre == "Max":  # "max" suelta confunde: solo si es la marca o abre el nombre
            if m == "max" or n.startswith("max "):
                return nombre, esp
            continue
        if patron.search(m) or patron.search(n):
            return nombre, esp
    return None, None


def es_concentrado(n, marca):
    """¿Es concentrado (alimento seco)? Devuelve (bool, marca, especie fija)."""
    if RE_NO_CONC.search(n):
        return False, None, None
    nombre, esp = marca_concentrado(n, marca)
    fuerte = RE_CONC_FUERTE.search(n)
    pesa = RE_PESO.search(n)
    if fuerte or (nombre and pesa):
        return True, nombre, esp
    return False, None, None


# Rastreo e identificación
RE_RASTREO = re.compile(r"gps|rastread|localizador|air ?tag|\bqr\b|\bplacas?\b|chapa|medalla|in?dent?ificacion")
RE_CONTEXTO_PLACA = re.compile(r"in?dent?ificacion|\bid\b|mascota|perro|gato|\bpet\b|nombre|grabad|personaliz|hueso|huella|\bqr\b")
RE_NO_RASTREO = re.compile(r"calor|termic|calefa|hornilla|solar|base|cama|pantalla|\bplaca madre")
RE_PORTA_AIRTAG = re.compile(r"soporte|porta|holder|funda|estuche|collar|llavero|\bcase\b|cover|arnes|clip")


def tipo_rastreo(n):
    """GPS, porta-AirTag, placa QR o placa grabada; None si no es de rastreo."""
    if RE_NO_RASTREO.search(n):
        return None
    if re.search(r"gps|rastread|localizador", n):
        return "GPS"
    if re.search(r"air ?tag", n):
        return "porta-AirTag" if RE_PORTA_AIRTAG.search(n) else None
    if re.search(r"\bqr\b", n):
        return "placa QR"
    if re.search(r"\bplacas?\b|chapa|medalla|in?dent?ificacion", n) and RE_CONTEXTO_PLACA.search(n):
        return "placa grabada"
    return None


def R(categoria, sub, patron, no=None):
    return (categoria, sub, re.compile(patron), re.compile(no) if no else None)


# (categoría, subcategoría, patrón, patrón que la descarta). Orden importa: la primera regla que coincide decide.
# La categoría sale solo del nombre: la de la tienda mezcla cepillos, comida y otros productos.
REGLAS = [
    R("arena", "tapete atrapa arena", r"atrapa ?arena|tapete.*\barena|\barena.*tapete"),
    # Paseo: bolsas recolectoras y sus dispensadores (antes que comederos, bolsos y arena)
    R("paseo", "dispensador de bolsas", r"dispensador.*bolsa|porta ?bolsas?|bolsas?.*dispensador",
      r"\bcon\b.*dispensador|incluye|\+ ?dispensador|\d+\s*(?:rollos?|bolsas)"),
    R("paseo", "bolsa recolectora", r"\bbolsas?\b.*(?:recolector|recogedor|popo|heces|excremento|caca|paseo|desecho|biodegradable)|"
      r"(?:recolector|popo|heces|excremento)\w*.*\bbolsas?\b|\bbolsitas?\b|\bbolsas? (?:para|de) mascotas?"),
    R("paseo", "recogedor", r"recogedor|(?:pala|palita).*(?:popo|heces|excremento|caca)|(?:popo|heces|excremento|caca).*(?:pala|palita)|pooper", r"\barena\b|arener|\bbolsas?\b"),
    # Eliminadores de olores: aunque digan «para arenera», son higiene
    R("higiene", "eliminador", r"eliminador|removedor|neutralizador|destructor de olores|quita ?manchas", r"^arena\b"),
    # Arena y areneras
    R("arena", "bolsa para arenero", r"\bbolsas?\s+(?:para|de)\s+(?:el\s+)?(?:arener[oa]|caja)|\bliners?\b"),
    R("arena", "pala", r"\bpalas?\b|scooper"),
    R("arena", "arenera", r"arener[oa]s?|caja (?:de )?(?:arena|sanitaria)|baul sanitario|bandeja sanitaria|litter ?box|inodoro"),
    # Higiene y aseo
    R("higiene", "paño", r"\bpan(?:o|ito)s?\b.*humed|humed.*\bpan(?:o|ito)s?\b|toallitas|\bwipes?\b"),
    R("higiene", "shampoo", r"shampoo|champu"),
    R("higiene", "limpieza dental", r"cepillo.*(?:dient|dental)|(?:dient|dental).*cepillo|pasta dental|crema dental|gel dental|"
      r"\bdedales?\b|enjuague|limpiador dental|spray dental|higiene dental|aliento", r"juguete|petstages|mordedero|mordedor"),
    R("higiene", "cortaúñas", r"corta ?unas|cortador.*unas|lima.*unas|alicate|tijeras?.*unas|moto ?lima"),
    R("higiene", "cepillo", r"cepillo|furminator|rastrillo|\bcarda\b|deslanador|guante.*(?:cepill|aseo|bano)", r"juguete"),
    R("higiene", "peine", r"peine|peinilla|peinador"),
    R("higiene", "colonia", r"colonia|perfume|locion|fragancia|splash|desodorante|body mist", r"\barenas?\b"),
    R("higiene", "tapete", r"tapete|empapador|\bpads?\b", r"juguete|petstages|scratch|lick|lamid|comedero|plato|rasc|cama|termic|refresc|yoga|cobija|manta|colchon|descanso"),
    R("higiene", "pañal", r"\bpanal\w*"),
    R("arena", "arena", r"\barenas?\b"),
    # Transporte y seguridad
    R("transporte", "cinturón", r"cinturon.*(?:seguridad|carro|auto|vehiculo)|arnes.*(?:carro|auto|vehiculo|seguridad)|seat ?belt"),
    R("transporte", "protector", r"protector.*(?:asiento|carro|auto|vehiculo|baul|silla|puerta)|cubre ?asientos?|"
      r"funda.*(?:asiento|carro|auto|baul)|hamaca.*(?:carro|auto|asiento)|asiento.*(?:carro|auto)|booster"),
    R("transporte", "reja", r"\brejas?\b|barrera divisoria"),
    R("transporte", "corral", r"corral|\bvallas?\b|parque.*(?:perro|mascota|cachorro)|playpen"),
    R("transporte", "bolso", r"bolsos?|maletin|mochila"),
    R("transporte", "morral", r"morral|\btula\b"),
    R("transporte", "guacal", r"guacal|kennel|jaula|transportador|carrier"),
    # Rascadores
    R("rascadores", "gimnasio", r"gimnasio|\bgym\b|torre para gato|arbol para gato|cat tower", r"^juguete"),
    R("rascadores", "rascador", r"rascador|scratch"),
    R("rascadores", "poste", r"\bpostes?\b"),
    # Comederos y bebederos
    R("comederos", "lento", r"\blick|lamid|lamer|\blentos?\b|\bslow\b|voracidad|laberinto"),
    R("comederos", "automático", r"(?:comedero|alimentador|dispensador).*(?:automatic|programable|wifi|inteligente|smart)|"
      r"(?:automatic|programable|wifi|inteligente|smart).*(?:comedero|alimentador|dispensador)"),
    R("comederos", "fuente", r"\bfuentes?\b|fountain|surtidor|bebedero.*(?:automatic|electric)", r"fuente de (?:poder|energia|alimentacion)|adaptador|filtro|repuesto"),
    R("comederos", "bebedero", r"bebedero|tomadero|dispensador de agua|botella.*agua"),
    R("comederos", "contenedor", r"contenedor|recipiente|porta ?(?:alimento|comida|concentrado)|dispensador de (?:alimento|comida|concentrado)|almacenador|barril"),
    R("comederos", "comedero doble", r"(?:comedero|plato|tazon|bowl)s?.*(?:doble|double|2 en 1)|(?:doble|double).*(?:comedero|plato|tazon|bowl)"),
    R("comederos", "elevado", r"(?:comedero|plato|tazon|bowl)s?.*(?:elevad|soporte|stand|altura)|(?:elevad|soporte).*(?:comedero|plato|tazon|bowl)"),
    R("comederos", "plato", r"comedero|\bplatos?\b|tazon|\bbowls?\b|\bcocas?\b|cuenco|alimentador"),
    # Rastreo e identificación: el tipo sale de tipo_rastreo()
    R("rastreo", "", RE_RASTREO.pattern),
    # Paseo
    R("paseo", "arnés", r"arnes|pechera"),
    R("paseo", "collar", r"\bcollar(?:es)?\b"),
    R("paseo", "correa", r"correa|trailla|\bguias?\b|leash"),
    R("paseo", "bozal", r"bozal"),
    R("paseo", "coche", r"\bcoche|cochecito|carrito|stroller"),
    R("paseo", "paseador", r"paseador"),
    # Camas y descanso
    R("camas", "cucha", r"\bcuchas?\b"),
    R("camas", "casa", r"\bcasas?\b|casita|cueva|iglu"),
    R("camas", "sofá", r"\bsofas?\b|sillon"),
    R("camas", "cojín", r"cojin|almohad"),
    R("camas", "manta", r"\bmantas?\b|cobija|cobertor"),
    R("camas", "colchoneta", r"colchon"),
    R("camas", "cama", r"\bcamas?\b|\bnido\b|hamaca|\bdonut\b|\bdona\b|\bmoises\b"),
    # Ropa
    R("ropa", "saco", r"\bsacos?\b|sueter|sudadera|hoodie|cardigan", r"dormir|arena"),
    R("ropa", "buzo", r"\bbuzos?\b"),
    R("ropa", "impermeable", r"impermeable|capa de lluvia|\bpiloto\b"),
    R("ropa", "chaqueta", r"chaqueta|chaleco|abrigo|gabardina|poncho|parka"),
    R("ropa", "disfraz", r"disfraz|costume|cosplay|\btutu\b|\btraje\b|vestido"),
    R("ropa", "camiseta", r"camiseta|camisa|playera|\bpolo\b|pijama|\bbody\b"),
    R("ropa", "otra prenda", r"\bropa\b|\bbata\b|botas|zapatos|calcetin|gorro|sombrero|bufanda|bandana|corbata|panuelo"),
    # Juguetes (catnip y pasto solo si no es un juguete relleno de catnip)
    R("juguetes", "catnip", r"^(?=.*(?:\d\s*(?:g|gr|grs|gramos|kg|ml|oz)\b|spray|polvo))(?=.*(?:catnip|hierba gatera|menta gatera|valeriana|silvervine))",
      r"juguete|raton|pelota|peluche|rascador|\bbola\b|pluma|ovillo|cascabel|palo|vara"),
    R("juguetes", "pasto", r"\bpasto\b|cat grass|cesped", r"juguete|rascador|cama|palo"),
    R("juguetes", "lanzador", r"lanzador|launcher"),
    R("juguetes", "pelota", r"pelota|\bball\b|\bbola\b"),
    R("juguetes", "peluche", r"peluche|\bplush"),
    R("juguetes", "mordedor", r"mordedor|\bkong\b|nylabone|\bchew|cuerda|jalador"),
    R("juguetes", "interactivo", r"interactiv|puzzle|laser|raton|pluma|\bvara\b|ovillo|cascabel|resorte|boomerang|frisbee|petstages|outward hound"),
    R("juguetes", "juguete", r"juguete|\btoys?\b|catnip"),
]

RE_GATO = re.compile(r"\bgat[oa]s?\b|gatit[oa]s?|felin|\bcats?\b|\bkitten")
RE_PERRO = re.compile(r"\bperr[oa]s?\b|perrit[oa]s?|canin|\bdogs?\b|cachorro|\bpupp(?:y|ies)\b")

POR_DEFECTO = {"arena": "gato", "rascadores": "gato", "rastreo": "ambos"}
POR_DEFECTO_SUB = {"catnip": "gato", "pasto": "gato", "bozal": "perro", "bolsa recolectora": "perro",
                   "dispensador de bolsas": "perro", "recogedor": "perro"}


def buscar_regla(n):
    """(categoría, subcategoría) de la primera regla que coincide con el nombre normalizado; (None, None) si ninguna."""
    for categoria, sub, rx, no in REGLAS:
        if not rx.search(n) or (no and no.search(n)):
            continue
        if categoria == "rastreo":
            tipo = tipo_rastreo(n)
            if not tipo:
                continue
            sub = tipo
        return categoria, sub
    return None, None


COLORES = (r"azul|verde|gris|rosa|rosado|rojo|negro|blanco|amarillo|naranja|morado|lila|beige|cafe|marron|crema|"
           r"vino|mostaza|turquesa|celeste|claro|oscuro|tierra|dorado|plateado|camel|taupe|caqui|khaki")
RE_COLOR = re.compile(
    r"\bcolor(?:es)?\s+\w+(?:\s+(?:y|con)\s+\w+)?|"                      # «color arena», «color hueso y gris»
    r"\b(?:%s)\s+(?:arena|hueso)\b|\b(?:arena|hueso)\s+(?:%s)\b|"         # «verde arena», «arena claro»
    r"(?:^|\s)[-/]\s*(?:arena|hueso)\s*(?:[-/]|$)" % (COLORES, COLORES))     # variante final: «… - Arena»


def sin_color(n):
    """Quita del nombre los colores que chocan con palabras de categoría (arena, hueso): el color nunca decide la categoría."""
    return re.sub(r"\s+", " ", RE_COLOR.sub(" ", n)).strip()


def clasificar(nombre, extra, marca=""):
    """Devuelve (categoría, subcategoría, especie, marca de concentrado); todo None si el producto no entra."""
    n, e = sin_color(norm(nombre).replace("la casa del granjero", " ")), norm(extra)  # algunas tiendas añaden su nombre al título
    conc, marca_c, esp_fija = es_concentrado(n, marca)
    sub = ""
    if conc:
        categoria = "concentrado"
    else:
        categoria, sub = buscar_regla(n)
        if not categoria:
            return None, None, None, None
        fuera = RE_MEDICO.search(n) or RE_MEDICO.search(e) or RE_COMIDA_FIJA.search(n)
        if sub != "pasto":  # los kits de pasto para sembrar sí entran
            fuera = fuera or RE_OTROS.search(n) or RE_OTROS.search(e)
        if categoria != "comederos":
            fuera = fuera or RE_COMIDA_FIJA.search(e) or RE_COMIDA.search(n)
        if fuera:
            return None, None, None, None
    n_esp = n.replace("royal canin", " ")  # "canin" de la marca no significa perro
    gato = RE_GATO.search(n_esp) or None
    perro = RE_PERRO.search(n_esp) or None
    if not gato and not perro:
        gato, perro = RE_GATO.search(e), RE_PERRO.search(e)
    if not conc and not gato and not perro and RE_OTRA_ESPECIE.search(n):
        return None, None, None, None
    if "chuckit" in n and not gato:
        perro = perro or True
    if gato and perro:
        especie = "ambos"
    elif gato:
        especie = "gato"
    elif perro:
        especie = "perro"
    elif categoria == "concentrado":
        especie = esp_fija
        if not especie:
            return None, None, None, None  # sin saber para quién es, no se compara
    else:
        especie = POR_DEFECTO_SUB.get(sub) or POR_DEFECTO.get(categoria, "ambos")
    return categoria, sub, especie, marca_c


NUM = r"(\d+(?:[.,]\d+)?)"
RE_PESO = re.compile(r"(?:(\d+)\s*[x×]\s*)?" + NUM + r"\s*(kg|kgs|kls?|kilos?|kilogramos?|g|gr|grs|gramos?|lb|lbs|libras?)\b")
RE_VOLUMEN = re.compile(r"(?:(\d+)\s*[x×]\s*)?" + NUM + r"\s*(ml|cc|l|lt|lts|litros?)\b")
RE_ONZAS = re.compile(r"(?:(\d+)\s*[x×]\s*)?" + NUM + r"\s*(?:oz|onzas?)\b")
# Cantidad de piezas de un paquete: "x 30", "pack de 30", "30 tapetes", "4 rollos de 15 bolsas". Las medidas ("60 x 90 cm") no cuentan.
RE_ROLLOS = re.compile(r"(\d+)\s*rollos?\s*(?:de|x|con)\s*(\d+)")
RE_PIEZAS = re.compile(r"(\d+)\s*(?:tapetes?|pads?|panales|panal|panos?|panitos?|toallitas|bolsas?|bolsitas?|unidades|unds?|und|uds?|un|u|piezas|pcs)\b")
RE_PAQUETE = re.compile(r"(?<!\d)(?<!\d\s)(?:\bx|pack de|pack|paquete de|caja de|caja x)\s*(\d+)\b(?!\s*(?:cm|mm|ml|gr?|kgs?|lts?|l|m|x)\b)")


def numero(s):
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        return float(s.replace(".", ""))
    return float(s.replace(",", "."))


def medida_de(categoria, sub):
    """Con qué se compara el precio: kg, ml, g, conteo (por pieza de un paquete) o unidad."""
    if categoria == "concentrado" or (categoria == "arena" and sub == "arena"):
        return "kg"
    if categoria == "higiene" and sub in ("shampoo", "colonia", "eliminador"):
        return "ml"
    if (categoria, sub) in (("higiene", "paño"), ("higiene", "tapete"), ("higiene", "pañal"),
                            ("paseo", "bolsa recolectora"), ("arena", "bolsa para arenero")):
        return "conteo"
    if categoria == "juguetes" and sub in ("catnip", "pasto"):
        return "g"
    return "unidad"


def medir(n, medida, categoria):
    """Cantidad y unidad que dice el texto (ya normalizado) para esa medida; (None, None) si no trae."""
    if medida == "kg":
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
        if categoria == "arena" and m and not m.group(3) in ("ml", "cc"):
            return numero(m.group(2)) * int(m.group(1) or 1), "l"  # solo litros: no se convierte a kg
        return None, None
    if medida == "ml":
        m = RE_VOLUMEN.search(n)
        if m:
            cant = numero(m.group(2)) * int(m.group(1) or 1)
            return (cant if m.group(3) in ("ml", "cc") else cant * 1000), "ml"
        m = RE_ONZAS.search(n)
        if m:
            return numero(m.group(2)) * int(m.group(1) or 1) * 29.5735, "ml"
        return None, None
    if medida == "g":
        m = RE_PESO.search(n)
        if m:
            cant = numero(m.group(2)) * int(m.group(1) or 1)
            u = m.group(3)
            if u.startswith("k"):
                return cant * 1000, "g"
            if u in ("lb", "lbs") or u.startswith("libra"):
                return cant * 453.59237, "g"
            return cant, "g"
        m = RE_VOLUMEN.search(n)  # sprays de catnip
        if m and m.group(3) in ("ml", "cc"):
            return numero(m.group(2)) * int(m.group(1) or 1), "ml"
        return None, None
    if medida == "conteo":
        m = RE_ROLLOS.search(n)
        if m:
            return float(int(m.group(1)) * int(m.group(2))), "unidad"
        if re.search(r"\brollos?\b", n) and not RE_PIEZAS.search(n):
            return None, None  # "x 2 rollos" no dice cuántas bolsas trae cada rollo
        m = RE_PIEZAS.search(n) or RE_PAQUETE.search(n)
        if m:
            return float(m.group(1)), "unidad"
        if re.search(r"reutilizable|lavable", n):
            return 1.0, "unidad"  # una sola pieza
        return None, None  # un paquete sin cantidad no se puede dividir
    return 1.0, "unidad"


def cantidad_unidad(nombre, categoria, variante="", sub=""):
    """Devuelve (cantidad, unidad) o (None, None) si el nombre no trae cantidad utilizable.

    Si la variante (p. ej. "25 Kg") trae una cantidad, manda sobre la del título del producto."""
    medida = medida_de(categoria, sub)
    if medida == "unidad":
        return 1.0, "unidad"
    if variante:
        cant, unidad = medir(norm(variante), medida, categoria)
        if cant:
            return cant, unidad
    return medir(norm(nombre), medida, categoria)


RE_TALLA = re.compile(r"talla\s*(xs|s|m|l|xl|xxl)\b", re.I)
RE_TALLA_MAYUS = re.compile(r"(?<!\d)(?<!\d )(?<!-)\b(XS|S|M|L|XL|XXL)\b(?!-)")
RE_ALTURA = re.compile(r"(\d+(?:[.,]\d+)?)\s*cm\b", re.I)
# Orden importa: la primera que coincide decide el tipo.
TIPOS_ARENA = [
    ("sílice", r"silice|silica|cristales"),
    ("vegetal", r"calabaza|maiz|tofu|madera|pellet|vegetal|yuca|cassava|soya|cascara|pino|pine"),
    ("aglomerante", r"bentonita|aglomera|agromera|aglutinante|scoopable|scopable|\bscoop"),
    ("absorbente", r"absorbente|sepiolita|no aglomerante"),
]


# Concentrado: etapa de vida y tamaño de raza, solo cuando el nombre lo dice.
RE_ETAPAS = [
    ("cachorro", re.compile(r"cachorros?|puppy|puppies|junior|kitten|gatit[oa]s?|crecimiento|\bbaby")),
    ("senior", re.compile(r"senior|mature|maduro|\b[5-9]\+|\+ ?[5-9]\b|adulto mayor|\b7 ?\+|vejez")),
    ("adulto", re.compile(r"adult[oa]?s?\b")),
]
RE_TAMANOS = [
    ("pequeña", re.compile(r"peque[nñ]|\bmini\b|\bsmall\b|\btoy\b|\bxs\b")),
    ("mediana", re.compile(r"median|\bmedium\b")),
    ("grande", re.compile(r"grande|\blarge\b|\bmaxi\b|gigante|\bgiant\b")),
]
# Palabras que no forman parte de la línea del producto (marca, etapa, tamaño, especie, empaque).
RE_RUIDO_LINEA = re.compile(
    r"\b(?:concentrado|croquetas?|alimento|comida|seco|completo|balanceado|premium|super|para|perros?|gatos?|gatit[oa]s?|"
    r"cachorros?|adult[oa]?s?|senior|mature|junior|kitten|puppy|razas?|tamano|peque\w*|medi\w+|grandes?|mini|small|"
    r"medium|large|maxi|toy|de|x|y|con|por|todas|todos|las|los|bulto|bolsa|empaque|kgs?|kls?|kilos?|kilogramos?|"
    r"gramos?|grs?|g|lbs?|libras?|purina|dog|cat|\d+(?:[.,]\d+)?)\b|[+\-–/()®™&!]")


def etapa_tamano(n):
    etapa = next((e for e, rx in RE_ETAPAS if rx.search(n)), "")
    tam = " y ".join(t for t, rx in RE_TAMANOS if rx.search(n))
    return etapa, tam


def linea_concentrado(nombre, marca):
    """Línea del producto: el nombre sin marca, etapa, tamaño, especie ni cantidad (p. ej. "Science Diet")."""
    n = norm(nombre)
    if marca:
        n = re.sub(r"\b(?:%s)\b" % (MARCAS_CONCENTRADO.get(marca, (re.escape(norm(marca)),))[0]), " ", n)
    n = RE_RUIDO_LINEA.sub(" ", n)
    return " ".join(w[:1].upper() + w[1:] for w in n.split())


RE_MEDIDAS = re.compile(r"(?<!\d)(\d{2,3})\s*[x×]\s*(\d{2,3})\b")


def caracteristica(nombre, categoria, cantidad, unidad, sub=""):
    n = norm(nombre)
    if categoria == "arena" and sub == "arena":
        return next((t for t, rx in TIPOS_ARENA if re.search(rx, n)), "sin especificar")
    if categoria == "concentrado":
        etapa, tam = etapa_tamano(n)
        return "; ".join(x for x in (etapa, ("raza " + tam) if tam else "") if x)
    if categoria == "rastreo":
        return tipo_rastreo(n) or ""
    partes = []
    m = RE_TALLA.search(nombre) or RE_TALLA_MAYUS.search(nombre)
    if m:
        partes.append("talla " + m.group(1).upper())
    medidas = RE_MEDIDAS.search(n) if sub == "tapete" else None
    if medidas:
        partes.append("%s x %s cm" % medidas.groups())  # tamaño del tapete; la altura de abajo no aplica
    m = RE_VOLUMEN.search(n)
    if m and medida_de(categoria, sub) != "conteo":
        cap = numero(m.group(2))
        partes.append("%s ml" % fmt(cap) if m.group(3) in ("ml", "cc") else "%s L" % fmt(cap))
    h = RE_ALTURA.search(nombre)
    if h and not medidas:
        partes.append(fmt(numero(h.group(1))) + " cm")
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
    """Una fila por tienda, url, producto y cantidad; si solo cambia el precio (por ciudad), gana el menor."""
    clave = (fila["tienda"], fila["url"], fila["producto"], fila["cantidad"])
    previa = filas.get(clave)
    if previa is None or float(fila["precio"]) < float(previa["precio"]):
        filas[clave] = fila


def fmt(x):
    return "" if x is None else (str(int(x)) if float(x).is_integer() else str(round(x, 2)))


def armar_fila(tienda, nombre, marca, extra, url, precio, precio_lista, variante="", imagen=""):
    categoria, sub, especie, marca_c = clasificar(nombre, extra, marca)
    if not categoria:
        if RE_RASTREO.search(norm(nombre)) or "collar" in norm(nombre):
            CANDIDATOS_RASTREO.add("%s | %s" % (tienda, nombre.strip()))
        return None
    cant, unidad = cantidad_unidad(nombre, categoria, variante, sub)
    linea = ""
    if categoria == "concentrado":
        if not cant or cant < MIN_KG_CONCENTRADO:
            return None  # sin peso en kg no hay precio por kg; menos de 300 g suele ser sobre, lata o premio
        marca = marca_c or marca_comercial(marca)
        linea = linea_concentrado(nombre, marca_c)
    p_unidad = round(precio / cant, 2) if cant else None
    return {
        "fecha": HOY, "tienda": tienda, "categoria": categoria, "especie": especie,
        "producto": nombre.strip(), "marca": (marca or "").strip(), "linea": linea,
        "caracteristica": caracteristica(nombre, categoria, cant, unidad, sub),
        "cantidad": fmt(round(cant, 3)) if cant else "", "unidad": unidad if cant else "",
        "precio": fmt(precio), "precio_lista": fmt(precio_lista) if precio_lista and precio_lista >= precio else "",
        "precio_unidad": fmt(p_unidad) if p_unidad is not None else "", "url": url,
        "imagen": imagen if re.match(r"https?://", imagen or "") else "",
        "subcategoria": sub,
    }


# ---------------------------------------------------------------- consultas

def imagen_vtex(item):
    """URL de la primera foto tal como la publica la tienda (no se descarga ni se copia)."""
    imgs = item.get("images") or []
    return (imgs[0].get("imageUrl") or "") if imgs else ""


def imagen_shopify(p, variante):
    """Imagen de la variante o, si no tiene, la primera del producto."""
    imgs = p.get("images") or []
    destacada = variante.get("featured_image") or {}
    if destacada.get("src"):
        return destacada["src"]
    por_id = next((i.get("src") for i in imgs if i.get("id") == variante.get("image_id")), "")
    return por_id or (imgs[0].get("src") if imgs else "") or ""


def consultar_vtex(fila_tienda, robots, filas, terminos=None):
    base = fila_tienda["url"]
    for termino in (terminos or TERMINOS):
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
                                  float(oferta["Price"]), float(oferta.get("ListPrice") or 0),
                                  imagen=imagen_vtex(item))
                if fila:
                    agregar(filas, fila)


_CATALOGO_SHOPIFY = {}  # base -> productos ya descargados (la segunda pasada no vuelve a pedirlos)


def paginas_shopify(base, robots):
    if base in _CATALOGO_SHOPIFY:
        yield _CATALOGO_SHOPIFY[base]
        return
    acumulado = _CATALOGO_SHOPIFY[base] = []
    for pagina in range(1, MAX_PAGINAS_SHOPIFY + 1):
        url = base + "/products.json?limit=250&page=%d" % pagina
        if not robots.permitido(ruta_de(url)):
            print("  robots.txt no permite %s; se detiene" % ruta_de(url))
            return
        _, datos = pedir_json(url)
        productos = (datos or {}).get("products") if isinstance(datos, dict) else None
        if not productos:
            return
        acumulado.extend(productos)
        yield productos
        if len(productos) < 250:
            return


def consultar_shopify(fila_tienda, robots, filas, terminos=None):
    """Recorre /products.json por páginas (una sola vez por tienda) y filtra localmente por los términos."""
    base = fila_tienda["url"]
    claves = {norm(t.split()[0]).rstrip("s") for t in (terminos or TERMINOS)}  # arena, rascador, gimnasio, fuente, ...
    if not terminos:
        claves.update(CLAVES_SHOPIFY_EXTRA)
    for productos in paginas_shopify(base, robots):
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
                                  precio, float(v.get("compare_at_price") or 0), titulo_v,
                                  imagen=imagen_shopify(p, v))
                if fila:
                    agregar(filas, fila)


def paginas_woo(base, robots):
    if base in _CATALOGO_WOO:
        yield _CATALOGO_WOO[base]
        return
    acumulado = _CATALOGO_WOO[base] = []
    for pagina in range(1, MAX_PAGINAS_WOO + 1):
        url = base + "/wp-json/wc/store/v1/products?per_page=100&page=%d" % pagina
        if not robots.permitido(ruta_de(url)):
            print("  robots.txt no permite %s; se detiene" % ruta_de(url))
            return
        _, datos = pedir_json(url)
        if not isinstance(datos, list) or not datos:
            return
        acumulado.extend(datos)
        yield datos
        if len(datos) < 100:
            return


_CATALOGO_WOO = {}


def consultar_woo(fila_tienda, robots, filas, terminos=None):
    """Recorre la API pública de WooCommerce (una sola vez por tienda) y filtra localmente por los términos."""
    base = fila_tienda["url"]
    claves = claves_de(terminos)
    for productos in paginas_woo(base, robots):
        for p in productos:
            nombre = html.unescape(p.get("name") or "").strip()
            cats = " ".join(html.unescape(c.get("name") or "") for c in (p.get("categories") or []) + (p.get("tags") or []))
            marca = html.unescape(((p.get("brands") or [{}])[0] or {}).get("name") or "")
            if not any(c in norm(" ".join([nombre, marca, cats])) for c in claves):
                continue
            precios = p.get("prices") or {}
            rango = precios.get("price_range") or {}
            if rango and rango.get("min_amount") != rango.get("max_amount"):
                continue  # producto con variantes de distinto precio: la API no dice cuál es cuál
            if precios.get("currency_code") not in (None, "", "COP"):
                continue
            if p.get("is_in_stock") is False:
                continue
            dec = 10 ** int(precios.get("currency_minor_unit") or 0)
            try:
                precio = float(precios.get("price") or 0) / dec
                lista = float(precios.get("regular_price") or 0) / dec
            except ValueError:
                continue
            if precio <= 0:
                continue
            imgs = p.get("images") or []
            fila = armar_fila(fila_tienda["tienda"], nombre, marca, cats, p.get("permalink") or "", precio, lista,
                              imagen=(imgs[0].get("src") if imgs else "") or "")
            if fila:
                agregar(filas, fila)


def claves_de(terminos):
    claves = {norm(t.split()[0]).rstrip("s") for t in (terminos or TERMINOS)}
    if not terminos:
        claves.update(CLAVES_SHOPIFY_EXTRA)
    return claves


# --- sitemap + JSON-LD (schema.org Product)

RE_LOC = re.compile(r"<loc>\s*(?:<!\[CDATA\[)?\s*(.*?)\s*(?:\]\]>)?\s*</loc>", re.S | re.I)
RE_JSONLD = re.compile(r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.S | re.I)
RE_RUTA_PRODUCTO = re.compile(r"/(?:productos?|products?|p|tienda|shop|item)/", re.I)
_PAGINAS_JSONLD = {}  # url -> productos JSON-LD ya leídos
_SITEMAP = {}         # base -> urls de producto


def urls_de_sitemap(base, robots, limite_indices=8):
    """URLs de producto declaradas en el sitemap (robots.txt o /sitemap.xml). (urls, motivo_si_no_hay)"""
    if base in _SITEMAP:
        return _SITEMAP[base], ""
    pendientes = list(robots.sitemaps) or [base + "/sitemap.xml"]
    urls, vistos, leidos = [], set(), 0
    while pendientes and leidos < limite_indices:
        sm = pendientes.pop(0)
        if sm in vistos or urlsplit(sm).netloc.lower().replace("www.", "") != dominio(base):
            continue
        vistos.add(sm)
        if not robots.permitido(ruta_de(sm)):
            return [], "robots.txt prohíbe el sitemap"
        estado, texto = pedir(sm, "application/xml, text/xml, */*")
        leidos += 1
        if estado != 200:
            continue
        locs = [urljoin(base + "/", html.unescape(x)) for x in RE_LOC.findall(texto)]
        if "<sitemapindex" in texto.lower():
            prod = [x for x in locs if re.search(r"product|producto", x, re.I)]
            pendientes = (prod or locs[:limite_indices]) + pendientes
        else:
            es_de_producto = bool(re.search(r"product|producto", sm, re.I))
            urls.extend(x for x in locs if es_de_producto or RE_RUTA_PRODUCTO.search(urlsplit(x).path))
    _SITEMAP[base] = urls
    return urls, ("" if urls else "el sitemap no lista páginas de producto")


def precio_jsonld(valor):
    if valor in (None, ""):
        return None
    t = str(valor).strip().replace("$", "").replace(" ", "")
    if re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?", t):
        t = t.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", t):
        t = t.replace(",", "")
    try:
        return float(t)
    except ValueError:
        return None


def nodos_producto(dato):
    if isinstance(dato, list):
        for x in dato:
            yield from nodos_producto(x)
    elif isinstance(dato, dict):
        tipos = dato.get("@type")
        tipos = [tipos] if isinstance(tipos, str) else (tipos or [])
        if "Product" in tipos:
            yield dato
        if "ProductGroup" in tipos:
            yield from nodos_producto(dato.get("hasVariant") or [])
        if "@graph" in dato:
            yield from nodos_producto(dato["@graph"])


def leer_producto_jsonld(nodo, url):
    """(nombre, marca, precio, precio_lista, imagen, categoria) si hay precio vigente y disponible; si no, None."""
    ofertas = nodo.get("offers")
    ofertas = ofertas if isinstance(ofertas, list) else [ofertas or {}]
    precios, listas = [], []
    for o in ofertas:
        if not isinstance(o, dict):
            continue
        if "lowPrice" in o and o.get("highPrice") not in (None, o.get("lowPrice")):
            return None  # rango de precios entre variantes: no se sabe cuál es cuál
        if "InStock" not in str(o.get("availability") or "") and "LimitedAvailability" not in str(o.get("availability") or ""):
            continue
        if o.get("priceCurrency") not in (None, "", "COP"):
            continue
        spec = o.get("priceSpecification") or {}
        spec = spec[0] if isinstance(spec, list) and spec else spec
        precio = precio_jsonld(o.get("price", o.get("lowPrice", spec.get("price") if isinstance(spec, dict) else None)))
        if precio and precio >= 100:
            precios.append(precio)
    if not precios:
        return None
    marca = nodo.get("brand")
    marca = marca.get("name") if isinstance(marca, dict) else marca
    img = nodo.get("image")
    img = img[0] if isinstance(img, list) and img else img
    img = img.get("url") if isinstance(img, dict) else img
    nombre = html.unescape(str(nodo.get("name") or "")).strip()
    if not nombre:
        return None
    return nombre, html.unescape(str(marca or "")), min(precios), 0.0, str(img or ""), html.unescape(str(nodo.get("category") or ""))


def productos_de_pagina(url, robots):
    if url in _PAGINAS_JSONLD:
        return _PAGINAS_JSONLD[url]
    out = []
    if robots.permitido(ruta_de(url)):
        estado, texto = pedir(url, "text/html, */*")
        if estado == 200:
            for bloque in RE_JSONLD.findall(texto):
                try:
                    datos = json.loads(html.unescape(bloque) if "&quot;" in bloque else bloque)
                except ValueError:
                    continue
                for nodo in nodos_producto(datos):
                    r = leer_producto_jsonld(nodo, url)
                    if r:
                        out.append(r)
    _PAGINAS_JSONLD[url] = out
    return out


def probar_jsonld(base, robots):
    urls, motivo = urls_de_sitemap(base, robots)
    if not urls:
        return False, "ni VTEX, Shopify ni WooCommerce responden JSON, y " + (motivo or "no hay sitemap")
    for u in urls[:3]:
        if productos_de_pagina(u, robots):
            return True, "sitemap con datos estructurados de producto (JSON-LD) y robots.txt lo permite"
    return False, "ni VTEX, Shopify ni WooCommerce responden JSON, y las páginas de producto no traen datos estructurados con precio"


def consultar_jsonld(fila_tienda, robots, filas, terminos=None):
    base = fila_tienda["url"]
    claves = claves_de(terminos)
    urls, _ = urls_de_sitemap(base, robots)
    elegidas = [u for u in urls if any(c in norm(urlsplit(u).path.replace("-", " ")) for c in claves)]
    for u in sorted(set(elegidas))[:MAX_PAGINAS_JSONLD]:
        for nombre, marca, precio, lista, img, cat in productos_de_pagina(u, robots):
            fila = armar_fila(fila_tienda["tienda"], nombre, marca, cat, u, precio, lista, imagen=img)
            if fila:
                agregar(filas, fila)


def consultar(fila_tienda, robots, filas, terminos=None):
    {"vtex": consultar_vtex, "shopify": consultar_shopify, "woocommerce": consultar_woo,
     "jsonld": consultar_jsonld}[fila_tienda["plataforma"]](fila_tienda, robots, filas, terminos)


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


COL_TIENDAS = ["tienda", "tipo", "url", "plataforma", "estado", "motivo", "fecha_revision"]
COL_PRODUCTOS = ["fecha", "tienda", "categoria", "especie", "producto", "marca", "linea", "caracteristica",
                 "cantidad", "unidad", "precio", "precio_lista", "precio_unidad", "url", "imagen", "subcategoria", "tipo_tienda"]


def unificar_marcas(filas):
    """Una sola escritura por marca (MONELLO y Monello son la misma); la marca no puede ser la tienda."""
    formas = {}
    for f in filas:
        if f["categoria"] == "concentrado" and f["marca"]:
            formas.setdefault(norm(f["marca"]), {}).setdefault(f["marca"], 0)
            formas[norm(f["marca"])][f["marca"]] += 1
    for f in filas:
        if f["categoria"] != "concentrado" or not f["marca"]:
            continue
        k = norm(f["marca"])
        if k == norm(f["tienda"]):
            f["marca"] = ""
            continue
        opciones = formas[k]
        f["marca"] = max(opciones, key=lambda m: (not m.isupper(), opciones[m]))


MIN_PRODUCTOS_MARCA = 3
MAX_MARCAS_DESCUBIERTAS = 10


def tiendas_nombres(revisadas):
    """Nombres de tienda normalizados: un vendor que es la propia tienda no es una marca."""
    return {norm(f["tienda"]) for f, _ in revisadas}


def main():
    revisadas = []
    for nombre, url, tipo in cargar_tiendas():
        print("Revisando %s ..." % nombre, flush=True)
        fila, robots = revisar_tienda(nombre, url, tipo)
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
        consultar(fila_tienda, robots, filas)
        print("  %d filas nuevas" % (len(filas) - antes), flush=True)
    # Segunda pasada: marcas de concentrado con más productos en las tiendas aprobadas que no estaban en la lista.
    conocidas = {norm(m) for m in MARCAS_CONCENTRADO}
    cuenta = {}
    for f in filas.values():
        if f["categoria"] == "concentrado" and f["marca"] and norm(f["marca"]) not in conocidas:
            cuenta.setdefault(f["marca"], {"n": 0, "tiendas": set()})
            cuenta[f["marca"]]["n"] += 1
            cuenta[f["marca"]]["tiendas"].add(f["tienda"])
    nuevas = sorted((m for m, c in cuenta.items() if c["n"] >= MIN_PRODUCTOS_MARCA and norm(m) not in tiendas_nombres(revisadas)),
                    key=lambda m: -cuenta[m]["n"])[:MAX_MARCAS_DESCUBIERTAS]
    if nuevas:
        print("\nMarcas de concentrado descubiertas: %s" % ", ".join("%s (%d)" % (m, cuenta[m]["n"]) for m in nuevas), flush=True)
        for m in nuevas:
            MARCAS_DESCUBIERTAS[m] = (re.escape(norm(m)), None)
        for fila_tienda, robots in revisadas:
            if fila_tienda["estado"] != "aprobada":
                continue
            consultar(fila_tienda, robots, filas, terminos=nuevas)
    tipos = {f["tienda"]: f["tipo"] for f, _ in revisadas}
    for f in filas.values():
        f["tipo_tienda"] = tipos.get(f["tienda"], "tienda")
    unificar_marcas(filas.values())
    resultado = sorted(filas.values(), key=lambda f: (f["categoria"], f["subcategoria"], f["especie"], f["tienda"], f["producto"]))
    escribir_csv(SALIDA_PRODUCTOS, COL_PRODUCTOS, resultado)
    escribir_csv(SALIDA_PRECIOS, COL_PRODUCTOS, resultado)
    print("\n%d filas guardadas en %s" % (len(resultado), SALIDA_PRODUCTOS.relative_to(RAIZ)))

    print("\nCANDIDATOS DE RASTREO DESCARTADOS (%d)" % len(CANDIDATOS_RASTREO))
    for c in sorted(CANDIDATOS_RASTREO)[:40]:
        print("  " + c)

    arena = [f for f in resultado if f["categoria"] == "arena" and f["subcategoria"] == "arena" and f["especie"] == "gato"]
    arena.sort(key=lambda f: (f["precio_unidad"] == "", float(f["precio_unidad"] or 0)))
    print("\nARENA PARA GATOS (%d filas, de menor a mayor precio por unidad)\n" % len(arena))
    if arena:
        imprimir_tabla(["tienda", "producto", "caracteristica", "cantidad", "unidad", "precio", "precio_unidad"], arena,
                       {"producto": 60})
    return 0


if __name__ == "__main__":
    sys.exit(main())
