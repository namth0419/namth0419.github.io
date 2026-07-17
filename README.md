# Taehyun Nam — CV Website

**`cv.json` 하나만 고치면 웹페이지와 PDF가 같이 갱신됩니다.**

```
        ┌──────────────┐
        │   cv.json    │   ← 여기만 고치세요
        └──────┬───────┘
               │  build.py
        ┌──────┴───────┐
        ▼              ▼
   index.html       cv.tex  ──pdflatex──▶  cv.pdf
   (웹페이지)                              (다운로드 버튼)
```

## 저장소 구조

```
cv.json                     ← ★ 유일한 원본. 내용은 전부 여기에.
build.py                    ← cv.json → index.html + cv.tex + cite.bib (표준 라이브러리만 사용)
make_assets.py              ← 공유 카드/파비콘 생성 (이름·사진 바뀔 때만 수동 실행)
templates/page.html         ← 웹페이지 껍데기 + CSS (디자인 고칠 때만)
templates/doc.tex           ← LaTeX 프리앰블 (조판 규칙 고칠 때만)

templates/404.html          ← 404 페이지 (디자인 고칠 때만)

index.html                  ← 자동 생성물. 직접 고치지 마세요.
cv.tex                      ← 자동 생성물. 직접 고치지 마세요.
cv.pdf  cite.bib            ← 자동 생성물.
404.html  robots.txt  sitemap.xml  ← 자동 생성물.

assets/photo.jpg            ← 프로필 사진
assets/og.png               ← 링크 공유 미리보기 카드 (1200x630)
assets/favicon.svg 등       ← 파비콘
assets/abstracts/           ← 논문 graphical abstract 이미지
assets/logos/               ← 소속 기관 로고 (선택)
papers/                     ← 논문 PDF를 여기에
.github/workflows/          ← push 시 자동 빌드 + 배포
```

`index.html` 과 `cv.tex` 맨 위에는 "GENERATED — DO NOT EDIT" 표시가 붙습니다. 여기에 손으로 쓴 내용은
다음 빌드 때 **지워집니다.**

## 쓰는 법

```bash
# cv.json 수정 후
python3 build.py            # index.html + cv.tex 생성
python3 build.py --pdf      # 위 + pdflatex 로 cv.pdf 까지 (로컬에 TeX 필요)

git add -A && git commit -m "Add paper" && git push    # 나머지는 Actions가 처리
```

로컬에 TeX가 없어도 됩니다. 그냥 push하면 GitHub Actions가 `build.py` 실행 → LaTeX 컴파일 →
배포까지 다 합니다. **Actions** 탭에서 로그를 볼 수 있습니다.

### 최초 설정 (한 번만)

1. Public 저장소 생성. 이름을 `<아이디>.github.io` 로 하면 주소가 `https://<아이디>.github.io`.
2. 전체 파일 push.
3. **Settings → Pages → Source** 를 **GitHub Actions** 로 선택.
4. 1~2분 뒤 배포 완료.

---

## cv.json 편집 가이드

### 글 안에서 쓸 수 있는 표기

| 쓰면 | 웹페이지 | PDF |
|---|---|---|
| `{me}` | 굵게 + 밑줄 (본인 이름) | `\me{...}` |
| `†` | 위첨자 † | `\dg` |
| `_기울임_` | `<em>` | `\textit{}` |
| `[보이는 글](주소)` | 링크 | `\href{}{}` |

`&`, `%`, `#`, `_` 같은 특수문자는 **그냥 쓰면 됩니다.** build.py가 HTML과 LaTeX 각각에 맞게
알아서 이스케이프합니다. (`R&D`, `100%` 전부 그대로 쓰세요.)

> 단 하나의 예외: **URL 안에 `&` 를 넣지 마세요.** LaTeX에서 문제가 됩니다.
> Scholar 주소는 `?user=...` 까지만 써도 정상 동작합니다.

### 논문 추가

`publications` 배열에 항목을 하나 넣으면 웹·PDF 양쪽에 자동 반영됩니다:

```json
{
  "authors": "{me}†, Chungryeol Lee†, and Sung Gap Im*",
  "title": "논문 제목",
  "venue": "Nature Communications",
  "volume": "17", "pages": "1234", "year": "2027",
  "status": "published",
  "doi": "10.1038/s41467-027-xxxxx",
  "pdf": "papers/2027_NatCommun_something.pdf"
}
```

- `status`: `published` / `accepted` / `in_revision` / `in_submission` / `in_preparation`
  → 웹에선 뱃지, PDF에선 `(In submission)` 같은 괄호 표기로 자동 변환
- `doi`, `pdf`: 없으면 `""` 로 두거나 아예 빼면 버튼이 안 생깁니다
- `pdf` 는 `papers/` 에 실제 파일을 올려야 404가 안 납니다
- 번호는 자동. 순서는 배열 순서 그대로.

### 논문에 graphical abstract 넣기

이미지를 `assets/abstracts/` 에 넣고 논문 항목에 세 필드를 추가하면, **그 논문만** 2열
(왼쪽 이미지 · 오른쪽 서지정보)로 바뀝니다:

```json
{
  "authors": "{me}†, ...",
  "title": "...",
  "image": "assets/abstracts/2026_AFM_Te.jpg",
  "image_alt": "Graphical abstract: iCVD passivation layer on a Te thin-film transistor",
  "image_caption": "Adv. Funct. Mater. 2026"
}
```

- `image` 가 비어 있으면(`""`) 지금처럼 한 열로 나옵니다. **섞여 있어도 됩니다** — 이미지 있는
  논문만 2열이 되고 나머지는 그대로입니다.
- 이미지는 잘리지 않습니다 (`object-fit: contain`). 가로형이든 세로형이든 비율 그대로 들어갑니다.
- 클릭하면 원본이 새 탭에서 열립니다.
- `image_caption` 은 이미지 밑 작은 대문자 라벨. 없어도 됩니다.
- `image_alt` 는 스크린리더용 설명. 비워두면 논문 제목이 자동으로 들어갑니다.
- 모바일에선 이미지가 위, 서지정보가 아래로 자동 재배치됩니다.
- 권장: **가로 1000px 내외, 200KB 이하.**

> **PDF에는 안 들어갑니다.** graphical abstract는 웹페이지 전용입니다. 원본 Word CV의 논문 목록이
> 텍스트만으로 되어 있었기 때문에 그 레이아웃을 유지했습니다. PDF에도 넣고 싶으시면 말씀해 주세요.
>
> 출판사 이미지 저작권도 한 번 확인해 보세요. 오픈액세스(CC BY) 논문은 출처를 밝히면 자유롭게
> 쓸 수 있지만, 구독형 저널은 보통 저자 본인의 개인 웹페이지 사용을 허용하되 조건이 붙습니다.
> 직접 만든 abstract 그림(제출용 원본)을 쓰는 게 가장 안전합니다.

### 본문에 사진 넣기

`research` 항목의 `figures` 배열에 넣으세요:

```json
"figures": [
  {
    "src": "assets/te-tft.jpg",
    "alt": "Cross-sectional schematic of the Te TFT stack",
    "caption": "**Fig 1.** iCVD 패시베이션을 적용한 p-type Te TFT 단면 구조.",
    "narrow": false,
    "in_pdf": false
  }
]
```

- `in_pdf: true` 로 하면 PDF에도 들어갑니다. 기본값은 웹에만 표시.
- `narrow: true` 는 웹에서 폭을 좁게.
- 이미지는 가로 1200px 내외 / 200KB 이하 권장. `alt` 는 꼭 채우세요.

### 그 밖에

| 고칠 것 | 위치 |
|---|---|
| 학력·경력·수상 | `education` / `experience` / `honors` 배열의 `when`, `what`, `detail` |
| `detail` 표시 방식 | `"inline_detail": true` → PDF에서 `제목 (부연)` 한 줄. 없으면 줄바꿈. |
| 연구 분야 | `research` → `subs` → `bullets` |
| 스킬 | `skills` 배열 (웹은 칩, PDF는 쉼표 나열) |
| 프로필 링크 | `links` 배열 (`icon`: `scholar`/`orcid`/`linkedin`/`link`) |
| 색상·폰트·레이아웃 | `templates/page.html` 상단 `:root` |
| PDF 여백·조판 | `templates/doc.tex` |

