#!/usr/bin/env python3
"""Lee el panel de Google Sheets (lo del día a día, sin tocar el código) y actualiza los archivos de data/.

El panel es una hoja con cuatro pestañas; cada una se descarga como CSV:
  Tiendas     tienda, url, tipo, acción (sumar, pausar o bloquear), nota  -> data/tiendas-candidatas.csv
  Sinónimos   palabra, categoría                                          -> data/sinonimos.json
  Textos      clave, valor (aviso superior, banner de hallazgos, Instagram, formulario) -> data/textos.json
  Categorías  categoría, orden, visible (sí o no)                         -> data/categorias.json

El panel NUNCA edita precios ni el orden por precio: una pestaña con una columna de precio se rechaza completa.
Si ENLACE_DE_MI_PANEL está vacío, el script no hace nada y no falla. Si el panel no responde o una pestaña trae errores,
esa pestaña se descarta (se conservan los últimos datos válidos) y se escribe panel-errores.md con la fila que falló;
el flujo de GitHub lo convierte en un issue. Cada pestaña se valida y se aplica entera o no se aplica.

Uso: python3 scripts/leer_panel.py                 (descarga la hoja)
     python3 scripts/leer_panel.py --carpeta DIR   (lee DIR/tiendas.csv, sinonimos.csv, textos.csv y categorias.csv; para probar)
"""
import csv
import ipaddress
import io
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

# Pega aquí el enlace de tu hoja de Google (Compartir -> «Cualquier persona con el enlace» -> Lector).
ENLACE_DE_MI_PANEL = ""

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
CANDIDATAS = DATA / "tiendas-candidatas.csv"
TIENDAS = DATA / "tiendas.csv"
PRECIOS = DATA / "precios.csv"
SINONIMOS = DATA / "sinonimos.json"
TEXTOS = DATA / "textos.json"
CATEGORIAS = DATA / "categorias.json"
ERRORES = RAIZ / "panel-errores.md"  # no se publica (.gitignore); lo lee el flujo para abrir el issue

USER_AGENT = "MercadoDeLasHuellasBot/1.0 (lee su propio panel; +https://github.com/alejandragargom05-tech/mercado-de-las-huellas)"
MAX_BYTES = 1_000_000
MAX_FILAS = 2000

# id -> etiqueta (el mismo orden de demanda que assets/js/logica.js)
CATEGORIAS_WEB = {
    "concentrado": "Concentrado", "arena": "Arena y areneras", "higiene": "Higiene y aseo", "paseo": "Paseo",
    "juguetes": "Juguetes", "comederos": "Comederos y bebederos", "camas": "Camas y descanso",
    "rascadores": "Rascadores y gimnasios", "transporte": "Transporte y seguridad", "ropa": "Ropa",
    "rastreo": "Rastreo e identificación",
}
TIPOS_TIENDA = ("cadena", "tienda", "emprendimiento")
ACCIONES = ("sumar", "pausar", "bloquear")
ESTADO_ACCION = {"pausar": "pausada por el panel", "bloquear": "bloqueada por el panel"}
ESTADOS_PANEL = tuple(ESTADO_ACCION.values())
COLUMNAS_CANDIDATAS = ["tienda", "url", "tipo", "origen", "estado", "motivo", "fecha_revision"]
CLAVES_TEXTO = {
    "aviso_superior": 200, "texto_banner_hallazgos": 120, "enlace_instagram": 300, "enlace_formulario": 300,
}
# pestaña -> (nombre del archivo de plantilla, columnas permitidas ya normalizadas)
PESTANAS = {
    "Tiendas": ("tiendas.csv", ("tienda", "url", "tipo", "accion", "nota")),
    "Sinónimos": ("sinonimos.csv", ("palabra", "categoria")),
    "Textos": ("textos.csv", ("clave", "valor")),
    "Categorías": ("categorias.csv", ("categoria", "orden", "visible")),
}
RE_PRECIO = re.compile(r"precio|price|costo|cost\b|cop\b|\$|pesos|valor\s*(?:de|del)\s*(?:la\s*)?(?:compra|producto)")


def norm(texto):
    t = unicodedata.normalize("NFD", str(texto or "").lower())
    return re.sub(r"\s+", " ", "".join(c for c in t if unicodedata.category(c) != "Mn").replace("_", " ")).strip()


