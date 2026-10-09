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
      stageLog: [{ stage: f.stage, at: now }], done, doneAt: null, due: "",
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
      h("select", { onchange: e => { const x = cvPubs[+e.target.value]; if (x) fillFromCv(p, x); } },
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
 * 원고(paper)의 rev: [{ id, round, reviewer, text, response, where, done }]
 *   round: 1차·2차… 리비전,  reviewer: "Editor" | "Reviewer 1" …
 * 리뷰어 코멘트를 붙여넣으면 빈 줄·번호 기준으로 나눠 한 줄씩 대응을 적고,
 * 다 적으면 Response letter 로 복사(Word 에 붙이면 굵게·기울임이 살아 있음)하거나 .txt 로 받음.
 */
const REVIEWERS = ["Editor", "Reviewer 1", "Reviewer 2", "Reviewer 3", "Reviewer 4"];
const revRound = new Map();      // 원고 id → 보고 있는 차수
const revOf = p => (byId.get(p.id) || p).rev || [];
const revRounds = p => [...new Set(revOf(p).map(c => c.round || 1))].sort((a, b) => a - b);
const curRound = p => revRound.get(p.id) || Math.max(1, ...revRounds(p));
const revOrder = (a, b) => REVIEWERS.indexOf(a.reviewer) - REVIEWERS.indexOf(b.reviewer);
function setRev(p, fn) { return act(store.update(p.id, { rev: fn(revOf(p)) })); }

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
  // 앞에 붙은 번호는 떼어 냄 (Response letter 에서 Comment 1.2 처럼 다시 매김)
  return parts.map(s => s.trim().replace(/^(\(?\d+[.)]|comment\s*\d+\s*[.:)]?|q\s*\d+\s*[.:)]?|[-•*])\s*/i, "").trim()).filter(Boolean);
}

// 리뷰어별 번호 (Reviewer 1 의 세 번째 코멘트 → "1.3", Editor → "E.2")
function revNumbers(list) {
  const n = new Map(), out = new Map();
  for (const c of list.slice().sort(revOrder)) {
    const k = (n.get(c.reviewer) || 0) + 1; n.set(c.reviewer, k);
    out.set(c.id, `${c.reviewer === "Editor" ? "E" : c.reviewer.replace(/\D+/g, "")}.${k}`);
  }
  return out;
}