---

## 방문자 통계

GitHub Pages는 정적 호스팅이라 **서버 로그를 볼 수 없습니다.** 접속 국가·시간 같은 통계를 보려면
외부 서비스 스크립트를 한 줄 넣어야 합니다. `cv.json` 의 `analytics` 블록으로 제어됩니다:

```json
"analytics": {
  "provider": "goatcounter",
  "code": "namth0419",
  "public_url": ""
}
```

`provider` 가 `none` 이면 스크립트가 **아예 안 들어갑니다** (현재 기본값).

### 추천: GoatCounter

개인 사이트에는 이게 가장 잘 맞습니다. 무료, 오픈소스, **쿠키를 안 쓰고 개인정보를 수집하지 않습니다.**

1. https://www.goatcounter.com 에서 가입 → 원하는 코드를 정합니다 (예: `namth0419`)
   → 대시보드가 `https://namth0419.goatcounter.com` 이 됩니다.
2. `cv.json` 에 `"provider": "goatcounter"`, `"code": "namth0419"` 입력.
3. push. 끝.

보이는 것: **국가별 접속 수**, 시간대별 그래프, 유입 경로(referrer), 브라우저/OS, 페이지별 조회수.
개별 방문자를 식별하거나 추적하지는 않습니다.

`public_url` 에 대시보드 주소를 넣으면 푸터에 `Site stats ↗` 링크가 생깁니다.
(GoatCounter 설정에서 대시보드를 공개로 바꿔야 남들이 볼 수 있습니다. 비워두면 링크가 안 생깁니다.)

### 다른 선택지

| provider | code 에 넣을 것 | 비고 |
|---|---|---|
| `goatcounter` | 가입 시 정한 코드 | 무료 · 쿠키 없음 · 오픈소스 |
| `cloudflare` | beacon token | 무료 · 쿠키 없음 · Cloudflare 계정 필요 |
| `plausible` | 도메인 (`namth0419.github.io`) | 유료 · 자체 호스팅 가능 |
| `umami` | website-id | 자체 호스팅 시 `"src"` 도 지정 |
| `none` | — | 통계 없음 |

> Google Analytics는 일부러 넣지 않았습니다. 쿠키를 쓰기 때문에 EU 방문자에게 동의 배너가
> 필요해지고, 학술용 개인 페이지에 비해 과합니다. 위 서비스들은 쿠키를 쓰지 않아 일반적으로
> 배너 없이 쓸 수 있다고 여겨지지만, 법적 조언은 아닙니다. 소속 기관 웹 정책이 있다면 확인해 보세요.

---

## 소속 기관 로고 (페이지 맨 아래)

`institutions` 블록으로 제어됩니다. **지금은 로고 없이 활자 워드마크**로 나옵니다
(POSTECH · KAIST · Penn State + 재학 연도).

로고 이미지를 쓰려면 파일을 `assets/logos/` 에 넣고 경로를 채우세요:

```json
{
  "name": "KAIST",
  "full": "Korea Advanced Institute of Science and Technology",
  "years": "2023 – Current",
  "url": "https://www.kaist.ac.kr/en/",
  "logo": "assets/logos/kaist.png"
}
```

- `logo` 가 비어 있으면 워드마크, 채우면 이미지. **섞어 써도 됩니다.**
- 로고는 평소 흑백(회색조)으로 차분하게 있다가 **마우스를 올리면 원래 색으로** 돌아옵니다.
- `url` 을 지우면 링크 없이 표시만 됩니다.
- PDF에는 안 들어갑니다 (웹 전용).

### 로고 파일 크기

**가로는 신경 쓸 필요 없습니다.** 높이만 맞추면 가로는 비율대로 자동입니다.

| 항목 | 값 |
|---|---|
| 표시 높이 | **38px** (모바일 30px) |
| 준비할 파일 | **세로 114px 이상** (고해상도 화면 대비 3배수) |
| 형식 | **SVG 최선** · 아니면 **투명배경 PNG** |
| 가로 상한 | 190px |

