"use strict";
/* ------------------------------------------------------------------ 생각: 수집함 + 아이디어 보드
 * 수집함: 떠오른 생각을 어디서든 Ctrl+K(맥은 ⌘K)나 오른쪽 위 전구 버튼으로 적어 두고,
 *   나중에 오늘 할 일·이번 주 목표·아이디어·미팅 안건·문헌으로 옮기거나 버림.
 *   항목: kind "note", title(첫 줄), body(나머지 줄)
 * 아이디어: kind "idea", idea: { stage, body, refs:[문헌 id], papers:[원고 id] }, parent = 마일스톤
 */
const IDEA_STAGES = [["seed", "씨앗"], ["explore", "검토 중"], ["active", "진행"], ["parked", "보류"]];
const ideaStageName = k => (IDEA_STAGES.find(s => s[0] === k) || IDEA_STAGES[0])[1];
let ideaSel = null;              // 보드에서 펼쳐 본 아이디어
let ideaDrag = null;             // 끌고 있는 카드

const fresh = () => ({ done: false, doneAt: null, comments: [], created: Date.now() });
const splitText = text => {
  const [first, ...rest] = text.trim().split(/\r?\n/);
  return { title: first.trim(), body: rest.join("\n").trim() };
};
const newIdea = (title, body) => ({ ...fresh(), kind: "idea", title, period: "", parent: "",
  idea: { stage: "seed", body: body || "", refs: [], papers: [] }, stageLog: [{ stage: "seed", at: Date.now() }] });

// 수집함 메모를 목표로 옮김: 둘째 줄부터의 내용과 코멘트는 새 항목의 코멘트로
function moveNote(n, data, msg) {
  const comments = (n.comments || []).slice();
  if (n.body) comments.unshift({ id: rid(), text: n.body, at: n.created || Date.now() });
  act(store.add({ ...fresh(), title: n.title, period: "", parent: "", ...data, comments, attachments: n.attachments || [] })
    .then(() => store.remove(n.id)).then(() => toast(msg)));
}
function noteToIdea(n) {
  act(store.update(n.id, { kind: "idea", idea: { stage: "seed", body: n.body || "", refs: [], papers: [] }, stageLog: [{ stage: "seed", at: Date.now() }] })
    .then(() => toast("아이디어 보드의 '씨앗'에 넣었습니다.")));
}
const noteLine = n => n.title + (n.body ? " — " + n.body.replace(/\s*\n\s*/g, " ") : "");

/* ---------- 빠른 메모 창 ---------- */
let captureDlg = null;
const CAPTURE_TO = [["inbox", "수집함"], ["today", "오늘 할 일"], ["idea", "아이디어"], ["agenda", "다음 미팅 안건"]];
function openCapture() {
  if (state !== "ready") return toast("로그인한 뒤에 쓸 수 있습니다.");
  if (captureDlg) { captureDlg.querySelector("textarea").focus(); return; }
  if (document.querySelector("dialog[open]")) return;        // 다른 창이 열려 있으면 그대로 둠
  let dest = "inbox";
  const dlg = h("dialog", { class: "dlg capture", "aria-label": "빠른 메모" });
  captureDlg = dlg;
  const cleanup = () => { dlg.remove(); if (captureDlg === dlg) captureDlg = null; };
  const close = () => { dlg.close(); cleanup(); };
  const save = () => {
    const text = ta.value.trim();
    if (!text) return;
    close();
    const { title, body } = splitText(text);
    if (dest === "inbox")
      act(store.add({ ...fresh(), kind: "note", title, body, period: "", parent: "" }).then(() => toast("수집함에 넣었습니다.")));
    else if (dest === "today")
      act(store.add({ ...fresh(), kind: "day", title, period: ymd(new Date()), parent: "",
        comments: body ? [{ id: rid(), text: body, at: Date.now() }] : [] }).then(() => toast("오늘 할 일에 넣었습니다.")));
    else if (dest === "idea")
      act(store.add(newIdea(title, body)).then(() => toast("아이디어 보드의 '씨앗'에 넣었습니다.")));
    else addToAgenda(title + (body ? " — " + body.replace(/\s*\n\s*/g, " ") : ""));
  };
  const ta = h("textarea", { rows: 3, placeholder: "떠오른 생각, 할 일, 물어볼 것…", "aria-label": "메모",
    onkeydown: e => { if (!typing(e) && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } } });
  const seg = h("div", { class: "seg chips" });
  const drawSeg = () => seg.replaceChildren(...CAPTURE_TO.map(([k, l]) =>
    h("button", { type: "button", "aria-pressed": String(dest === k), onclick: () => { dest = k; drawSeg(); ta.focus(); } }, l)));
  drawSeg();
  dlg.addEventListener("close", cleanup);
  dlg.append(
    h("h3", {}, "빠른 메모"),
    ta,
    h("div", { class: "cap-row" }, h("span", { class: "cap-k" }, "넣을 곳"), seg),
    h("div", { class: "dlg-actions" },
      h("span", { class: "hint" }, "Enter 저장 · Shift+Enter 줄바꿈 · Esc 닫기"),
      h("button", { class: "btn ghost", type: "button", onclick: close }, "닫기"),
      h("button", { class: "btn", type: "button", onclick: save }, "저장")));
  document.body.append(dlg);
  dlg.showModal();
  ta.focus();
}
// 한글 입력 상태에서도 되도록 글자 대신 키 위치(KeyK)로 확인
addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === "KeyK" || (e.key || "").toLowerCase() === "k")) {
    e.preventDefault(); openCapture();
  }
});

