#!/usr/bin/env python3
"""
Actualiza las fotos (cover y avatar) de las bandas en Supabase
a partir de data/fotos-bandas.json.

Uso (desde la raíz del repo):
  Mac:      SUPABASE_SECRET_KEY='sb_secret_...' python3 scripts/actualizar-fotos.py
  Windows:  $env:SUPABASE_SECRET_KEY='sb_secret_...'; python scripts/actualizar-fotos.py

Opciones:
  --sql   No toca Supabase: genera supabase/fotos-bandas.sql para ejecutarlo en el SQL Editor.

La llave secreta NUNCA se guarda en un archivo ni se sube al repo.
"""
import json, os, sys, urllib.request, urllib.error, urllib.parse

SUPABASE_URL = "https://sqgjyqarhwwvdskhczlt.supabase.co"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "data", "fotos-bandas.json")
SALIDA_SQL = os.path.join(RAIZ, "supabase", "fotos-bandas.sql")


def cargar():
    with open(DATOS, encoding="utf-8") as f:
        bandas = json.load(f)["bandas"]
    listas = []
    for b in bandas:
        cover = (b.get("cover") or "").strip()
        avatar = (b.get("avatar") or "").strip() or cover
        if not cover:
            continue
        for url in (cover, avatar):
            if not url.startswith("https://"):
                sys.exit(f"URL inválida en '{b['id']}': {url!r} (debe empezar con https://)")
        listas.append((b["id"], b.get("nombre", b["id"]), cover, avatar))
    if not listas:
        sys.exit("No hay URLs en data/fotos-bandas.json. Llena al menos un 'cover'.")
    return listas


def generar_sql(listas):
    q = lambda s: "'" + s.replace("'", "''") + "'"
    lineas = ["-- Fotos de las bandas (generado por scripts/actualizar-fotos.py)", "begin;"]
    for bid, _, cover, avatar in listas:
        lineas.append(f"update public.bands set cover = {q(cover)}, avatar = {q(avatar)} where id = {q(bid)};")
    lineas.append("commit;")
    with open(SALIDA_SQL, "w", encoding="utf-8") as f:
        f.write("\n".join(lineas) + "\n")
    print(f"Listo: {os.path.relpath(SALIDA_SQL, RAIZ)} ({len(listas)} bandas).")
    print("Ejecútalo en Supabase → SQL Editor → New query → Run.")


def actualizar(listas):
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not key:
        sys.exit("Falta la variable SUPABASE_SECRET_KEY (ver instrucciones al inicio del archivo).")
    base = os.environ.get("SUPABASE_URL", SUPABASE_URL).rstrip("/")
    headers = {"apikey": key, "Content-Type": "application/json", "Prefer": "return=representation"}
    if key.startswith("eyJ"):  # llave antigua (JWT)
        headers["Authorization"] = "Bearer " + key
    errores = 0
    for bid, nombre, cover, avatar in listas:
        url = f"{base}/rest/v1/bands?id=eq.{urllib.parse.quote(bid)}"
        body = json.dumps({"cover": cover, "avatar": avatar}).encode()
        req = urllib.request.Request(url, data=body, headers=headers, method="PATCH")
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                filas = json.loads(r.read() or b"[]")
            if filas:
                print(f"✓ {nombre}")
            else:
                errores += 1
                print(f"✗ {nombre}: no existe una banda con id '{bid}'")
        except urllib.error.HTTPError as e:
            errores += 1
            print(f"✗ {nombre}: HTTP {e.code} {e.read().decode(errors='ignore')[:200]}")
        except urllib.error.URLError as e:
            errores += 1
            print(f"✗ {nombre}: sin conexión ({e.reason})")
    print("\nListo. Recarga la app con Cmd/Ctrl + Shift + R." if not errores else f"\n{errores} banda(s) con error.")
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    listas = cargar()
    generar_sql(listas) if "--sql" in sys.argv else actualizar(listas)