def url_publica(texto):
    """Origen https://dominio de un enlace de tienda; None si no es una web pública (nada de IP ni localhost)."""
    texto = (texto or "").strip()
    if not texto or " " in texto:
        return None
    if "://" not in texto:
        texto = "https://" + texto
    p = urlsplit(texto)
    host = (p.hostname or "").lower()
    if p.scheme not in ("http", "https") or "." not in host or host.endswith((".local", ".internal", ".localhost")) \
            or not re.fullmatch(r"[a-z0-9.-]+", host):
        return None
    try:
        ipaddress.ip_address(host)
        return None
    except ValueError:
        pass
    return "https://" + p.netloc.lower()


def dominio(url):
    return urlsplit(url).netloc.lower().replace("www.", "")


def id_categoria(texto):
    n = norm(texto)
    for i, etiqueta in CATEGORIAS_WEB.items():
        if n in (i, norm(etiqueta)):
            return i
    return None


class Errores:
    def __init__(self):
        self.lista = []  # (pestaña, fila, motivo); fila 0 = toda la pestaña

    def agregar(self, pestana, fila, motivo):
        self.lista.append((pestana, fila, motivo))

    def de(self, pestana):
        return [e for e in self.lista if e[0] == pestana]


# ---------------------------------------------------------------- descarga

def id_de_hoja(enlace):
    m = re.search(r"/spreadsheets/d/(?:e/)?([\w-]+)", enlace or "")
    return m.group(1) if m else None


def descargar(hoja_id, pestana):
    """Texto CSV de una pestaña, o (None, motivo)."""
    url = "https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s" % (hoja_id, urllib.parse.quote(pestana))
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            texto = r.read(MAX_BYTES + 1).decode("utf-8-sig", errors="replace")
    except urllib.error.HTTPError as e:
        return None, "la hoja respondió HTTP %s; revisa que esté compartida como lector (cualquiera con el enlace) y que la pestaña se llame «%s»" % (e.code, pestana)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return None, "la hoja no respondió (%s)" % getattr(e, "reason", e)
    if len(texto) > MAX_BYTES:
        return None, "la pestaña pesa demasiado (más de 1 MB)"
    if texto.lstrip().lower().startswith("<"):
        return None, "la hoja pide iniciar sesión: compártela como lector (cualquiera con el enlace)"
    return texto, None


def leer_tabla(texto, pestana, columnas, errores):
    """Filas como (numero_de_fila_en_la_hoja, dict) o None si la pestaña no se puede usar."""
    filas = list(csv.reader(io.StringIO(texto)))
    if not filas:
        errores.agregar(pestana, 0, "la pestaña está vacía (falta la fila de encabezados)")
        return None
    cab = [norm(c) for c in filas[0]]
    precio = [c for c in filas[0] if RE_PRECIO.search(norm(c)) or RE_PRECIO.search(c.lower())]
    if precio:
        errores.agregar(pestana, 1, "tiene una columna de precio (%s): el panel no puede editar precios" % ", ".join(precio))
        return None
    sobran = [c for c, n in zip(filas[0], cab) if n and n not in columnas]
    falta = [c for c in columnas if c not in cab]
    if falta or sobran:
        errores.agregar(pestana, 1, "encabezados incorrectos: %s%s. Deben ser: %s" % (
            ("faltan " + ", ".join(falta)) if falta else "", (" sobran " + ", ".join(sobran)) if sobran else "", ", ".join(columnas)))
        return None
    if len(filas) - 1 > MAX_FILAS:
        errores.agregar(pestana, 0, "tiene más de %d filas" % MAX_FILAS)
        return None
    out = []
    for n, celdas in enumerate(filas[1:], start=2):
        fila = {c: (celdas[cab.index(c)] if cab.index(c) < len(celdas) else "").strip() for c in columnas}
        if any(fila.values()):
            out.append((n, fila))
    return out


# ---------------------------------------------------------------- validación por pestaña