/* ---------- 아이디어 ---------- */
function setIdeaStage(it, stage) {
  const cur = byId.get(it.id) || it, I = cur.idea || {};
  if ((I.stage || "seed") === stage) return;
  act(store.update(it.id, { idea: { ...I, stage }, stageLog: [...(cur.stageLog || []), { stage, at: Date.now() }] }));
}
function ideaToMilestone(it) {
  if (!confirm(`"${it.title}"을(를) 마일스톤으로 만들까요?\n아이디어는 '진행'으로 옮기고 새 마일스톤에 연결합니다.`)) return;
  act(store.add({ ...fresh(), kind: "milestone", title: it.title, period: "", parent: "", start: ymd(new Date()), end: "" }).then(r => {
    const cur = byId.get(it.id) || it, I = cur.idea || {};
    return store.update(it.id, { parent: r.id, idea: { ...I, stage: "active" }, stageLog: [...(cur.stageLog || []), { stage: "active", at: Date.now() }] });
  }).then(() => toast("마일스톤을 만들었습니다. 왼쪽 목록에서 마감일을 정해 주세요.")));
}
function ideaToPaper(it) {
  if (!confirm(`"${it.title}"(으)로 원고(작성 중)를 만들까요?`)) return;
  act(store.add({ ...fresh(), kind: "paper", title: it.title, period: "", parent: it.parent || "",
    paper: { stage: "draft", journal: "", role: "1저자", submitted: "", authors: "" }, stageLog: [{ stage: "draft", at: Date.now() }] }).then(r => {
    const cur = byId.get(it.id) || it, I = cur.idea || {};
    return store.update(it.id, { idea: { ...I, papers: [...(I.papers || []), r.id] } });
  }).then(() => toast("원고 탭에 '작성 중'으로 만들었습니다.")));
}

