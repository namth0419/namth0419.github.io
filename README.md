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
planner/index.html          ← 개인용 연구 플래너 화면·스타일 (build.py 와 무관, 직접 수정)
planner/js/*.js             ← 플래너 동작. 기능별 파일 (목록과 순서는 planner/js/core.js 머리말)
planner/season.js           ← 상단 계절 풍경, 계절 포인트 색
planner/ambient.js          ← 풍경과 같은 날씨·시각·계절에 맞춰 자연 녹음을 섞어 트는 배경 소리
planner/sounds/             ← 배경 소리 녹음 (이음매 없이 반복되게 잘라 둔 m4a, 출처는 아래 '배경 소리 녹음 출처')
planner/manifest.webmanifest, planner/sw.js, planner/icons/  ← 앱으로 설치 (PWA)
tools/weekly-email.gs       ← 주간 메일 + 매일 Drive 백업 + Google 캘린더 연동 (Apps Script, 본인 계정에 설치)
.github/workflows/          ← push 시 자동 빌드 + 배포
```

`index.html` 과 `cv.tex` 맨 위에는 "GENERATED — DO NOT EDIT" 표시가 붙습니다. 여기에 손으로 쓴 내용은
다음 빌드 때 **지워집니다.**

### 연구 플래너 (`/planner/`)

마일스톤 · 월간 · 주간 · 일간 목표를 체크하고 코멘트를 남기는 개인용 페이지입니다.
탭: **목표**(오늘 + 월간 + 주간) / **달력**(날짜별 일간 목표) / **간트**(마일스톤 시작~마감 막대, 6개월) /
**원고**(작성 중 → 투고 → 리뷰 → 리비전 → 게재 확정, CV에서 가져오기, 리비전 대응표 → Response letter) / **문헌**(읽은 논문: DOI로 서지 정보 자동 채움,
메모·PDF 첨부, EndNote `.enw`·RIS 내보내기) / **실험**(시료 기록) /
**생각**(수집함 + 아이디어 보드: 씨앗 → 검토 중 → 진행 → 보류, 관련 문헌·원고·마일스톤 연결) /
**미팅**(지도교수·랩미팅 노트: 안건·논의·결정·할 일. 할 일은 주간·일간 목표로 바로 들어가고, 같은 이름의 다음 미팅에서
지난번 할 일 진행이 보임) / **회고**(주간 회고, 보고서 자동 작성, 활동 히트맵).
어느 탭에서든 **Ctrl+K**(맥은 ⌘K)나 오른쪽 위 전구 버튼으로 빠른 메모를 적어 수집함·오늘 할 일·아이디어·다음 미팅 안건에 넣습니다.
목표 탭 맨 위 **오늘** 요약에는 오늘 미팅, 밀린 일간 목표, 수집함, 남은 미팅 할 일, 요일 알림(월: 주간 목표, 금~일: 회고)이 모입니다.
지운 항목은 바로 없어지지 않고 30일 동안 **휴지통**(⚙ 설정 → 데이터)에 있다가 영구 삭제됩니다. 지운 직후 알림의 '되돌리기'로도 복구됩니다.
휴대폰·컴퓨터에 **앱으로 설치**할 수 있습니다(설정 → 데이터 → 앱으로 설치 안내). 설치한 아이콘을 길게 누르면 '빠른 메모'.
모든 항목에 마감일·반복·체크리스트를 달 수 있고, 위쪽에 다가오는 마감과 전체 검색(`#태그`)이 있습니다.
달력 탭에서 고른 나라의 공휴일(Nager.Date)이 달력·날짜 슬라이더·일간 목표 제목에 표시됩니다(한국은 대체공휴일 포함).
마감은 `.ics` 캘린더 파일로, 전체 데이터는 **내보내기**(JSON 백업)로 받을 수 있습니다.
매주 월요일 주간 메일과 매일 새벽 자동 백업(본인 Google Drive의 `Research Planner 백업` 폴더, 최근 60개 보관)은
`tools/weekly-email.gs`(Google Apps Script)를 본인 계정에 설치해서 돌립니다(설치 방법은 파일 맨 위).
백업 파일은 설정 → 가져오기에 넣으면 그대로 복원됩니다. 같은 스크립트가 한 시간마다 마감일과 미팅을
Google 캘린더의 `Research Planner` 캘린더에 맞춰 넣어서 휴대폰 캘린더 알림을 받을 수 있습니다
(Google Cloud 콘솔에서 **Google Calendar API** 사용 설정 필요).
상단 띠는 동글동글한 섬 풍경 일러스트(`planner/season.js`)입니다. 오른쪽 위 **⚙ 설정**에서 테마, 풍경 켜기/끄기,
위치(날씨·해/달), 휴일 표시 국가, 가져오기·내보내기, 로그아웃을 한곳에서 바꿉니다.
계절 색은 날마다 이어서 바뀌고, 절기 이름은 절기 당일에만 나옵니다. 띠 오른쪽 위에서 고른 위치의
실제 해·달 위치(일출·일몰, 월령)와 현재 날씨(Open-Meteo)가 반영됩니다. 위치는 브라우저에만 저장됩니다.
하늘·노을 색은 대기 산란(레일리·미 산란, 오존 흡수)을 계산해서 그리고, 그날의 에어로졸 광학 두께·황사(대기질 예보)와
습도에 따라 노을의 진하기가 달라집니다. 가끔 지나가는 비행기의 비행운은 순항 고도(250 hPa) 기온·습도로
생길지, 얼마나 오래 남을지를 정합니다. 기념일에는 특별 장식이 나옵니다: 새해 불꽃놀이, 설날 연·청사초롱,
어린이날 풍선, 부처님오신날 연등, 추석 큰 보름달·옥토끼·감, 할로윈 호박등·박쥐, 크리스마스 전구·별·산타 썰매.
설날·부처님오신날·추석은 천문 계산(합삭과 중기)으로 음력 날짜를 구하고, 같은 계산으로 달력에 음력 1·10·20일을 표시합니다.
밤에는 실제 별 좌표로 그 시각 남쪽 하늘의 별자리와 은하수가 보이고(달이 밝거나 흐리면 흐려짐),
강은 지난 이틀 시간별 기온으로 쌓은 '얼음 점수'에 따라 강가부터 얼고 따뜻해지면 저절로 녹습니다.
그 밖에 층별 구름(뭉게·양떼·새털구름, 노을에 높이별로 물듦), 해 위치에 따른 그림자, 강물 윤슬, 행성(수성~토성),
실제 유성우 날짜의 별똥별, 지구조, 무지개(소나기 + 낮은 해, 해 반대편 42°), 햇무리·달무리(22°), 아침 안개가 조건에 맞을 때 나옵니다.
나무 색은 그해 기온 이력으로 계산합니다: 생육도일(새순·잎), 2월부터 최고기온 누적 600°C(벚꽃 개화), 가을 서늘함 누적(단풍),
맑은 날·서늘한 밤의 비율(단풍이 얼마나 붉은지), 된서리·강풍(낙엽). 나무는 단풍나무·은행나무·벚나무·느티나무·감나무로 나뉘어 따로 물들고(감나무에만 감이 열려 익고, 잎이 진 뒤에도 남음),
풍경 위 위치 표시에 마우스를 올리면 지금 계산값이 보입니다(과거 기상 자료: archive-api.open-meteo.com). 로컬 미리보기에서는 `&aod=0.5&rh=90&plane=1&t250=-55&rh250=95`, `&fest=christmas&sleigh=1`, `&ice=0.5`, `&rainbow=1&halo=1&mist=1&meteor=1&cl=30&cm=40&ch=60`처럼 바꿔 볼 수 있습니다.
항목에 파일을 첨부하면 본인 Google Drive의 `Research Planner` 폴더에 올라가고, 플래너에는 링크만 저장됩니다
(권한은 `drive.file`이라 플래너가 올린 파일에만 접근. Google Cloud 콘솔에서 **Google Drive API** 사용 설정 필요).
풍경을 누르면 세로로 크게, 한 번 더 누르면 전체 화면이 됩니다. 전체 화면은 라이브 배경화면처럼 시계·날짜(음력)·날씨를 크게 띄우고, 가만히 두면 버튼과 커서를 숨기며 화면이 꺼지지 않게 합니다(Esc·작게 버튼으로 돌아감). 크게 볼수록 장면을 확대해 그려서 나무·해가 늘어나지 않고, 땅이 넓어진 만큼 나무 줄을 더 심습니다.
**배경 소리**(풍경의 🔈 버튼이나 설정)를 켜면 지금 날씨·시각·계절에 맞춰 실제 자연 녹음을 섞어 틉니다: 풍속에 따라 산들바람 → 숲속 강풍, 강수 세기만큼 빗소리, 번개 뒤 거리만큼 늦게 오는 천둥, 눈이 쌓이면 먹먹해지는 소리, 얼면 멈추는 강물, 낮의 새소리와 해 뜰 무렵 새벽 합창, 기온으로 빠르기가 정해지는 풀벌레(돌베어 법칙), 초여름 밤 개구리, 한여름 매미. 풍경·썰매 방울·불꽃만 합성. 녹음은 필요한 것만 소리를 켰을 때 받아 옵니다(전부 약 6 MB).
로컬에서는 `?demo&date=2026-04-05&hour=10&wx=61`처럼 날짜·현지 시각·날씨 코드를 바꿔 풍경을 미리 볼 수 있습니다.
**가져오기**로 JSON 계획을 한 번에 넣을 수 있습니다(형식은 `planner/js/goals.js`의 `parsePlan` 주석).
개인 계획 파일은 `_private/`에 두세요. git에서 제외되어 공개 저장소에 올라가지 않습니다.
홈페이지에는 링크하지 않고, 검색엔진에도 노출되지 않습니다(`noindex`).

- 로그인: Firebase Authentication (Google)
- 저장: Firestore `users/{uid}/items`
- **접근 제한은 Firebase 콘솔 → Firestore → 규칙에서** 본인 계정만 허용합니다.
  이 저장소는 공개이므로 규칙에 들어가는 개인 이메일은 여기에 적지 않습니다.
- 보안: 페이지에 CSP(불러올 수 있는 출처 제한)가 걸려 있어서, 새 외부 서비스를 쓰려면 `planner/index.html` 맨 위
  `Content-Security-Policy`에 주소를 추가해야 합니다. 로그아웃하면 브라우저에 저장된 플래너 데이터도 지웁니다.
- `planner/index.html`의 `js/*.js?v=…`, `season.js?v=…`, `ambient.js?v=…`(녹음을 바꾸면 ambient.js 의 `VER` 도), `theme-init.js?v=…`은 캐시 때문에 화면과 코드가
  서로 다른 버전으로 섞이지 않게 붙인 버전 번호입니다. 플래너 코드를 고칠 때마다 숫자를 하나씩 올리세요.
- 로컬 미리보기: `python -m http.server 8000` 후 `http://localhost:8000/planner/?demo`
  (로그인 없이 브라우저에만 저장되는 데모 데이터)

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

- `image` 가 비어 있으면(`""`) 지금처럼 한 열로 나옵니다. **섞여 있어도 됩니다.**
- 이미지는 잘리지 않습니다 (`object-fit: contain`).
- 클릭하면 원본이 새 탭에서 열립니다. PDF에는 안 들어갑니다.

---

## Research 에 그림 넣기

이미지를 `assets/figures/` 에 넣고 `figures` 배열을 채웁니다. **두 위치**를 고를 수 있습니다:

```json
"research": [
  {
    "title": "Development of p-type tellurium-based electronic devices",
    "subs": [
      {
        "title": "High-hole-mobility p-type tellurium thin-film transistors ...",
        "bullets": [ "..." ],
        "figures": [                                   ← 이 세부 항목 바로 아래
          { "src": "assets/figures/transfer.png", "alt": "Transfer characteristics",
            "caption": "**a** Transfer curves before and after passivation.", "size": "half" },
          { "src": "assets/figures/output.png", "alt": "Output characteristics",
            "caption": "**b** Output curves at varying gate bias.", "size": "half" }
        ]
      }
    ],
    "figures": [                                       ← 이 연구 분야 전체 아래
      { "src": "assets/figures/stack.png",
        "alt": "Cross-sectional schematic of the Te TFT stack",
        "caption": "**Fig 1.** iCVD 패시베이션을 적용한 p-type Te TFT 단면 구조.",
        "size": "full", "in_pdf": false }
    ]
  }
]
```

| 필드 | 설명 |
|---|---|
| `src` | `assets/figures/` 아래 경로 |
| `alt` | 스크린리더·이미지 실패 시 표시. **꼭 채우세요** |
| `caption` | 비우면 캡션 줄이 아예 안 생깁니다 |
| `size` | `full`(기본, 단 폭 전체) · `narrow`(460px) · `half`(2열) |
| `in_pdf` | `true` 면 PDF에도. 기본은 웹 전용 |

- **`half` 를 연달아 두 개** 두면 자동으로 나란히 놓입니다. 모바일에선 세로로 쌓입니다.
- 캡션에서 `**굵게**`, `_기울임_`, `[링크](주소)` 를 쓸 수 있습니다.
- SVG도 됩니다 (모식도는 SVG가 가장 선명합니다).

### 그림 파일 준비

| | |
|---|---|
| 가로 | **1200px 내외**. 본문 단이 최대 760px이라 그 이상은 낭비입니다 |
| 용량 | **200KB 이하**. 여러 장이면 페이지가 금방 무거워집니다 |
| 형식 | 모식도·그래프 → **PNG** 또는 **SVG** / 사진 → **JPEG** |
| 여백 | **미리 잘라내세요.** 논문 figure를 캡처하면 흰 여백이 딸려옵니다 |

```bash
magick fig.png -trim +repage -resize 1200x fig_web.png
```

> **몇 장이 적당한가:** 연구 분야당 **1~2장**입니다. CV는 논문이 아니라서, 그림이 많아지면
> 텍스트를 읽지 않고 넘겨버립니다. "이 사람이 무슨 소자를 만드는가"를 한눈에 보여주는
> 모식도 한 장이 데이터 그래프 여섯 장보다 낫습니다.
>
> **출판사 저작권**도 확인하세요. 논문에 실린 figure를 그대로 쓰는 것보다 **본인이 그린 원본**을
> 쓰는 게 안전하고 화질도 좋습니다.

---|---|
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

**처음엔 최근 5개만 보이고**, 나머지는 `Show all N` 버튼을 눌러야 펼쳐집니다. 개수는 `cv.json` 에서:

```json
"news_visible": 5
```

- 항목이 이 수 이하면 버튼이 안 생깁니다.
- `0` 을 넣으면 접지 않고 전부 표시합니다.
- 항목을 계속 쌓아도 페이지가 길어지지 않으니, **오래된 것을 지우지 말고 그냥 아래에 쌓으세요.**
  나중에 보면 본인 기록으로도 쓸모가 있습니다.
- JS가 꺼진 브라우저에서는 접기 없이 전부 표시됩니다 (버튼만 숨겨짐).
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

## 배경 소리 녹음 출처

`planner/sounds/`의 녹음은 위키미디어 공용(Wikimedia Commons)의 공개 라이선스 녹음을 잘라(구간 선택·잡음 대역 필터·이음매 교차 페이드·크기 맞춤) AAC로 바꾼 것입니다.
CC BY-SA 녹음을 고친 파일은 같은 CC BY-SA 라이선스를 따릅니다.

| 파일 | 원본 | 만든 사람 | 라이선스 |
|---|---|---|---|
| wind-light | [Windy day (Gravity Sound).wav](https://commons.wikimedia.org/wiki/File:Windy_day_(Gravity_Sound).wav) | Gravity Sound | CC BY 4.0 |
| wind-strong | [Wind in Swedish pine forest at 25 mps.ogg](https://commons.wikimedia.org/wiki/File:Wind_in_Swedish_pine_forest_at_25_mps.ogg) | W.carter | CC BY-SA 4.0 |
| rain | [Rain on leaves (Gravity Sound).wav](https://commons.wikimedia.org/wiki/File:Rain_on_leaves_(Gravity_Sound).wav) | Gravity Sound | CC BY 4.0 |
| thunder-1~3 | [Summer thunderstorm in the woods.ogg](https://commons.wikimedia.org/wiki/File:Summer_thunderstorm_in_the_woods.ogg) | Serg Childed | CC BY-SA 4.0 |
| stream | [2024-07-26 Molln (Oberösterreich) Bachlauf plätschert](https://commons.wikimedia.org/wiki/File:2024-07-26_Molln_(Ober%C3%B6sterreich)_Bachlauf_pl%C3%A4tschert_(Krumme_Steyerling_bei_Piesslingerstra%C3%9Fe).wav) | DrTrumpet | CC0 |
| birds-day | [Bourne woods Birdsong 2020-05-02 0804.mp3](https://commons.wikimedia.org/wiki/File:Bourne_woods_Birdsong_2020-05-02_0804.mp3) | Robert EA Harvey | CC BY-SA 4.0 |
| birds-dawn | [Dawn chorus at Glencairnie big bungalow Craigmore DM.ogg](https://commons.wikimedia.org/wiki/File:Dawn_chorus_at_Glencairnie_big_bungalow_Craigmore_DM.ogg) | DivyaCM | CC BY 4.0 |
| crickets | [Field cricket Gryllus pennsylvanicus.ogg](https://commons.wikimedia.org/wiki/File:Field_cricket_Gryllus_pennsylvanicus.ogg) | Thatcher | CC BY-SA 3.0 |
| frogs | [Frogs croak calling chorus at night.ogg](https://commons.wikimedia.org/wiki/File:Frogs_croak_calling_chorus_at_night.ogg) | JogiAsad | CC BY-SA 4.0 |
| cicada | [Cicada 20200619.wav](https://commons.wikimedia.org/wiki/File:Cicada_20200619.wav) | Shyamal | CC0 |

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

### Google Search Console 등록

sitemap 만으로도 결국 색인되지만, 직접 등록하면 훨씬 빠릅니다.

**1. 속성 추가** — [Search Console](https://search.google.com/search-console) → Add property →
**URL 접두어(URL prefix)** 쪽에 `https://namth0419.github.io` 입력.

> 왼쪽의 **도메인(Domain)** 은 쓸 수 없습니다. DNS TXT 레코드가 필요한데 `github.io` 는 내 도메인이
> 아니니까요. 반드시 오른쪽 URL 접두어를 쓰세요.

**2. 소유권 확인 — HTML 태그 방식**

Google이 주는 태그에서 `content="..."` **안의 문자열만** 복사해서 `cv.json` 에 넣으세요:

```json
"google_verification": "AbCdEf1234..."
```

그리고 `python3 build.py` → commit → push → 배포 완료 후 Search Console에서 **확인** 클릭.

> ⚠️ **`index.html` 에 직접 붙여넣지 마세요.** 자동 생성물이라 다음 빌드에 지워지고, 그러면
> 어느 날 소유권 확인이 풀립니다. Google은 태그를 주기적으로 다시 확인합니다.
>
> HTML 파일 업로드 방식(`googleXXXX.html` 을 저장소 루트에 두기)도 됩니다. 그 파일은 자동 생성물이
> 아니라서 안전합니다. 편한 쪽을 고르세요.

**3. sitemap 제출** — 왼쪽 메뉴 **Sitemaps** → 빈칸에 `sitemap.xml` 만 입력 → **제출**.
상태가 초록색 '성공' 이면 끝입니다.

**4. (선택) 색인 요청** — 상단 검색창에 홈페이지 주소를 넣고 **URL 검사** → **색인 생성 요청**.
새 사이트는 이게 가장 빠릅니다.

데이터가 쌓이는 데 며칠, 검색에 뜨는 데 길게는 몇 주 걸립니다. 조급해하지 마세요.

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
