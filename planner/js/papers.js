"use strict";
/* ------------------------------------------------------------------ 원고 보드 */
function setStage(p, stage) {
  const cur = byId.get(p.id) || p, P = cur.paper || {};
  if ((P.stage || "draft") === stage) return;
  const paper = { ...P, stage };
  if (stage === "submitted" && !P.submitted) paper.submitted = ymd(new Date());
  const done = stage === "accepted" || stage === "published";
  act(store.update(p.id, { paper, stageLog: [...(cur.stageLog || []), { stage, at: Date.now() }],
                           done, doneAt: done ? (cur.doneAt || Date.now()) : null }));
}

function paperFields(p) {
  const P = p.paper || {};
  const set = patch => act(store.update(p.id, { paper: { ...((byId.get(p.id) || p).paper || {}), ...patch } }));
  return h("div", { class: "fields" },
    h("label", {}, "단계", h("select", { onchange: e => setStage(p, e.target.value) },
      STAGES.map(([v, l]) => h("option", { value: v, selected: (P.stage || "draft") === v }, l)))),
    h("label", {}, "저널", textInput("pj:" + p.id, P.journal, v => set({ journal: v }), { class: "edit sm", placeholder: "예: Nat Commun", "aria-label": "저널" })),
    h("label", {}, "역할", h("select", { onchange: e => set({ role: e.target.value }) },
      ROLES.map(r => h("option", { value: r, selected: (P.role || "1저자") === r }, r)))),
    h("label", {}, "투고일", h("input", { type: "date", value: P.submitted || "", onchange: e => set({ submitted: e.target.value }) })),
    h("label", { class: "wide" }, "공저자", textInput("pa:" + p.id, P.authors, v => set({ authors: v }), { class: "edit", placeholder: "예: 김OO, 이OO, 지도교수", "aria-label": "공저자" })));
}

/* cv.json 의 publications 를 원고로 가져오기 (홈페이지와 같은 사이트라 바로 읽을 수 있음) */
let cvPubs = null, cvMe = "", cvOpen = false, cvErr = "";
const CV_STAGE = { in_preparation: "draft", in_submission: "submitted", under_review: "review", in_review: "review",
                   in_revision: "revision", accepted: "accepted", in_press: "accepted", published: "published" };
