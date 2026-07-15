# Taehyun Nam — CV Website

## 저장소 구조

```
index.html        ← 사이트 전체 (사진은 base64로 내장되어 있음)
assets/           ← 본문에 넣을 이미지 (photo.jpg 사본 포함)
papers/           ← 논문 PDF를 여기에 넣으세요
README.md
```

## GitHub Pages로 올리기

1. GitHub에서 새 저장소 생성. 이름을 `<본인아이디>.github.io` 로 하면 주소가 `https://<본인아이디>.github.io`.
   다른 이름(예: `cv`)이면 `https://<본인아이디>.github.io/cv/`. **Public**이어야 합니다.
2. 위 파일/폴더를 저장소 루트에 업로드 (**Add file → Upload files**).
3. **Settings → Pages** → Source: *Deploy from a branch*, Branch: **main / (root)** → Save.
4. 1~2분 뒤 표시되는 주소로 접속.

```bash
git init && git add . && git commit -m "CV website"
git branch -M main
git remote add origin https://github.com/<아이디>/<저장소>.git
git push -u origin main
```

---

## 1. 프로필 링크

좌측 레일에 Google Scholar · ORCID · LinkedIn 추가했습니다. `index.html`의 `<ul class="social">` 안에 있습니다.

> **ORCID 주소 참고:** 주신 `orcid.org/my-orcid?orcid=...` 는 본인이 로그인했을 때만 열리는 관리 페이지입니다.
> 남에게 보여줄 공개 주소는 **https://orcid.org/0009-0005-3489-1133** 이고, 이 주소로 넣었습니다.

링크를 더 추가하려면 (ResearchGate, GitHub, X 등) 같은 `<li>` 블록을 복사해 주소와 이름만 바꾸면 됩니다.

## 2. 논문 링크 (DOI / PDF)

이미 게재된 3편은 실제 DOI를 확인해서 걸어뒀습니다.

| # | 논문 | DOI |
|---|---|---|
| 1 | A High-Hole Mobility Tellurium Transistor… (AFM 2026) | `10.1002/adfm.202527125` |
| 5 | A unipolar-driven synaptic transistor… (Nat Commun 2025) | `10.1038/s41467-025-63073-2` |
| 6 | Vapor-Phase Deposited Polymer Dielectric Layers… (KJChE 2025) | `10.1007/s11814-024-00210-5` |

각 논문 아래에 이런 블록이 들어갑니다:

```html
<div class="links">
  <a class="lnk" href="https://doi.org/10.1002/adfm.202527125" target="_blank" rel="noopener">DOI</a>
  <a class="lnk pdf" href="papers/2026_AFM_Te-transistor.pdf" target="_blank" rel="noopener">PDF</a>
</div>
```

- **DOI 버튼**: `https://doi.org/<DOI번호>` 형태로 쓰면 출판사 페이지로 영구 연결됩니다.
- **PDF 버튼**: PDF 파일을 `papers/` 폴더에 올리고 파일명을 맞춰주세요. 현재 걸려 있는 경로는
  `papers/2026_AFM_Te-transistor.pdf`, `papers/2025_NatCommun_UDST.pdf`, `papers/2025_KJChE_review.pdf` 입니다.
  파일을 안 올리면 404가 뜨니, 올리지 않을 논문은 해당 `<a class="lnk pdf">` 줄을 지우세요.
- 버튼 종류를 늘려도 됩니다: `<a class="lnk" href="...">CODE</a>`, `... >SLIDES</a>` 등 자유롭게.
- 4번 논문(Nat Commun, accepted)에는 DOI 나오면 바로 쓸 수 있게 주석으로 틀을 넣어뒀습니다.

> **PDF 공유 주의:** Nature Communications(1, 5번)는 오픈액세스(CC BY)라 출판본 PDF를 그대로 올려도 문제없습니다.
> AFM(Wiley)과 KJChE(Springer)는 구독형이라, 출판사 최종본 대신 **accepted manuscript(심사 통과 원고)** 를
> 올리는 것이 일반적으로 허용됩니다. 각 저널의 self-archiving 정책을 한 번 확인해 보세요.
> 애매하면 PDF 버튼 없이 DOI만 걸어두는 것이 가장 안전합니다.

## 3. 본문에 사진/그림 넣기

네, 어디든 넣을 수 있습니다. `Research` 섹션 안에 사용법을 주석으로 넣어뒀으니 주석만 풀면 됩니다.

이미지 파일을 `assets/` 에 올리고:

```html
<figure>
  <img src="assets/te-tft.jpg" alt="Cross-sectional schematic of the Te TFT stack">
  <figcaption><b>Fig 1.</b> iCVD 고분자 패시베이션 층을 적용한 p-type Te TFT 단면 구조.</figcaption>
</figure>
```

- 좁게: `<figure class="fig-narrow">`
- 두 장 나란히: `<div class="fig-row"> <figure>…</figure> <figure>…</figure> </div>` (모바일에선 자동으로 세로 배치)
- 캡션은 모노스페이스 + 좌측 금색 라인으로 나오고, `<b>` 로 감싼 부분만 진해집니다.
- 이미지는 **가로 1200px 내외, JPEG 200KB 이하**로 줄여서 올리는 걸 권합니다. 페이지가 훨씬 빨라집니다.
- `alt` 텍스트는 꼭 채우세요 (스크린리더 + 이미지 로드 실패 시 표시).

## 4. 그 밖에 자주 고칠 곳

| 무엇을 | 어디를 |
|---|---|
| 논문 추가 | `<section id="publications">` 의 `<ol class="list">` 에 `<li>` 추가 (번호는 자동) |
| 상태 뱃지 | `class="st"` (기본) / `class="st pub"` (게재) / `class="st acc"` (accepted) |
| 본인 이름 강조 | `<span class="me">Taehyun Nam</span>` |
| 색상 | 파일 상단 `:root` 의 `--ink, --wafer, --deep, --film-*` |
| 사진 교체 | `<img class="portrait" src="...">` 의 src를 `assets/새파일.jpg` 로 변경 |

브라우저에서 **인쇄 → PDF로 저장** 하면 인쇄 전용 레이아웃으로 깔끔하게 뽑힙니다.