def leer_csv(ruta):
    if not ruta.exists():
        return []
    with ruta.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def validar_tiendas(filas, errores):
    P, vistos, out = "Tiendas", {}, []
    for n, f in filas:
        problema = None
        url = url_publica(f["url"])
        tipo = norm(f["tipo"])
        accion = norm(f["accion"])
        if not f["tienda"]:
            problema = "falta el nombre de la tienda"
        elif len(f["tienda"]) > 80 or "\n" in f["tienda"]:
            problema = "el nombre de la tienda es muy largo"
        elif not url:
            problema = "la url «%s» no es una dirección web real (ejemplo: https://mitienda.com.co)" % f["url"]
        elif tipo not in TIPOS_TIENDA:
            problema = "el tipo «%s» no existe; usa cadena, tienda o emprendimiento" % f["tipo"]
        elif accion not in ACCIONES:
            problema = "la acción «%s» no existe; usa sumar, pausar o bloquear" % f["accion"]
        elif len(f["nota"]) > 200:
            problema = "la nota pasa de 200 caracteres"
        elif dominio(url) in vistos:
            problema = "la tienda %s ya está en la fila %d" % (dominio(url), vistos[dominio(url)])
        if problema:
            errores.agregar(P, n, problema)
            continue
        vistos[dominio(url)] = n
        out.append({"tienda": f["tienda"], "url": url, "tipo": tipo, "accion": accion, "nota": f["nota"]})
    return out


def validar_sinonimos(filas, errores):
    P, out, vistos = "Sinónimos", {}, set()
    for n, f in filas:
        cat = id_categoria(f["categoria"])
        palabra = f["palabra"].strip()
        if not palabra:
            errores.agregar(P, n, "falta la palabra")
        elif not cat:
            errores.agregar(P, n, "la categoría «%s» no existe; usa una de: %s" % (f["categoria"], ", ".join(CATEGORIAS_WEB.values())))
        elif len(palabra) > 60 or re.search(r"[<>{}\[\]\\]", palabra) or RE_PRECIO.search(norm(palabra)):
            errores.agregar(P, n, "la palabra «%s» no es válida (máximo 60 letras, sin símbolos raros ni palabras de precio)" % palabra[:40])
        elif (norm(palabra), cat) not in vistos:
            vistos.add((norm(palabra), cat))
            out.setdefault(cat, []).append(palabra)
    return out


def validar_textos(filas, errores):
    P, out = "Textos", {}
    claves = {norm(k): k for k in CLAVES_TEXTO}
    for n, f in filas:
        clave = claves.get(norm(f["clave"]))
        aliases = {"aviso superior": "aviso_superior", "texto del banner de hallazgos": "texto_banner_hallazgos",
                   "banner de hallazgos": "texto_banner_hallazgos", "enlace de instagram": "enlace_instagram",
                   "instagram": "enlace_instagram", "enlace del formulario": "enlace_formulario", "formulario": "enlace_formulario"}
        clave = clave or aliases.get(norm(f["clave"]))
        valor = f["valor"].strip()
        if not clave:
            errores.agregar(P, n, "la clave «%s» no existe; usa: %s" % (f["clave"], ", ".join(CLAVES_TEXTO)))
        elif clave in out:
            errores.agregar(P, n, "la clave %s está repetida" % clave)
        elif len(valor) > CLAVES_TEXTO[clave] or re.search(r"[<>]", valor):
            errores.agregar(P, n, "el valor de %s pasa de %d caracteres o trae < >" % (clave, CLAVES_TEXTO[clave]))
        elif clave == "enlace_instagram" and valor and not re.match(r"^https://(?:www\.)?instagram\.com/[\w./-]+/?$", valor):
            errores.agregar(P, n, "el enlace de Instagram debe ser https://www.instagram.com/tu_usuario/")
        elif clave == "enlace_formulario" and valor and not re.match(r"^https://docs\.google\.com/forms/d/(?:e/)?[\w-]+/viewform\S*$", valor):
            errores.agregar(P, n, "el enlace del formulario debe ser el de «Enviar» de Google Forms (termina en /viewform)")
        else:
            out[clave] = valor
    return out


