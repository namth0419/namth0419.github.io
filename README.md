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
build.py                    ← cv.json → index.html + cv.tex 생성기 (표준 라이브러리만 사용)
templates/page.html         ← 웹페이지 껍데기 + CSS (디자인 고칠 때만)
templates/doc.tex           ← LaTeX 프리앰블 (조판 규칙 고칠 때만)

index.html                  ← 자동 생성물. 직접 고치지 마세요.
cv.tex                      ← 자동 생성물. 직접 고치지 마세요.
cv.pdf                      ← 자동 생성물.

assets/photo.jpg            ← 프로필 사진
assets/abstracts/           ← 논문 graphical abstract 이미지
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

## PDF는 왜 클릭 즉시 컴파일이 아닌가

- GitHub Pages는 정적 호스팅이라 서버에서 LaTeX를 못 돌립니다.
- 브라우저에서 돌리는 WASM TeX는 수십 MB를 받아야 하고 `COOP/COEP` 응답 헤더가 필요한데,
  GitHub Pages는 커스텀 헤더를 설정할 수 없습니다.

그래서 **push 시점에 미리 컴파일**합니다. 사용자 입장에선 버튼 한 번이고, 기다릴 필요도 없습니다.

## PDF 공유 시 참고

Nature Communications 논문(1, 5번)은 오픈액세스(CC BY)라 출판본 PDF를 그대로 올려도 됩니다.
AFM(Wiley), KJChE(Springer)는 구독형이라 보통 **accepted manuscript** 만 셀프 아카이빙이 허용됩니다.
애매하면 `pdf` 필드를 비우고 DOI만 거세요.