function viewThoughts() {
  const notes = items.filter(i => i.kind === "note").sort((a, b) => (b.created || 0) - (a.created || 0));
  const ideas = items.filter(i => i.kind === "idea");
  const stageOf = i => (i.idea || {}).stage || "seed";
  const sel = ideaSel && byId.get(ideaSel);
  if (!sel || sel.kind !== "idea") ideaSel = null;
  return h("div", {},
    h("section", {},
      h("h2", {}, `수집함 ${notes.length}`),
      adder("an", "+ 떠오른 생각 적기 (Enter) · 어느 탭에서든 Ctrl+K", () => ({ kind: "note", period: "", parent: "", body: "" })),
      notes.length ? h("ul", { class: "inbox" }, notes.map(noteRow))
                   : h("p", { class: "empty" }, "비어 있습니다. 정리할 것이 없어요.")),
    h("section", {},
      h("h2", {}, `아이디어 ${ideas.length}`),
      adder("ai", "+ 아이디어 추가 (Enter) → 씨앗", () => newIdea("", "")),
      h("div", { class: "board" }, IDEA_STAGES.map(([k, label]) => {
        const list = ideas.filter(i => stageOf(i) === k).sort((a, b) => (b.created || 0) - (a.created || 0));
        return h("div", { class: `bcol is-${k}`, dataset: { stage: k },
            ondragover: e => { if (ideaDrag) { e.preventDefault(); e.currentTarget.classList.add("over"); } },
            ondragleave: e => e.currentTarget.classList.remove("over"),
            ondrop: e => {
              e.preventDefault(); e.currentTarget.classList.remove("over");
              const it = ideaDrag && byId.get(ideaDrag); ideaDrag = null;
              if (it) setIdeaStage(it, k);
            } },
          h("div", { class: "bh" }, h("span", {}, label), h("span", {}, String(list.length))),
          list.length ? list.map(ideaCard) : h("p", { class: "bempty" }, k === "seed" ? "새 아이디어가 여기로 들어옵니다" : "—"));
      })),
      ideaSel && ideaPanel(sel),
      h("p", { class: "hint" }, "카드를 끌거나 ‹ › 로 단계를 옮기고, 제목을 누르면 내용·관련 문헌·원고·마일스톤을 적을 수 있습니다.")));
}

function noteRow(n) {
  const doi = doiOf(n.title + " " + (n.body || ""));
  const b = (label, fn, cls) => h("button", { type: "button", class: "nb" + (cls ? " " + cls : ""), onclick: fn }, label);
  return h("li", { class: "note", dataset: { id: n.id } },
    h("div", { class: "nt" },
      h("p", {}, linkify(n.title)),
      n.body && h("p", { class: "nbody" }, linkify(n.body)),
      h("time", { class: "when", datetime: new Date(n.created || Date.now()).toISOString() }, fmtWhen(n.created || Date.now()))),
    h("div", { class: "nacts", role: "group", "aria-label": "옮길 곳" },
      b("오늘 할 일", () => moveNote(n, { kind: "day", period: ymd(new Date()) }, "오늘 할 일로 옮겼습니다.")),
      b("이번 주 목표", () => moveNote(n, { kind: "week", period: ymd(mondayOf(new Date())) }, "이번 주 목표로 옮겼습니다.")),
      b("아이디어", () => noteToIdea(n)),
      b("미팅 안건", () => addToAgenda(noteLine(n), n.id)),
      doi && b("문헌", async () => { if (await addRef(doi)) act(store.remove(n.id)); }),
      b("버리기", () => moveToTrash([n.id], "메모를 버렸습니다."), "drop")));
}