def validar_categorias(filas, errores):
    P, out = "Categorías", {}
    productos = {}
    for r in leer_csv(PRECIOS):
        productos[r["categoria"]] = productos.get(r["categoria"], 0) + 1
    for n, f in filas:
        cat = id_categoria(f["categoria"])
        visible = {"si": True, "s": True, "true": True, "verdadero": True, "1": True,
                   "no": False, "n": False, "false": False, "falso": False, "0": False}.get(norm(f["visible"]))
        if not cat:
            errores.agregar(P, n, "la categoría «%s» no existe; usa una de: %s" % (f["categoria"], ", ".join(CATEGORIAS_WEB.values())))
        elif cat in out:
            errores.agregar(P, n, "la categoría %s está repetida (ya estaba en la fila %d)" % (CATEGORIAS_WEB[cat], out[cat]["fila"]))
        elif not re.fullmatch(r"\d{1,2}", f["orden"]) or int(f["orden"]) < 1:
            errores.agregar(P, n, "el orden «%s» debe ser un número entero entre 1 y 99" % f["orden"])
        elif visible is None:
            errores.agregar(P, n, "visible debe ser sí o no, no «%s»" % f["visible"])
        elif visible and not productos.get(cat):
            errores.agregar(P, n, "%s no tiene productos todavía: una categoría visible no puede quedar vacía (ponla en «no»)" % CATEGORIAS_WEB[cat])
        else:
            out[cat] = {"id": cat, "orden": int(f["orden"]), "visible": visible, "fila": n}
    if out and not errores.de(P):
        for cat in CATEGORIAS_WEB:
            if cat not in out:
                errores.agregar(P, 0, "falta la categoría %s; deben estar las %d" % (CATEGORIAS_WEB[cat], len(CATEGORIAS_WEB)))
        ordenes = [c["orden"] for c in out.values()]
        if len(set(ordenes)) != len(ordenes):
            errores.agregar(P, 0, "hay dos categorías con el mismo orden")
        if not any(c["visible"] for c in out.values()):
            errores.agregar(P, 0, "al menos una categoría debe estar visible")
    elif not out and not errores.de(P):
        errores.agregar(P, 0, "la pestaña no tiene filas")
    return out


# ---------------------------------------------------------------- aplicar

def escribir_si_cambia(ruta, contenido):
    if not ruta.exists() or ruta.read_text(encoding="utf-8") != contenido:
        ruta.write_text(contenido, encoding="utf-8")
        return True
    return False


def aplicar_tiendas(filas):
    candidatas = leer_csv(CANDIDATAS)
    por_dominio = {dominio(c["url"]): c for c in candidatas if c.get("url")}
    conocidas = {dominio(c["url"]) for c in leer_csv(TIENDAS) if c.get("url")}
    hoy, cambios = date.today().isoformat(), 0
    for f in filas:
        d, c = dominio(f["url"]), por_dominio.get(dominio(f["url"]))
        if f["accion"] == "sumar":
            if c is None and d in conocidas:
                continue  # ya está en la lista de tiendas
            if c is None:
                candidatas.append({"tienda": f["tienda"], "url": f["url"], "tipo": f["tipo"], "origen": "panel " + hoy,
                                   "estado": "", "motivo": "", "fecha_revision": ""})
                cambios += 1
            elif c["estado"] in ESTADOS_PANEL:  # reactivada: descubrir_tiendas.py la vuelve a probar
                c.update(estado="", motivo="", fecha_revision="", tipo=f["tipo"])
                cambios += 1
        else:
            estado = ESTADO_ACCION[f["accion"]]
            if c is None:
                c = {"tienda": f["tienda"], "url": f["url"], "tipo": f["tipo"], "origen": "panel " + hoy}
                candidatas.append(c)
            if c.get("estado") != estado or c.get("motivo") != (f["nota"] or "decisión tomada en el panel"):
                c.update(estado=estado, motivo=f["nota"] or "decisión tomada en el panel", fecha_revision=hoy, tipo=f["tipo"])
                cambios += 1
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNAS_CANDIDATAS, extrasaction="ignore", lineterminator="\r\n")
    w.writeheader()
    w.writerows(candidatas)
    escribir_si_cambia(CANDIDATAS, buf.getvalue())
    return cambios


def aplicar_sinonimos(por_categoria):
    datos = json.loads(SINONIMOS.read_text(encoding="utf-8"))
    for cat, palabras in por_categoria.items():
        if cat in datos["categorias"]:
            datos["categorias"][cat]["sinonimos"] = palabras  # 'variantes' y 'grupos' no se tocan
    return escribir_si_cambia(SINONIMOS, json.dumps(datos, ensure_ascii=False, indent=2) + "\n")