function responseLetter(p, round) {
  const list = revOf(p).filter(c => (c.round || 1) === round).sort(revOrder);
  const num = revNumbers(list), J = (p.paper || {}).journal;
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const T = [`Response to Reviewers`, `"${p.title}"${J ? ` — ${J}` : ""}${round > 1 ? ` (Revision ${round})` : ""}`, ""];
  const H = [`<h2>Response to Reviewers</h2>`, `<p><i>${esc(p.title)}</i>${J ? ` — ${esc(J)}` : ""}${round > 1 ? ` (Revision ${round})` : ""}</p>`];
  let who = "";
  for (const c of list) {
    if (c.reviewer !== who) {
      who = c.reviewer;
      T.push(who === "Editor" ? "Editor" : who, "");
      H.push(`<h3>${esc(who)}</h3>`);
    }
    const k = num.get(c.id);
    T.push(`Comment ${k}: ${c.text}`, `Response: ${c.response || "[작성 필요]"}`);
    H.push(`<p><b>Comment ${k}.</b> <i>${esc(c.text)}</i></p>`, `<p><b>Response:</b> ${esc(c.response || "[작성 필요]")}</p>`);
    if (c.where) { T.push(`Changes in the manuscript: ${c.where}`); H.push(`<p><b>Changes in the manuscript:</b> ${esc(c.where)}</p>`); }
    T.push("");
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

function revisionTable(p) {
  const st = (p.paper || {}).stage || "draft", all = revOf(p);
  if (!all.length && !["review", "revision"].includes(st)) return null;
  const round = curRound(p), rounds = revRounds(p);
  const list = all.filter(c => (c.round || 1) === round).sort(revOrder);
  const num = revNumbers(list), nd = list.filter(c => c.done).length;
  const pk = "rvp:" + p.id, rk = "rvr:" + p.id;
  const defReviewer = list.length ? list[list.length - 1].reviewer : "Reviewer 1";
  const reviewer = drafts.get(rk) || defReviewer;
  const addPasted = () => {
    const parts = splitComments(drafts.get(pk) || "");
    if (!parts.length) return toast("리뷰어 코멘트를 붙여넣어 주세요.");
    const reviewer = drafts.get(rk) || defReviewer;
    drafts.delete(pk);
    setRev(p, cur => [...cur, ...parts.map(text => ({ id: rid(), round, reviewer, text, response: "", where: "", done: false }))])
      .then(() => toast(`${reviewer} 코멘트 ${parts.length}개를 나눠 넣었습니다.`));
  };
  const patch = (c, v) => setRev(p, cur => cur.map(x => x.id === c.id ? { ...x, ...v } : x));
  return h("div", { class: "revtab" },
    h("div", { class: "rv-head" },
      h("b", {}, "리비전 대응표"),
      h("div", { class: "seg" },
        rounds.concat(rounds.includes(round) ? [] : [round]).map(r => h("button", { type: "button", "aria-pressed": String(r === round),
          onclick: () => { revRound.set(p.id, r); render(); } }, `${r}차`)),
        h("button", { type: "button", title: "다음 차수 리비전 시작", onclick: () => { revRound.set(p.id, Math.max(round, ...rounds) + 1); render(); } }, "+")),
      list.length > 0 && h("span", { class: "when" }, `대응 ${nd}/${list.length}`),
      list.length > 0 && bar(nd, list.length)),
    list.length > 0 && h("ol", { class: "rv-list" }, list.map(c => h("li", { class: "rv-item" + (c.done ? " done" : "") },
      h("div", { class: "rv-q" },
        h("span", { class: "kind" }, num.get(c.id)),
        h("select", { "aria-label": "리뷰어", onchange: e => patch(c, { reviewer: e.target.value }) },
          REVIEWERS.map(r => h("option", { value: r, selected: c.reviewer === r }, r))),
        h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !!c.done, onchange: e => patch(c, { done: e.target.checked }) }), "완료"),
        h("button", { class: "x", type: "button", "aria-label": "코멘트 삭제", onclick: () => {
          if (confirm("이 코멘트와 대응을 지울까요?")) setRev(p, cur => cur.filter(x => x.id !== c.id));
        } }, "삭제")),
      textInput(`rvt:${c.id}`, c.text, v => patch(c, { text: v }), { class: "rv-text", rows: 2, "aria-label": "리뷰어 코멘트" }),
      textInput(`rvs:${c.id}`, c.response, v => patch(c, { response: v }), { class: "rv-resp", rows: 3, placeholder: "대응 (Response) · Ctrl+Enter로 저장", "aria-label": "대응" }),
      textInput(`rvw:${c.id}`, c.where, v => patch(c, { where: v }), { class: "edit rv-where", placeholder: "수정 위치 (예: p.5 L120–134, Fig. 3, SI Note 2)", "aria-label": "수정 위치" })))),
    h("div", { class: "rv-add" },
      h("div", { class: "rv-q" },
        h("span", { class: "lk" }, `${round}차 코멘트 붙여넣기`),
        h("select", { "aria-label": "어느 리뷰어의 코멘트인지", onchange: e => { drafts.set(rk, e.target.value); } },
          REVIEWERS.map(r => h("option", { value: r, selected: reviewer === r }, r)))),
      h("textarea", { rows: 4, class: "rv-paste", placeholder: "리뷰어 코멘트 전체를 붙여넣으면 빈 줄이나 번호(1. / (2) / Comment 3)마다 나눠서 넣습니다.",
        "aria-label": "리뷰어 코멘트 붙여넣기", dataset: { fk: pk }, value: drafts.get(pk) || "",
        oninput: e => drafts.set(pk, e.target.value),
        onkeydown: e => { if (!typing(e) && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addPasted(); } } }),
      h("div", { class: "rp-actions" },
        h("button", { class: "btn ghost", type: "button", onclick: addPasted }, "나눠서 넣기"),
        list.length > 0 && h("button", { class: "btn", type: "button", onclick: () => copyLetter(p, round) }, "Response letter 복사"),
        list.length > 0 && h("button", { class: "btn ghost", type: "button",
          onclick: () => download(`response-${round}-${ymd(new Date())}.txt`, responseLetter(p, round).text, "text/plain") }, ".txt로 받기"))));
}