function ideaCard(it) {
  const I = it.idea || {}, st = I.stage || "seed", i = Math.max(0, IDEA_STAGES.findIndex(s => s[0] === st));
  const nR = (I.refs || []).filter(id => byId.has(id)).length, nP = (I.papers || []).filter(id => byId.has(id)).length;
  const nC = (it.comments || []).length, ms = it.parent && byId.get(it.parent);
  return h("div", { class: "icard" + (ideaSel === it.id ? " sel" : ""), draggable: "true", dataset: { id: it.id },
      ondragstart: e => { ideaDrag = it.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", it.title); },
      ondragend: () => { ideaDrag = null; } },
    h("button", { class: "ic-title", type: "button", "aria-expanded": String(ideaSel === it.id),
                  onclick: () => { ideaSel = ideaSel === it.id ? null : it.id; render(); } }, it.title || "(제목 없음)"),
    I.body && h("p", { class: "ic-body" }, I.body),
    h("div", { class: "ic-meta" },
      ms && h("span", { class: "chip", title: ms.title }, "↳ " + ms.title),
      nR > 0 && h("span", {}, `문헌 ${nR}`),
      nP > 0 && h("span", {}, `원고 ${nP}`),
      nC > 0 && h("span", {}, `코멘트 ${nC}`),
      h("span", { class: "pr-step" },
        h("button", { type: "button", disabled: i === 0, "aria-label": "이전 단계로", onclick: () => setIdeaStage(it, IDEA_STAGES[i - 1][0]) }, "‹"),
        h("button", { type: "button", disabled: i === IDEA_STAGES.length - 1, "aria-label": "다음 단계로", onclick: () => setIdeaStage(it, IDEA_STAGES[i + 1][0]) }, "›"))));
}

function ideaPanel(it) {
  const st = (it.idea || {}).stage || "seed";
  return h("section", { class: "ipanel", dataset: { id: it.id } },
    h("div", { class: "pd-head" },
      h("div", { class: "seg" }, IDEA_STAGES.map(([k, l]) =>
        h("button", { type: "button", "aria-pressed": String(st === k), onclick: () => setIdeaStage(it, k) }, l))),
      h("button", { class: "link", type: "button", onclick: () => { ideaSel = null; render(); } }, "닫기")),
    detail(it, { idea: true, parents: milestoneOptions(it) }));
}

function ideaFields(it) {
  const I = it.idea || {};
  const set = patch => act(store.update(it.id, { idea: { ...((byId.get(it.id) || it).idea || {}), ...patch } }));
  const linkRow = (label, field, all, empty) => {
    const ids = I[field] || [], list = ids.map(id => byId.get(id)).filter(Boolean);
    const rest = all.filter(x => !ids.includes(x.id));
    return h("div", { class: "linked" },
      h("span", { class: "lk" }, label),
      list.map(x => h("span", { class: "chip lchip" },
        h("button", { type: "button", title: x.title, onclick: () => goTo(x) }, x.title),
        h("button", { type: "button", class: "x", "aria-label": `${x.title} 연결 끊기`, onclick: () => set({ [field]: ids.filter(id => id !== x.id) }) }, "×"))),
      all.length
        ? rest.length > 0 && h("select", { "aria-label": label + " 연결",
            onchange: e => { const v = e.target.value; if (v) set({ [field]: [...ids, v] }); } },
            h("option", { value: "" }, "+ 연결"),
            rest.map(x => h("option", { value: x.id }, x.title)))
        : h("span", { class: "when" }, empty));
  };
  return [
    h("label", { class: "rv" }, h("span", {}, "내용 · 가설 · 왜 해볼 만한가"),
      textInput("ib:" + it.id, I.body, v => set({ body: v }), { rows: 4, placeholder: "핵심 질문, 근거가 된 관찰, 필요한 실험… (Ctrl+Enter로 저장)", "aria-label": "아이디어 내용" })),
    linkRow("관련 문헌", "refs", items.filter(i => i.kind === "ref").sort((a, b) => (b.created || 0) - (a.created || 0)), "문헌 탭에 논문을 넣으면 연결할 수 있습니다"),
    linkRow("관련 원고", "papers", items.filter(i => i.kind === "paper").sort(byCreated), "원고가 없습니다"),
    h("div", { class: "rp-actions" },
      !it.parent && h("button", { class: "btn ghost", type: "button", onclick: () => ideaToMilestone(it) }, "마일스톤으로 만들기"),
      h("button", { class: "btn ghost", type: "button", onclick: () => ideaToPaper(it) }, "원고로 만들기"))
  ];
}

// 마일스톤·원고·문헌을 펼쳤을 때 이어진 아이디어
function linkedIdeas(it) {
  if (!["milestone", "paper", "ref"].includes(it.kind)) return null;
  const list = items.filter(i => i.kind === "idea" && (i.parent === it.id
    || ((i.idea || {}).refs || []).includes(it.id) || ((i.idea || {}).papers || []).includes(it.id)));
  if (!list.length) return null;
  return h("div", { class: "linked" },
    h("span", { class: "lk" }, `아이디어 ${list.length}`),
    list.map(i => h("button", { type: "button", class: "chip", onclick: () => goTo(i) }, i.title)));
}
