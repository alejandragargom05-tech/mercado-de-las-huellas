#!/usr/bin/env python3
"""Suma tiendas nuevas al catálogo sin intervención.

Lee data/tiendas-candidatas.csv y las respuestas «Quiero sumar mi tienda» de la hoja del formulario,
prueba cada tienda nueva con las mismas reglas del scraper (robots.txt y catálogo público: VTEX, Shopify,
WooCommerce o sitemap con JSON-LD), lee sus términos de uso y deja en el CSV su estado: aprobada, bloqueada por robots.txt,
bloqueada por términos de uso o sin catálogo público, con el motivo. El scraper diario lee las aprobadas desde ese CSV.

Uso: python3 scripts/descubrir_tiendas.py   (en el proyecto final se programa cada semana)
"""
import csv
import ipaddress
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import scraper  # noqa: E402

HOJA = "https://docs.google.com/spreadsheets/d/10L8W7wkVqJpDRxsKVSz5mbi8qteXyJRntY-XYtMlGS8/export?format=csv&gid="
# Primero la pestaña que indicó la dueña (1242457253); si no trae encabezados, la pestaña de respuestas del formulario.
GIDS = ["1242457253", "1386246876"]
OPCION = "quiero sumar mi tienda"
COLUMNAS = ["tienda", "url", "tipo", "origen", "estado", "motivo", "fecha_revision"]
REVISAR_DE_NUEVO_DIAS = 30  # las que no se aprobaron se vuelven a probar cada tanto


def leer_hoja():
    """Filas (dict) de la hoja de respuestas, o (None, aviso) si no responde o no es pública."""
    ultimo = "no respondió"
    for gid in GIDS:
        req = urllib.request.Request(HOJA + gid, headers={"User-Agent": scraper.USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=scraper.TIMEOUT) as r:
                texto = r.read().decode("utf-8-sig", errors="replace")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            ultimo = "no respondió (%s); comparte la hoja como lector (cualquiera con el enlace)" % getattr(e, "code", e)
            continue
        if texto.lstrip().lower().startswith("<"):
            ultimo = "pide iniciar sesión: comparte la hoja como lector (cualquiera con el enlace)"
            continue
        filas = list(csv.DictReader(texto.splitlines()))
        if texto.strip() and any("tipo de sugerencia" in scraper.norm(c) for c in (filas[0].keys() if filas else
                                  next(csv.reader(texto.splitlines()), []))):
            return list(csv.DictReader(texto.splitlines())), gid
        ultimo = "la pestaña %s está vacía o no tiene la pregunta «Tipo de sugerencia»" % gid
    return None, ultimo


def url_publica(texto):
    """Origen https://dominio de un enlace de tienda; None si no es una web pública (nada de IP ni localhost)."""
    texto = (texto or "").strip()
    if not texto:
        return None
    if "://" not in texto:
        texto = "https://" + texto
    p = urlsplit(texto)
    host = (p.hostname or "").lower()
    if p.scheme not in ("http", "https") or "." not in host or host.endswith((".local", ".internal", ".localhost")):
        return None
    try:
        ipaddress.ip_address(host)
        return None
    except ValueError:
        pass
    return "https://" + p.netloc.lower()


def nombre_de(url):
    d = urlsplit(url).netloc.lower().replace("www.", "")
    return d.split(".")[0].replace("-", " ").title()


def enlaces_de_respuesta(fila):
    """Enlaces de una respuesta: columnas cuyo nombre habla de enlace, tienda o sitio; si no, cualquier celda con http."""
    claves = [k for k in fila if any(w in scraper.norm(k) for w in ("enlace", "tienda", "sitio", "url", "link"))
              and "tipo de sugerencia" not in scraper.norm(k)]
    celdas = [fila[k] for k in claves] or list(fila.values())
    return [u for u in (url_publica(c) for c in celdas if c and ("." in c)) if u]


def main():
    existentes = scraper.cargar_candidatas()
    conocidos = {scraper.dominio(c["url"]) for c in existentes if c.get("url")}
    conocidos |= {scraper.dominio(u) for _, u, _ in scraper.cargar_tiendas() if u}

    respuestas, dato = leer_hoja()
    if respuestas is None:
        print("AVISO: la hoja de respuestas no se pudo leer (%s). Solo se prueban las candidatas del CSV." % dato)
        respuestas = []
    else:
        print("Hoja de respuestas leída (pestaña %s): %d respuestas." % (dato, len(respuestas)))
    nuevas = 0
    for r in respuestas:
        tipo = next((v for k, v in r.items() if "tipo de sugerencia" in scraper.norm(k)), "")
        if scraper.norm(tipo) != OPCION:
            continue
        enlaces = enlaces_de_respuesta(r)
        if not enlaces:
            print("  Respuesta «Quiero sumar mi tienda» sin enlace válido: no hay qué probar todavía.")
            continue
        for url in enlaces:
            if scraper.dominio(url) in conocidos:
                continue
            conocidos.add(scraper.dominio(url))
            existentes.append({"tienda": nombre_de(url), "url": url, "tipo": "tienda", "origen": "formulario " + date.today().isoformat(),
                               "estado": "", "motivo": "", "fecha_revision": ""})
            nuevas += 1
    print("Tiendas nuevas desde el formulario: %d" % nuevas)

    hoy = date.today()
    for c in existentes:
        revisada = c.get("fecha_revision")
        vieja = False
        if revisada and c.get("estado") != "aprobada":
            try:
                vieja = (hoy - datetime.strptime(revisada, "%Y-%m-%d").date()).days >= REVISAR_DE_NUEVO_DIAS
            except ValueError:
                vieja = True
        if c.get("estado") == "aprobada":  # las aprobadas se vuelven a mirar solo en sus términos de uso
            motivo = scraper.terminos_prohiben(c["url"])
            if motivo:
                print("Términos de uso de %s: %s" % (c["tienda"], motivo))
                c.update(estado=scraper.ESTADO_TERMINOS, motivo=motivo, fecha_revision=scraper.HOY)
            continue
        if c.get("estado") and not vieja:
            continue
        print("Probando %s (%s) ..." % (c["tienda"], c["url"]), flush=True)
        fila, _ = scraper.revisar_tienda(c["tienda"], c["url"], c.get("tipo") or "tienda")
        if fila["estado"] == "aprobada":  # además de robots.txt y el catálogo, se leen los términos de uso
            motivo = scraper.terminos_prohiben(fila["url"])
            if motivo:
                fila.update(estado=scraper.ESTADO_TERMINOS, motivo=motivo)
        c.update(estado=fila["estado"], motivo=fila["motivo"], fecha_revision=scraper.HOY)
        print("  -> %s: %s" % (c["estado"], c["motivo"]), flush=True)

    with scraper.CANDIDATAS.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNAS, extrasaction="ignore")
        w.writeheader()
        w.writerows(existentes)
    cuenta = {}
    for c in existentes:
        cuenta[c["estado"]] = cuenta.get(c["estado"], 0) + 1
    print("\nCandidatas: " + ", ".join("%d %s" % (n, e) for e, n in sorted(cuenta.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