- **여백을 미리 잘라내세요.** 로고 파일에 딸린 여백 때문에 로고만 작아 보이는 게 가장 흔한 문제입니다.
  ```bash
  magick logo.png -trim +repage logo_trim.png     # ImageMagick
  ```
- **비율 5:1이 한계입니다.** 그보다 옆으로 길면 가로 190px 제한에 걸려 높이가 38px보다 줄어듭니다
  (예: 9:1 로고 → 190×21px). 학교 로고가 아주 긴 가로형이면 심볼만 있는 버전을 쓰거나
  `logo_height` 로 다른 로고를 맞춰 내리세요.
- SVG는 원본 크기와 무관하게 항상 선명합니다. 학교 brand 페이지에 SVG가 있으면 그게 최선입니다.

### 로고별 높이 미세조정

높이를 똑같이 38px로 맞춰도 **시각적 크기는 안 맞습니다.** 세로로 긴 방패형과 옆으로 넓은
워드마크는 같은 높이여도 덩치가 달라 보입니다. 눈으로 보고 조정하세요:

```json
{ "name": "Penn State", "logo": "assets/logos/pennstate.svg", "logo_height": 32 }
```

`logo_height` 를 빼면 기본 38px입니다. 정답은 없고, 셋을 나란히 놓고 비슷해 보이면 됩니다.

> **로고를 쓰기 전에:** 대학 로고는 등록상표입니다. 세 학교 모두 브랜드 가이드라인이 있고, 보통
> 개인의 로고 사용을 "소속·후원을 암시하지 않는 범위"로 제한합니다. 재학·재직 사실을 나타내는
> 용도는 대체로 문제되지 않지만, 각 학교 brand/identity 페이지를 한 번 확인해 보세요.
> 확실히 안전한 쪽은 **지금의 활자 워드마크 그대로 두는 것**이고, 디자인상으로도 사이트와 더
> 잘 어울립니다.

---

## News 섹션

`cv.json` 의 `news` 배열. 페이지 상단(Statement 다음)에 나옵니다. **웹 전용** — 정식 CV가 아니므로 PDF엔 없습니다.

```json
"news": [
  { "date": "2026.07", "text": "Visiting [Prof. Das' group](https://...) at Penn State until November." },
  { "date": "2026.02", "text": "Our paper is out in _Advanced Functional Materials_." }
]
```

- 최신이 위로 오게 **직접 정렬**하세요 (자동 정렬 안 함).
- 배열을 비우면 섹션이 통째로 사라지고 네비 번호도 자동으로 다시 매겨집니다.
- `_기울임_`, `[링크](주소)` 사용 가능.
- 학계 페이지에서 사람들이 제일 먼저 보는 곳입니다. **3개월에 한 번은 손보세요.**

---

## BibTeX

`build.py` 가 `cv.json` 에서 `cite.bib` 를 자동 생성합니다.

- 논문마다 **BIB 버튼** → 그 논문의 BibTeX 항목이 클립보드에 복사됩니다.
- 논문 목록 아래 **All entries as BibTeX ↓** → `cite.bib` 전체 다운로드.
- 게재된 논문은 `@article`, 나머지는 `@unpublished` + `note = {Submitted to ...}` 로 나갑니다.
- 키는 `성 + 연도 + 제목첫단어` (예: `jang2025unipolar`). 중복되면 빌드 시 경고가 뜹니다.
- 실제 `bibtex` 로 컴파일 검증했습니다 (경고 0).

---

## 날짜 자동 갱신

`cv.json` 의 `"updated": "auto"` → **마지막 git 커밋 날짜**가 웹 푸터와 PDF 푸터에 자동으로 들어갑니다.
날짜를 고정하고 싶으면 `"April 2026"` 처럼 직접 적으세요.

---

## 링크 공유 미리보기

카톡·슬랙·트위터에 링크를 붙이면 `assets/og.png` 카드가 뜹니다. 이름·사진·소속이 들어간 1200×630 이미지입니다.

**중요: `cv.json` 의 `site_url` 이 실제 배포 주소와 정확히 같아야 합니다.** OG 이미지는 절대 주소로만
동작하기 때문에, 다르면 미리보기가 깨집니다.