def aplicar_textos(textos):
    return escribir_si_cambia(TEXTOS, json.dumps({k: textos[k] for k in CLAVES_TEXTO if textos.get(k)}, ensure_ascii=False, indent=2) + "\n")


def aplicar_categorias(cats):
    lista = sorted(({"id": c["id"], "orden": c["orden"], "visible": c["visible"]} for c in cats.values()), key=lambda c: c["orden"])
    return escribir_si_cambia(CATEGORIAS, json.dumps({"categorias": lista}, ensure_ascii=False, indent=2) + "\n")


def informe(errores, motivo_general=None):
    lineas = ["El panel de Google Sheets no se pudo leer del todo. Se conservaron los últimos datos válidos de lo que falló.", ""]
    if motivo_general:
        lineas.append("- %s" % motivo_general)
    for pestana, fila, motivo in errores.lista:
        lineas.append("- Pestaña «%s», %s: %s" % (pestana, "fila %d" % fila if fila else "toda la pestaña", motivo))
    lineas += ["", "Corrige la hoja; la próxima corrida automática (o «Run workflow» a mano) la vuelve a leer y este issue se actualiza."]
    return "\n".join(lineas) + "\n"


def main(argv):
    carpeta = Path(argv[argv.index("--carpeta") + 1]) if "--carpeta" in argv else None
    ERRORES.unlink(missing_ok=True)
    hoja = id_de_hoja(ENLACE_DE_MI_PANEL)
    if not carpeta:
        if not ENLACE_DE_MI_PANEL.strip():
            print("ENLACE_DE_MI_PANEL está vacío: no hay panel que leer, no se cambia nada.")
            return 0
        if not hoja:
            ERRORES.write_text(informe(Errores(), "ENLACE_DE_MI_PANEL no es un enlace de Google Sheets (https://docs.google.com/spreadsheets/d/...)"), encoding="utf-8")
            print("AVISO: ENLACE_DE_MI_PANEL no es un enlace de Google Sheets; se conservan los datos.")
            return 0
    errores, general = Errores(), []
    validadores = {"Tiendas": validar_tiendas, "Sinónimos": validar_sinonimos, "Textos": validar_textos, "Categorías": validar_categorias}
    validos = {}
    for pestana, (archivo, columnas) in PESTANAS.items():
        if carpeta:
            ruta = carpeta / archivo
            texto, motivo = (ruta.read_text(encoding="utf-8-sig"), None) if ruta.exists() else (None, "no existe %s" % ruta)
        else:
            texto, motivo = descargar(hoja, pestana)
        if texto is None:
            errores.agregar(pestana, 0, motivo)
            continue
        tabla = leer_tabla(texto, pestana, columnas, errores)
        if tabla is None:
            continue
        datos = validadores[pestana](tabla, errores)
        if not errores.de(pestana):
            validos[pestana] = datos
    aplicado = []
    if "Tiendas" in validos:
        aplicado.append("Tiendas (%d cambios)" % aplicar_tiendas(validos["Tiendas"]))
    if "Sinónimos" in validos:
        aplicado.append("Sinónimos" + (" (actualizados)" if aplicar_sinonimos(validos["Sinónimos"]) else " (sin cambios)"))
    if "Textos" in validos:
        aplicado.append("Textos" + (" (actualizados)" if aplicar_textos(validos["Textos"]) else " (sin cambios)"))
    if "Categorías" in validos:
        aplicado.append("Categorías" + (" (actualizadas)" if aplicar_categorias(validos["Categorías"]) else " (sin cambios)"))
    print("Panel leído. Aplicado: %s." % (", ".join(aplicado) or "nada"))
    if errores.lista:
        ERRORES.write_text(informe(errores), encoding="utf-8")
        print("AVISO: %d problema(s); se conservaron los últimos datos válidos de esas pestañas:" % len(errores.lista))
        for p, n, m in errores.lista:
            print("  %s, %s: %s" % (p, "fila %d" % n if n else "toda la pestaña", m))
    return 0  # un panel con errores no detiene la actualización de precios


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
