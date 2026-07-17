#!/usr/bin/env python3
"""
공유 미리보기 카드(og.png)와 파비콘을 만듭니다.

이건 build.py 와 달리 **한 번만 돌리면 되는** 스크립트입니다.
이름/소속/사진이 바뀔 때만 다시 돌리세요. Playwright + Pillow 가 필요합니다:

    pip install playwright pillow && playwright install chromium
    python3 make_assets.py

생성물: assets/og.png (1200x630), assets/favicon.svg,
        assets/favicon-32.png, assets/apple-touch-icon.png
"""
import base64
import json
import os
import pathlib

ROOT = os.path.dirname(os.path.abspath(__file__))

# ── 파비콘: 기판 위에 증착된 박막 적층 구조 (사이트의 시각 언어 그대로) ──────────
FAVICON = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="11" fill="#12161a"/>
  <rect x="13" y="13" width="38" height="6" rx="1" fill="#2B3A8F"/>
  <rect x="13" y="22" width="38" height="6" rx="1" fill="#7B3FA0"/>
  <rect x="13" y="31" width="38" height="6" rx="1" fill="#C79A2E"/>
  <rect x="13" y="40" width="38" height="6" rx="1" fill="#2A7F6F"/>
  <rect x="9" y="49" width="46" height="4" rx="1" fill="#E8EAE6"/>
</svg>
'''

CARD = '''<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#E8EAE6;position:relative;overflow:hidden;
       font-family:"Noto Sans CJK KR","DejaVu Sans",sans-serif;
       display:flex;align-items:center}
  .film{position:absolute;top:0;left:0;right:0;height:10px;
        background:linear-gradient(90deg,#1E2A78 0%,#6E2E8F 34%,#B98B22 67%,#2A7F6F 100%)}
  .wrap{display:flex;align-items:center;gap:68px;padding:0 84px 34px;width:100%}
  .photo{width:228px;height:296px;object-fit:cover;flex:none;
         border:1px solid #CDD1CA;filter:grayscale(1) contrast(1.04);position:relative}
  .photo-wrap{position:relative;flex:none}
  .photo-wrap::after{content:"";position:absolute;left:0;right:0;bottom:-8px;height:5px;
        background:linear-gradient(90deg,#1E2A78 0%,#6E2E8F 34%,#B98B22 67%,#2A7F6F 100%)}
  .name{font-size:94px;font-weight:900;letter-spacing:-2.8px;color:#12161a;line-height:.97}
  .rule{width:104px;height:3px;background:#12161a;opacity:.8;margin:32px 0 28px}
  .role{font-family:"DejaVu Sans Mono",monospace;font-size:21px;line-height:1.85;
        color:#4A524C;letter-spacing:.5px}
  .foot{position:absolute;left:84px;right:84px;bottom:52px;display:flex;
        justify-content:space-between;align-items:flex-end;
        font-family:"DejaVu Sans Mono",monospace;font-size:17px;color:#6E7671;letter-spacing:.6px}
  .foot .k{color:#1E2A78}
</style></head><body>
  <div class="film"></div>
  <div class="wrap">
    <div class="photo-wrap"><img class="photo" src="__PHOTO__"></div>
    <div>
      <div class="name">__NAME1__<br>__NAME2__</div>
      <div class="rule"></div>
      <div class="role">__ROLE__</div>
    </div>
  </div>
  <div class="foot"><span class="k">__URL__</span><span>CURRICULUM VITAE</span></div>
</body></html>
'''


def main():
    cv = json.load(open(os.path.join(ROOT, "cv.json"), encoding="utf-8"))
    out = os.path.join(ROOT, "assets")
    os.makedirs(out, exist_ok=True)

    with open(os.path.join(ROOT, "assets", "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(FAVICON)
    print("  assets/favicon.svg")

    photo = "data:image/jpeg;base64," + base64.b64encode(
        open(os.path.join(ROOT, cv["photo"]), "rb").read()).decode()
    parts = cv["me"].split()
    html = (CARD.replace("__PHOTO__", photo)
                .replace("__NAME1__", parts[0])
                .replace("__NAME2__", " ".join(parts[1:]))
                .replace("__ROLE__", "<br>".join(cv["role_lines"]))
                .replace("__URL__", (cv.get("site_url") or "").replace("https://", "")))

    from playwright.sync_api import sync_playwright
    tmp = os.path.join(ROOT, "_card.html")
    open(tmp, "w", encoding="utf-8").write(html)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1200, "height": 630},
                            device_scale_factor=1)
            pg.goto("file://" + tmp)
            pg.wait_for_timeout(400)
            pg.screenshot(path=os.path.join(out, "og.png"))

            # 파비콘 래스터화 (SVG를 HTML로 감싸야 크기 지정이 됩니다)
            fav = os.path.join(ROOT, "_fav.html")
            for name, size in [("favicon-32.png", 32), ("apple-touch-icon.png", 180)]:
                open(fav, "w", encoding="utf-8").write(
                    '<!DOCTYPE html><meta charset="utf-8">'
                    '<style>html,body{margin:0;background:transparent}'
                    'svg{width:%dpx;height:%dpx;display:block}</style>%s' % (size, size, FAVICON))
                fp = b.new_page(viewport={"width": size, "height": size})
                fp.goto("file://" + fav)
                fp.wait_for_timeout(200)
                fp.screenshot(path=os.path.join(out, name), omit_background=True)
                fp.close()
                print("  assets/%s" % name)
            b.close()
    finally:
        for f in (tmp, os.path.join(ROOT, "_fav.html")):
            if os.path.exists(f):
                os.remove(f)

    print("  assets/og.png")


if __name__ == "__main__":
    main()