이름·사진·소속이 바뀌었을 때만 카드를 다시 만드세요:

```bash
pip install playwright pillow && playwright install chromium
python3 make_assets.py        # assets/og.png, favicon.svg, favicon-32.png, apple-touch-icon.png
```

평소 빌드(`build.py`)에는 필요 없습니다. 생성된 이미지는 저장소에 커밋하세요.

미리보기 확인: [opengraph.xyz](https://www.opengraph.xyz) 에 주소를 넣어보면 됩니다.
(카톡·슬랙은 미리보기를 캐시하므로, 바꾼 게 바로 반영 안 될 수 있습니다.)

---

## 다크 모드

우상단 아이콘으로 전환합니다.

- 첫 방문 시 **OS 설정을 따라갑니다** (`prefers-color-scheme`).
- 한 번 누르면 그 선택이 기억됩니다 (localStorage). 저장이 막힌 브라우저에서도 전환 자체는 됩니다.
- 그리기 전에 테마를 정하므로 새로고침해도 **깜빡임이 없습니다.**
- 인쇄할 때는 항상 라이트로 나옵니다.
- 색은 `templates/page.html` 상단 `:root[data-theme="dark"]` 블록에서 바꿉니다.

> **로고 넣을 때 주의:** 어두운 색 로고는 다크 배경에서 묻힙니다. 흰색/밝은 버전이 있으면
> `"logo_dark": "assets/logos/kaist-white.png"` 로 지정하세요. 비워두면 양쪽 모두 같은 파일을 씁니다.

---

## 검색 노출 (sitemap · robots · 404)

`build.py` 가 셋 다 자동 생성합니다. 손댈 일 없습니다.

| 파일 | 역할 |
|---|---|
| `sitemap.xml` | 홈페이지 1개 URL + `lastmod`(마지막 커밋 날짜). PDF·논문은 링크를 타고 자동으로 발견됩니다. |
| `robots.txt` | 전체 크롤링 허용 + sitemap 위치 안내 |
| `404.html` | 없는 주소로 들어왔을 때. GitHub Pages가 자동으로 씁니다. 다크 모드도 따라갑니다. |

**`site_url` 이 비어 있으면 sitemap 생성을 건너뜁니다** (경고가 뜹니다). 주소가 틀리면 오히려 해가 되므로
반드시 실제 배포 주소와 맞추세요.

### 구글에 등록하기

sitemap 만으로도 결국 색인되지만, 직접 등록하면 훨씬 빠릅니다:

1. [Google Search Console](https://search.google.com/search-console) → 속성 추가 → URL 접두어에 주소 입력
2. 소유권 확인: HTML 파일 업로드 방식이 가장 쉽습니다 (받은 파일을 저장소 루트에 두고 push)
3. Sitemaps 메뉴 → `sitemap.xml` 제출

"Taehyun Nam KAIST" 로 검색했을 때 이 페이지가 뜨는 게 목표입니다. JSON-LD(schema.org Person)도
이미 들어가 있어서 구글이 이름·소속·프로필 링크를 구조적으로 인식합니다.

---

## PDF는 왜 클릭 즉시 컴파일이 아닌가

- GitHub Pages는 정적 호스팅이라 서버에서 LaTeX를 못 돌립니다.
- 브라우저에서 돌리는 WASM TeX는 수십 MB를 받아야 하고 `COOP/COEP` 응답 헤더가 필요한데,
  GitHub Pages는 커스텀 헤더를 설정할 수 없습니다.

그래서 **push 시점에 미리 컴파일**합니다. 사용자 입장에선 버튼 한 번이고, 기다릴 필요도 없습니다.

## PDF 공유 시 참고

Nature Communications 논문(1, 5번)은 오픈액세스(CC BY)라 출판본 PDF를 그대로 올려도 됩니다.
AFM(Wiley), KJChE(Springer)는 구독형이라 보통 **accepted manuscript** 만 셀프 아카이빙이 허용됩니다.
애매하면 `pdf` 필드를 비우고 DOI만 거세요.