const normTitle = t => (t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
async function loadCv() {
  cvErr = "";
  try {
    const r = await fetch("../cv.json", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const cv = await r.json();
    cvMe = cv.me || "";
    cvPubs = (cv.publications || []).filter(x => x && x.title);
  } catch (e) { cvErr = "cv.json 을 읽지 못했습니다: " + e.message; cvPubs = []; }
  render();
}
function cvRole(authors) {
  const parts = (authors || "").split(/,\s*(?:and\s+)?|\s+and\s+/).map(s => s.trim()).filter(Boolean);
  const i = parts.findIndex(s => s.includes("{me}"));
  if (i < 0) return "공저자";
  const me = parts[i];
  if (me.includes("*")) return "교신저자";
  if (me.includes("†")) return parts.filter(s => s.includes("†")).length > 1 ? "공동 1저자" : "1저자";
  return i === 0 ? "1저자" : "공저자";
}
function cvFields(x) {
  return {
    stage: CV_STAGE[x.status] || (x.year ? "published" : "draft"),
    journal: x.venue || "",
    role: cvRole(x.authors),
    authors: (x.authors || "").replace(/\{me\}/g, cvMe || "나"),
    cvKey: x.doi || normTitle(x.title)
  };
}
const paperOfCv = x => items.find(i => i.kind === "paper" && (((i.paper || {}).cvKey && i.paper.cvKey === (x.doi || normTitle(x.title)))
                                                              || normTitle(i.title) === normTitle(x.title)));
function addFromCv(list) {
  const now = Date.now();
  const rows = list.map((x, k) => {
    const f = cvFields(x);
    const done = f.stage === "accepted" || f.stage === "published";
    return { id: rid(), data: { kind: "paper", title: x.title, period: "", parent: "",
      paper: { stage: f.stage, journal: f.journal, role: f.role, submitted: "", authors: f.authors, cvKey: f.cvKey },
      stageLog: [{ stage: f.stage, at: now }], done, doneAt: done ? now : null, due: "",
      comments: x.doi ? [{ id: rid(), text: `DOI: https://doi.org/${x.doi}`, at: now }] : [], created: now + k } };
  });
  if (rows.length) act(store.addMany(rows).then(() => toast(`원고 ${rows.length}편을 CV에서 가져왔습니다.`)));
}
// 이미 있는 원고에 CV 정보를 덮어쓰기 (투고일·마감·체크리스트·코멘트는 그대로)
function fillFromCv(p, x) {
  const f = cvFields(x), cur = byId.get(p.id) || p, P = cur.paper || {};
  const patch = { paper: { ...P, journal: f.journal, role: f.role, authors: f.authors, cvKey: f.cvKey } };
  if ((P.stage || "draft") !== f.stage) {
    patch.paper.stage = f.stage;
    patch.stageLog = [...(cur.stageLog || []), { stage: f.stage, at: Date.now() }];
    patch.done = f.stage === "accepted" || f.stage === "published";
    patch.doneAt = patch.done ? (cur.doneAt || Date.now()) : null;
  }
  act(store.update(p.id, patch).then(() => toast("CV 정보로 채웠습니다.")));
}
const CV_STATUS_TEXT = { published: "출판", in_revision: "리비전", in_submission: "투고 중", in_preparation: "준비 중", under_review: "리뷰 중", accepted: "게재 확정" };
function cvPanel() {
  if (!cvOpen) return null;
  if (!cvPubs) { loadCv(); return h("section", { class: "cvpanel" }, h("p", { class: "empty" }, "cv.json 을 읽는 중…")); }
  const rest = cvPubs.filter(x => !paperOfCv(x));
  return h("section", { class: "cvpanel" },
    h("div", { class: "pd-head" }, h("b", {}, "CV에서 원고 가져오기"),
      h("span", { class: "when" }, `${cvPubs.length}편 중 ${cvPubs.length - rest.length}편은 이미 있음`),
      h("button", { class: "link", type: "button", onclick: () => { cvOpen = false; render(); } }, "닫기")),
    cvErr && h("p", { class: "err" }, cvErr),
    h("ul", { class: "cvlist" }, cvPubs.map(x => {
      const have = paperOfCv(x);
      return h("li", {},
        h("span", { class: "kind" }, CV_STATUS_TEXT[x.status] || x.status || "—"),
        h("span", { class: "rt" }, x.title, h("small", {}, [x.venue, x.year, cvRole(x.authors)].filter(Boolean).join(" · "))),
        have ? h("span", { class: "when" }, "추가됨")
             : h("button", { class: "btn ghost", type: "button", onclick: () => addFromCv([x]) }, "추가"));
    })),
    h("div", { class: "rp-actions" },
      rest.length > 0 && h("button", { class: "btn", type: "button", onclick: () => addFromCv(rest) }, `없는 ${rest.length}편 모두 추가`),
      h("span", { class: "hint" }, "저널·저자·역할·단계를 채웁니다. 투고일과 마감은 직접 넣어 주세요.")));
}
// 원고 상세에서 CV 항목을 골라 정보 채우기
function cvFillField(p) {
  if (!cvPubs) return h("div", { class: "fields" },
    h("button", { class: "link", type: "button", onclick: () => loadCv() }, "CV(cv.json)에서 정보 채우기…"));
  if (!cvPubs.length) return null;
  const mine = cvPubs.find(x => ((p.paper || {}).cvKey && (x.doi || normTitle(x.title)) === p.paper.cvKey) || normTitle(x.title) === normTitle(p.title));
  return h("div", { class: "fields" },
    h("label", { class: "wide" }, "CV 정보로 채우기",
      h("select", { onchange: e => { const x = e.target.value !== "" && cvPubs[+e.target.value]; if (x) fillFromCv(p, x); } },
        h("option", { value: "" }, mine ? "— 연결된 CV 항목에서 다시 채우기" : "— CV 논문 고르기"),
        cvPubs.map((x, k) => h("option", { value: String(k) }, (x === mine ? "✓ " : "") + x.title)))));
}

// 접어 둔 단계 묶음 (이 브라우저에만 기억). 처음에는 게재 확정·출판을 접어 둠
let paperFold = new Set(["accepted", "published"]);
try { const v = JSON.parse(localStorage.getItem("planner-paper-fold")); if (Array.isArray(v)) paperFold = new Set(v); } catch (e) {}
const savePaperFold = () => { try { localStorage.setItem("planner-paper-fold", JSON.stringify([...paperFold])); } catch (e) {} };

function viewPapers() {
  const papers = items.filter(i => i.kind === "paper");
  const stageOf = p => (p.paper || {}).stage || "draft";
  const lead = p => ["1저자", "공동 1저자"].includes((p.paper || {}).role || "1저자");
  const accepted = papers.filter(p => ["accepted", "published"].includes(stageOf(p)));
  const active = papers.filter(p => ["submitted", "review", "revision"].includes(stageOf(p)));
  const byDue = (a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : byCreated(a, b);
  const toGroup = k => {
    paperFold.delete(k); savePaperFold(); render();
    const el = document.querySelector(`.pgroup[data-stage="${k}"]`);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return h("div", {},
    // 단계별 진행 막대
    h("div", { class: "pipe" }, STAGES.map(([k, label]) => {
      const n = papers.filter(p => stageOf(p) === k).length;
      return h("button", { type: "button", class: `pipe-s st-${k}` + (n ? "" : " zero"), disabled: !n, onclick: () => toGroup(k) },
        h("b", {}, String(n)), h("span", {}, label));
    })),
    h("div", { class: "psum" },
      h("span", {}, `게재 확정·출판 ${accepted.length}편 (1저자 ${accepted.filter(lead).length})`),
      h("span", {}, `진행 중 ${active.length}편`),
      h("button", { class: "btn ghost", type: "button", "aria-expanded": String(cvOpen),
                    onclick: () => { cvOpen = !cvOpen; if (cvOpen) cvPubs = null; render(); } }, "CV에서 가져오기")),
    cvPanel(),
    STAGES.map(([k, label]) => {
      const list = papers.filter(p => stageOf(p) === k).sort(byDue);
      if (!list.length) return null;
      const folded = paperFold.has(k);
      return h("section", { class: "pgroup", dataset: { stage: k } },
        h("button", { class: "pg-head", type: "button", "aria-expanded": String(!folded),
                      onclick: () => { folded ? paperFold.delete(k) : paperFold.add(k); savePaperFold(); render(); } },
          h("span", { class: "chev" }, folded ? "▸" : "▾"), label, h("span", { class: "n" }, String(list.length))),
        !folded && h("ul", { class: "plist" }, list.map(paperRow)));
    }),
    adder("ap", "+ 원고 추가 (Enter)", () => ({ kind: "paper", period: "", parent: "",
      paper: { stage: "draft", journal: "", role: "1저자", submitted: "", authors: "" }, stageLog: [{ stage: "draft", at: Date.now() }] })),
    h("p", { class: "empty" }, "‹ › 로 단계를 옮기고, 제목을 누르면 저널·공저자·투고일·마감·체크리스트·파일을 적을 수 있습니다."));
}

function paperRow(p) {
  const open = openIds.has(p.id), P = p.paper || {}, st = P.stage || "draft";
  const i = Math.max(0, STAGES.findIndex(x => x[0] === st));
  const wait = paperWait(p);
  const nK = (p.checks || []).length, nKd = (p.checks || []).filter(c => c.done).length;
  const nC = (p.comments || []).length, nA = (p.attachments || []).length;
  return h("li", { class: `prow st-${st}` + (open ? " open" : ""), dataset: { id: p.id } },
    h("div", { class: "pr-main" },
      h("button", { class: "pr-title", type: "button", "aria-expanded": String(open), onclick: () => toggleOpen(p.id) }, p.title),
      h("div", { class: "pm" },
        P.journal && h("span", { class: "pj" }, P.journal),
        P.role && h("span", {}, P.role),
        wait && h("span", { title: "투고일부터 지난 기간" }, wait),
        nK > 0 && h("span", {}, `☑ ${nKd}/${nK}`),
        (p.rev || []).length > 0 && (() => { const r = (p.rev || []).filter(c => (c.round || 1) === Math.max(...p.rev.map(x => x.round || 1)));
          return h("span", { title: "리비전 대응표" }, `대응 ${r.filter(c => c.done).length}/${r.length}`); })(),
        nA > 0 && h("span", {}, `첨부 ${nA}`),
        nC > 0 && h("span", {}, `코멘트 ${nC}`),
        dueChip(p))),
    h("div", { class: "pr-step" },
      h("button", { type: "button", disabled: i === 0, "aria-label": "이전 단계로", title: i > 0 ? stageName(STAGES[i - 1][0]) + "(으)로" : null,
                    onclick: () => setStage(p, STAGES[i - 1][0]) }, "‹"),
      h("span", { class: "pr-stage" }, stageName(st)),
      h("button", { type: "button", disabled: i === STAGES.length - 1, "aria-label": "다음 단계로", title: i < STAGES.length - 1 ? stageName(STAGES[i + 1][0]) + "(으)로" : null,
                    onclick: () => setStage(p, STAGES[i + 1][0]) }, "›")),
    open && h("div", { class: "pr-detail" }, detail(p, { paper: true, parents: milestoneOptions(p) })));
}

// 원고가 얼마나 기다리고 있는지: 투고·리뷰·리비전 모두 투고일부터 셈
const dur = days => days >= 14 ? `${Math.floor(days / 7)}주` : `${days}일`;
function paperWait(p) {
  const P = p.paper || {}, st = P.stage || "draft";
  if (!["submitted", "review", "revision"].includes(st)) return null;
  return P.submitted ? `투고 후 ${dur(Math.max(0, -daysTo(P.submitted)))}` : "투고일 미입력";
}

/* ------------------------------------------------------------------ 리비전 대응표
 * 원고(paper)의 rev:     [{ id, round, reviewer, text, response, where, done }]   reviewer: "Editor" | "Reviewer 1" …
 *              revMeta: { 차수: { reviewers: 리뷰어 수, editor: 에디터 칸 여부 } }
 * 차수를 고르고 → 리뷰어 수를 정하면 리뷰어별 칸이 생기고 → '+ 질문 추가'로 R1Q1, R1Q2 … (번호는 순서대로 자동, 지우면 다시 매김)
 * 고친 내용은 대응표의 '저장'(또는 Ctrl+S)을 눌러야 저장됨. 저장 안 한 변경이 있으면 표시하고, 페이지를 떠날 때 경고.
 * 리뷰 코멘트를 통째로 붙여넣으면 빈 줄·번호(1. / (2) / Comment 3)마다 질문으로 나눠 주는 보조 기능도 리뷰어 칸 안에 있음.
 */
const revRound = new Map();      // 원고 id → 보고 있는 차수
const revWork = new Map();       // 원고 id → { rev, meta, base(마지막으로 저장된 상태), savedAt }  ← 저장 전까지 고치는 사본
const qLabel = (reviewer, k) => reviewer === "Editor" ? `EQ${k}` : `R${reviewer.replace(/\D+/g, "")}Q${k}`;
const revSnap = p => { const c = byId.get(p.id) || p; return JSON.stringify({ rev: c.rev || [], meta: c.revMeta || {} }); };
const revDirty = W => JSON.stringify({ rev: W.rev, meta: W.meta }) !== W.base;
function revWorkOf(p) {
  let W = revWork.get(p.id);
  const snap = revSnap(p);
  if (!W || (W.base !== snap && !revDirty(W))) {     // 처음이거나, 다른 기기에서 바뀌었고 여기서 고친 게 없으면 새로 읽음
    const s = JSON.parse(snap);
    W = { rev: s.rev, meta: s.meta, base: snap, savedAt: W ? W.savedAt : 0 };
    revWork.set(p.id, W);
  }
  return W;
}
const revRoundsOf = W => [...new Set([...W.rev.map(c => c.round || 1), ...Object.keys(W.meta).map(Number)])].sort((a, b) => a - b);
function revMetaOf(W, round) {                      // 그 차수의 리뷰어 수 (적어 둔 질문이 있는 리뷰어는 항상 보이게)
  const inR = W.rev.filter(c => (c.round || 1) === round), m = W.meta[round] || {};
  const top = Math.max(0, ...inR.filter(c => c.reviewer !== "Editor").map(c => +c.reviewer.replace(/\D+/g, "") || 1));
  return { reviewers: Math.max(m.reviewers || (inR.length ? 1 : 2), top), editor: !!m.editor || inR.some(c => c.reviewer === "Editor") };
}
const revGroups = M => [...(M.editor ? ["Editor"] : []), ...Array.from({ length: M.reviewers }, (_, i) => `Reviewer ${i + 1}`)];
addEventListener("beforeunload", e => { if ([...revWork.values()].some(revDirty)) { e.preventDefault(); e.returnValue = ""; } });

// 붙여넣은 코멘트를 하나씩: 빈 줄로 나뉘어 있으면 그대로, 아니면 "1." "(2)" "Comment 3" "Q4" "- " 로 시작하는 줄마다
function splitComments(text) {
  const t = text.replace(/\r/g, "").trim();
  if (!t) return [];
  let parts = t.split(/\n\s*\n+/);
  if (parts.length === 1) {
    parts = [];
    for (const line of t.split("\n")) {
      if (!parts.length || /^\s*(\(?\d+[.)]|comment\s*\d+|q\s*\d+|[-•*]\s)/i.test(line)) parts.push(line);
      else parts[parts.length - 1] += "\n" + line;
    }
  }
  // 앞에 붙은 번호는 떼어 냄 (R1Q1 처럼 다시 매김)
  return parts.map(s => s.trim().replace(/^(\(?\d+[.)]|comment\s*\d+\s*[.:)]?|q\s*\d+\s*[.:)]?|[-•*])\s*/i, "").trim()).filter(Boolean);
}

// Response letter: 에디터 → 리뷰어 1, 2 … 순서, 질문 번호는 대응표와 같음 (R1Q1 …)
function responseLetter(p, round) {
  const W = revWorkOf(p), M = revMetaOf(W, round), J = (p.paper || {}).journal;
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const T = [`Response to Reviewers`, `"${p.title}"${J ? ` — ${J}` : ""}${round > 1 ? ` (Revision ${round})` : ""}`, ""];
  const H = [`<h2>Response to Reviewers</h2>`, `<p><i>${esc(p.title)}</i>${J ? ` — ${esc(J)}` : ""}${round > 1 ? ` (Revision ${round})` : ""}</p>`];
  for (const g of revGroups(M)) {
    const qs = W.rev.filter(c => (c.round || 1) === round && c.reviewer === g);
    if (!qs.length) continue;
    T.push(g, ""); H.push(`<h3>${esc(g)}</h3>`);
    qs.forEach((c, i) => {
      const k = qLabel(g, i + 1);
      T.push(`${k}: ${c.text}`, `Response: ${c.response || "[작성 필요]"}`);
      H.push(`<p><b>${k}.</b> <i>${esc(c.text)}</i></p>`, `<p><b>Response:</b> ${esc(c.response || "[작성 필요]")}</p>`);
      if (c.where) { T.push(`Changes in the manuscript: ${c.where}`); H.push(`<p><b>Changes in the manuscript:</b> ${esc(c.where)}</p>`); }
      T.push("");
    });
  }
  return { text: T.join("\n").trim() + "\n", html: H.join("\n") };
}
async function copyLetter(p, round) {
  const { text, html } = responseLetter(p, round);
  try {
    if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    else await navigator.clipboard.writeText(text);
    toast("Response letter를 복사했습니다. Word에 붙여넣으세요.");
  } catch (e) { toast("복사하지 못했습니다. '.txt로 받기'를 써 주세요."); }
}

let revFocus = null;             // 새로 추가한 질문 칸에 커서를 둠
function revisionTable(p) {
  const st = (p.paper || {}).stage || "draft", W = revWorkOf(p);
  if (!W.rev.length && !Object.keys(W.meta).length && !["review", "revision"].includes(st)) return null;
  const rounds = revRoundsOf(W);
  const round = revRound.get(p.id) || Math.max(1, ...rounds);
  const shown = Array.from({ length: Math.max(round, ...rounds, 1) }, (_, i) => i + 1);
  const M = revMetaOf(W, round), groups = revGroups(M);
  const inR = W.rev.filter(c => (c.round || 1) === round), nd = inR.filter(c => c.done).length;

  // 저장 상태 표시 (글자를 칠 때마다 다시 그리지 않고 이것만 바꿈)
  const status = h("span", { class: "rv-status" });
  const saveBtn = h("button", { class: "btn", type: "button", onclick: () => save() }, "저장");
  const undoBtn = h("button", { class: "link", type: "button", onclick: () => {
    if (confirm("마지막으로 저장한 상태로 되돌릴까요? 저장하지 않은 변경은 사라집니다.")) { revWork.delete(p.id); render(); } } }, "되돌리기");
  const paint = () => {
    const d = revDirty(W);
    status.className = "rv-status" + (d ? " dirty" : "");
    status.textContent = d ? "● 저장 안 된 변경 있음" : W.savedAt ? `저장됨 · ${fmtWhen(W.savedAt).slice(11)}` : "저장된 상태";
    saveBtn.disabled = !d; undoBtn.style.display = d ? "" : "none";   // .link 은 hidden 속성을 덮어써서 style 로
  };
  const save = () => {
    if (!revDirty(W)) return;
    const rev = W.rev.map(c => ({ ...c })), meta = JSON.parse(JSON.stringify(W.meta)), prev = [W.base, W.savedAt];
    W.base = JSON.stringify({ rev, meta }); W.savedAt = Date.now();      // 먼저 '저장됨'으로 (저장소가 바로 다시 그려도 맞게), 실패하면 되돌림
    render();
    act(store.update(p.id, { rev, revMeta: meta }).then(() => toast("리비전 대응표를 저장했습니다."),
      e => { [W.base, W.savedAt] = prev; render(); throw e; }));
  };
  const change = fn => { fn(); render(); };          // 칸을 늘리거나 지우는 변경 → 다시 그림 (아직 저장 전)
  const setReviewers = n => {
    const lost = W.rev.filter(c => (c.round || 1) === round && c.reviewer !== "Editor" && +c.reviewer.replace(/\D+/g, "") > n);
    if (lost.length && !confirm(`리뷰어를 ${n}명으로 줄이면 Reviewer ${n + 1}부터의 질문 ${lost.length}개도 지웁니다. 계속할까요?`)) return render();
    change(() => { W.rev = W.rev.filter(c => !lost.includes(c)); W.meta[round] = { ...revMetaOf(W, round), reviewers: n }; });
  };
  const setEditor = v => {
    const lost = v ? [] : W.rev.filter(c => (c.round || 1) === round && c.reviewer === "Editor");
    if (lost.length && !confirm(`에디터 질문 ${lost.length}개도 지웁니다. 계속할까요?`)) return render();
    change(() => { W.rev = W.rev.filter(c => !lost.includes(c)); W.meta[round] = { ...revMetaOf(W, round), editor: v }; });
  };
  const addQ = (g, text = "") => { const id = rid(); W.rev.push({ id, round, reviewer: g, text, response: "", where: "", done: false }); return id; };
  const newRound = () => change(() => {
    const r = Math.max(round, ...rounds) + 1;
    W.meta[r] = { reviewers: M.reviewers, editor: false };       // 리뷰어 수는 앞 차수와 같게 시작
    revRound.set(p.id, r);
  });
  const dropRound = () => {
    if (!confirm(`${round}차와 그 안의 질문 ${inR.length}개를 지울까요? (저장해야 반영됩니다)`)) return;
    change(() => { W.rev = W.rev.filter(c => (c.round || 1) !== round); delete W.meta[round]; revRound.set(p.id, Math.max(1, round - 1)); });
  };
  const field = (c, key, label, rows, cls) => h("label", { class: "rv-f" }, h("span", {}, label),
    h(rows ? "textarea" : "input", { class: cls, rows: rows || null, "aria-label": label, dataset: { fk: `rv:${c.id}:${key}` },
      placeholder: key === "where" ? "예: p.5 L120–134, Fig. 3, SI Note 2" : "", value: c[key] || "",
      oninput: e => { c[key] = e.target.value; paint(); } }));

  const group = g => {
    const qs = W.rev.filter(c => (c.round || 1) === round && c.reviewer === g), pk = `rvp:${p.id}:${round}:${g}`;
    return h("section", { class: "rv-group" },
      h("div", { class: "rv-gh" }, h("b", {}, g),
        h("span", { class: "when" }, qs.length ? `질문 ${qs.length} · 대응 완료 ${qs.filter(c => c.done).length}` : "질문 없음")),
      qs.length > 0 && h("ol", { class: "rv-list" }, qs.map((c, i) => h("li", { class: "rv-item" + (c.done ? " done" : "") },
        h("div", { class: "rv-q" },
          h("b", { class: "rv-no" }, qLabel(g, i + 1)),
          h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !!c.done, onchange: e => change(() => { c.done = e.target.checked; }) }), "대응 완료"),
          h("button", { class: "x", type: "button", "aria-label": `${qLabel(g, i + 1)} 지우기`, onclick: () => {
            if ((c.text || c.response) && !confirm(`${qLabel(g, i + 1)}을(를) 지울까요? 뒤 번호는 하나씩 당겨집니다.`)) return;
            change(() => { W.rev = W.rev.filter(x => x !== c); });
          } }, "삭제")),
        field(c, "text", "리뷰어 질문", 2, "rv-text"),
        field(c, "response", "대응 (Response)", 3, "rv-resp"),
        field(c, "where", "수정 위치", 0, "edit rv-where")))),
      h("div", { class: "rv-gadd" },
        h("button", { class: "btn ghost", type: "button", onclick: () => change(() => { revFocus = addQ(g); }) },
          `+ 질문 추가 (${qLabel(g, qs.length + 1)})`),
        h("details", { class: "rv-paste" },
          h("summary", {}, "리뷰 코멘트 통째로 붙여넣기"),
          h("p", { class: "hint" }, `${g}의 코멘트 전체를 붙여넣으면 빈 줄이나 번호(1. / (2) / Comment 3)마다 나눠서 ${qLabel(g, qs.length + 1)}부터 질문으로 넣습니다.`),
          h("textarea", { rows: 4, "aria-label": `${g} 코멘트 붙여넣기`, dataset: { fk: pk }, value: drafts.get(pk) || "", oninput: e => drafts.set(pk, e.target.value) }),
          h("button", { class: "btn ghost", type: "button", onclick: () => {
            const parts = splitComments(drafts.get(pk) || "");
            if (!parts.length) return toast("코멘트를 붙여넣어 주세요.");
            drafts.delete(pk);
            change(() => parts.forEach(t => addQ(g, t)));
            toast(`${g} 질문 ${parts.length}개를 넣었습니다. 확인한 뒤 저장하세요.`);
          } }, "질문으로 나눠 넣기"))));
  };

  if (revFocus) {                                     // 방금 추가한 질문 칸으로 커서
    const id = revFocus; revFocus = null;
    postRender.push(() => { const el = document.querySelector(`[data-fk="rv:${id}:text"]`); if (el) el.focus(); });
  }
  postRender.push(paint);
  return h("div", { class: "revtab", onkeydown: e => { if ((e.ctrlKey || e.metaKey) && (e.key || "").toLowerCase() === "s") { e.preventDefault(); save(); } } },
    h("div", { class: "rv-head" },
      h("b", {}, "리비전 대응표"),
      h("div", { class: "seg" },
        shown.map(r => h("button", { type: "button", "aria-pressed": String(r === round), onclick: () => { revRound.set(p.id, r); render(); } }, `${r}차`)),
        h("button", { type: "button", title: "다음 차수 리비전 시작", onclick: newRound }, "+")),
      h("span", { class: "rv-save" }, status, undoBtn, saveBtn)),
    h("div", { class: "rv-tools" },
      h("label", {}, "리뷰어 수 ", h("select", { "aria-label": "리뷰어 수", onchange: e => setReviewers(+e.target.value) },
        [1, 2, 3, 4, 5, 6].map(n => h("option", { value: String(n), selected: n === M.reviewers }, `${n}명`)))),
      h("label", { class: "chk" }, h("input", { type: "checkbox", checked: M.editor, onchange: e => setEditor(e.target.checked) }), "에디터 코멘트도 있음"),
      inR.length > 0 && h("span", { class: "when" }, `대응 완료 ${nd}/${inR.length}`),
      inR.length > 0 && bar(nd, inR.length),
      round > 1 && h("button", { class: "link rv-drop", type: "button", onclick: dropRound }, `${round}차 지우기`)),
    groups.map(group),
    h("div", { class: "rp-actions" },
      inR.length > 0 && h("button", { class: "btn ghost", type: "button", onclick: () => copyLetter(p, round) }, "Response letter 복사"),
      inR.length > 0 && h("button", { class: "btn ghost", type: "button",
        onclick: () => download(`response-${round}-${ymd(new Date())}.txt`, responseLetter(p, round).text, "text/plain") }, ".txt로 받기"),
      h("span", { class: "hint" }, "고친 내용은 '저장'(Ctrl+S)을 눌러야 저장됩니다.")));
}
