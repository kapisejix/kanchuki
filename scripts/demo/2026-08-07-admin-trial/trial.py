#!/usr/bin/env python3
"""E2E trial of the admin photo-cleanup API (the page's backend) against the
user's real WhatsApp photos. Phases:
    python trial.py setup                 # csrf + upload inputs/backgrounds
    python trial.py run c-w2 g-w2 ...      # run labelled combos (API calls)
    python trial.py analyze                # pixel stats + failure-mode report
State persists in this dir (urls.json, results/, summary.md, gallery.html).
The admin key is read from apps/api/.env / .env without ever printing it.
"""
import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(r"E:/Kanchuki")
D = ROOT / "scripts/demo/2026-08-07-admin-trial"
D.mkdir(parents=True, exist_ok=True)
API = "http://localhost:3001"
IN = D / "input"
RES = D / "results"
RES.mkdir(exist_ok=True)


def load_key() -> str:
    for env in (ROOT / "apps/api/.env", ROOT / ".env"):
        if env.exists():
            for line in env.read_text(errors="ignore").splitlines():
                if line.startswith("ADMIN_API_KEY="):
                    v = line.split("=", 1)[1].strip()
                    if v:
                        return v
    return ""


KEY = load_key()
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def req(method: str, url: str, body=None, headers=None, binary=None, timeout=1800):
    h = {"x-admin-key": KEY}
    data = None
    if body is not None:
        h["content-type"] = "application/json"
        data = json.dumps(body).encode()
    elif binary is not None:
        h["content-type"] = binary[0]
        data = binary[1]
    if headers:
        h.update(headers)
    full = url if url.startswith("http") else API + url
    r = urllib.request.Request(full, data=data, headers=h, method=method)
    try:
        with opener.open(r, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def csrf() -> str:
    st, body = req("GET", "/v1/admin/csrf-token")
    tok = json.loads(body)["data"]["csrf_token"]
    (D / "csrf.txt").write_text(tok)
    print("csrf ok:", st)
    return tok


def presign_upload(name: str, ct: str, path: Path) -> str:
    tok = (D / "csrf.txt").read_text().strip()
    st, body = req("POST", "/v1/admin/background-images/upload-url",
                   body={"content_type": ct, "filename": name},
                   headers={"x-csrf-token": tok})
    try:
        j = json.loads(body)
        up, pub = j["data"]["upload_url"], j["data"]["public_url"]
    except Exception:
        print(f"  presign {name}: status={st} body={body[:400]!r}")
        raise
    st2, _ = req("PUT", up, binary=(ct, path.read_bytes()), timeout=300)
    print(f"upload {name}: presign={st} put={st2}")
    return pub


def phase_setup():
    csrf()
    from PIL import Image
    Image.new("RGB", (1080, 1440), (245, 242, 238)).save(D / "bg-flat.jpg", quality=92)
    u = {}
    for name in ("w1", "w2", "w5", "w7"):
        u[name] = presign_upload(f"trial-{name}.jpg", "image/jpeg", IN / f"{name}.jpg")
    u["bgflat"] = presign_upload("trial-bg-flat.jpg", "image/jpeg", D / "bg-flat.jpg")
    u["bgmood"] = presign_upload(
        "trial-bg-mood.jpg", "image/jpeg",
        Path("C:/Users/Dell/Downloads/ee190198793cb52cfee9d447f04af1e0.jpg"))
    (D / "urls.json").write_text(json.dumps(u))
    print("setup done — inputs:", {k: v.split("/")[-1] for k, v in u.items()})


def phase_run(labels):
    # Fresh CSRF pair each phase — the cookie jar is in-memory per process,
    # so a token minted by an earlier `setup` run exists only in csrf.txt
    # (header) but never as a cookie in THIS process's jar. Re-mint both.
    tok = csrf()
    u = json.loads((D / "urls.json").read_text())
    state = json.loads((D / "urls.json").read_text())
    base = {
        "c-w2": {"product_url": u["w2"], "background_url": u["bgflat"], "shine": True},
        "g-w2": {"product_url": u["w2"], "background_url": u["bgflat"], "shine": True, "ghost_mannequin": True},
        "c-w5": {"product_url": u["w5"], "background_url": u["bgflat"], "shine": True},
        "b-w5": {"product_url": u["w5"], "background_url": u["bgflat"], "blur": 30},
        "c-w7": {"product_url": u["w7"], "background_url": u["bgflat"], "shine": True},
        "m-w1": {"product_url": u["w1"], "background_url": u["bgmood"], "shine": True},
    }
    from PIL import Image
    w7 = Image.open(IN / "w7.jpg")
    w, h = w7.size
    pad = 0.12
    base["x-w7"] = dict(base["c-w7"], crop={"x1": int(w * pad), "y1": int(h * pad),
                                            "x2": int(w * (1 - pad)), "y2": int(h * (1 - pad))})
    for label in labels:
        payload = base[label]
        t0 = time.time()
        st, body = req("POST", "/v1/admin/photo-cleanup/run", body=payload,
                       headers={"x-csrf-token": tok}, timeout=1200)
        dt = time.time() - t0
        try:
            j = json.loads(body)
        except Exception:
            j = {"raw": body[:300].decode(errors="replace")}
        url = (j.get("data") or {}).get("result_url") if st == 200 else None
        if url:
            state[label] = {"url": url, "status": "ok", "seconds": round(dt)}
            print(f"{label}: OK in {dt:.0f}s")
            st2, img = req("GET", url, timeout=300, headers={"User-Agent": "Mozilla/5.0"})
            if st2 == 200:
                (RES / f"{label}.jpg").write_bytes(img)
                print(f"  downloaded {len(img) // 1024}KB")
            else:
                print(f"  download failed: {st2}")
        else:
            state[label] = {"status": "failed", "error": j}
            print(f"{label}: FAILED ({st}) in {dt:.0f}s — {json.dumps(j)[:300]}")
    (D / "urls.json").write_text(json.dumps(state))


def phase_analyze():
    import numpy as np
    from PIL import Image, ImageFilter
    BG = np.array([250, 248, 244])
    rows = []
    for f in sorted(RES.glob("*.jpg")):
        im = np.asarray(Image.open(f).convert("RGB")).astype(np.int16)
        h, w, _ = im.shape
        is_bg = (np.abs(im - BG).sum(axis=2) < 30)
        fg = ~is_bg
        border = np.concatenate([im[:12].ravel(), im[-12:].ravel(), im[:, :12].ravel(), im[:, -12:].ravel()])
        grey = (np.abs(im[..., 0] - im[..., 1]) < 18) & (np.abs(im[..., 1] - im[..., 2]) < 18) & (im[..., 0] > 150) & (im[..., 0] < 245)
        bands = []
        for (a, b) in [(0, h // 4), (h // 4, 3 * h // 4), (3 * h // 4, h)]:
            gb = grey[a:b][fg[a:b]]
            bands.append(f"{gb.mean() * 100:.1f}%" if gb.size else "n/a")
        cw = int(0.35 * w)
        botl = fg[int(0.92 * h):, :cw]
        botr = fg[int(0.92 * h):, w - cw:]
        corner = ((botl.mean() + botr.mean()) / 2) * 100
        rows.append({"file": f.name, "w": w, "h": h,
                     "border_std": round(float(border.std()), 1),
                     "grey_t": bands[0], "grey_m": bands[1], "grey_b": bands[2],
                     "corner_residue": round(corner, 1)})
    for r in rows:
        print(f"{r['file']}: {r['w']}x{r['h']} border-std={r['border_std']} grey-fg t/m/b={r['grey_t']}/{r['grey_m']}/{r['grey_b']} corner={r['corner_residue']}%")
    (D / "stats.json").write_text(json.dumps(rows, indent=1))

    # gallery
    cards = []
    for label, inp in [("c-w2", "w2"), ("g-w2", "w2"), ("c-w5", "w5"), ("b-w5", "w5"),
                       ("c-w7", "w7"), ("x-w7", "w7"), ("m-w1", "w1")]:
        if not (RES / f"{label}.jpg").exists():
            continue
        cards.append(f'''<div class="card"><h2>{label} — from {inp}.jpg</h2><div class="row">
<div class="imgbox"><img src="input/{inp}.jpg"><p>RAW</p></div>
<div class="imgbox"><img src="results/{label}.jpg"><p>OUTPUT</p></div></div></div>''')
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>admin photo-cleanup trial</title>
<style>body{{font-family:system-ui;background:#141414;color:#eee;padding:28px}}
.card{{background:#202020;border:1px solid #333;border-radius:10px;padding:12px;margin-bottom:18px}}
.card h2{{font-size:14px;color:#ffd9a0;margin:0 0 10px}}.row{{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}}
.imgbox p{{font-size:11px;color:#aaa;margin:4px 0 0}}img{{max-height:440px;max-width:320px;border-radius:6px;border:1px solid #444}}</style></head>
<body><h1>Admin photo-cleanup trial — 2026-08-07</h1>{"".join(cards)}</body></html>"""
    (D / "gallery.html").write_text(html)
    print("gallery written")


def phase_dl():
    # Re-download every recorded result (Cloudflare blocks Python's default UA on
    # the r2.dev domain with error 1010 — browser UA required).
    s = json.loads((D / "urls.json").read_text())
    for label, rec in s.items():
        url = rec.get("url") if isinstance(rec, dict) else None
        if not url:
            continue
        st, img = req("GET", url, timeout=300, headers={"User-Agent": "Mozilla/5.0"})
        if st == 200:
            (RES / f"{label}.jpg").write_bytes(img)
            print(f"{label}: {len(img) // 1024}KB")
        else:
            print(f"{label}: HTTP {st}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "setup":
        phase_setup()
    elif cmd == "run":
        phase_run(sys.argv[2:])
    elif cmd == "dl":
        phase_dl()
    elif cmd == "analyze":
        phase_analyze()
    else:
        print(__doc__)
        sys.exit(1)
