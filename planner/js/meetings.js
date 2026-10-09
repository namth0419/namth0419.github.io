"use strict";
/* ------------------------------------------------------------------ 미팅 노트
 * kind "meeting", period = 날짜 (비어 있으면 날짜 미정),
 * meeting: { with, agenda, notes, decisions, actions: [{ id, text, goal, done }] }
 * 할 일을 적으면 고른 곳(이번 주·다음 주 주간 목표, 특정 날 일간 목표)에 목표가 바로 생기고 { from: 미팅 id } 로 이어짐.
 * 할 일의 완료 여부는 연결된 목표를 따라감 (목표를 지웠으면 할 일 자체에 체크).
 * 같은 이름의 미팅끼리 이어져서, 미팅을 열면 지난번 할 일이 위에 보임.
 */
const MEET_DEST = [["week", "이번 주 목표로"], ["nextweek", "다음 주 목표로"], ["day", "일간 목표로 (날짜)"], ["none", "목표 안 만듦"]];
let meetDest = "week";
const meetings = () => items.filter(i => i.kind === "meeting");
const meetingTitles = () => [...new Set(meetings().sort((a, b) => (b.created || 0) - (a.created || 0)).map(i => i.title))];
const lastWith = title => ((meetings().filter(i => i.title === title).sort((a, b) => (b.created || 0) - (a.created || 0))[0] || {}).meeting || {}).with || "";
const actionGoal = a => a.goal && byId.get(a.goal);
const actionDone = a => { const g = actionGoal(a); return g ? !!g.done : !!a.done; };
const meetWhen = m => m.period ? `${shortYmd(m.period)} (${WD[parseYmd(m.period).getDay()]})` : "날짜 미정";

// 가장 가까운 예정 미팅 (날짜 미정 포함)
function nextMeeting() {
  const td = ymd(new Date());
  return meetings().filter(i => !i.period || i.period >= td)
                   .sort((a, b) => (a.period || "9999") < (b.period || "9999") ? -1 : (a.period || "9999") > (b.period || "9999") ? 1 : byCreated(a, b))[0];
}
// 같은 이름의 바로 전 미팅
function prevMeeting(m) {
  const before = i => i.id !== m.id && i.title === m.title && i.period
    && (!m.period || i.period < m.period || (i.period === m.period && (i.created || 0) < (m.created || 0)));
  return meetings().filter(before).sort((a, b) => a.period < b.period ? 1 : a.period > b.period ? -1 : (b.created || 0) - (a.created || 0))[0] || null;
}
function addToAgenda(text, noteId) {
  const line = "- " + text.trim();
  const m = nextMeeting();
  let p;
  if (m) {
    const M = m.meeting || {};
    p = store.update(m.id, { meeting: { ...M, agenda: (M.agenda ? M.agenda.replace(/\s+$/, "") + "\n" : "") + line } });
  } else {
    const title = meetingTitles()[0] || "지도교수 미팅";
    p = store.add({ ...fresh(), kind: "meeting", title, period: "", parent: "",
      meeting: { with: lastWith(title), agenda: line, notes: "", decisions: "", actions: [] } });
  }
  const where = m ? `${m.title} (${meetWhen(m)})` : "새 미팅 (날짜 미정)";
  return act(p.then(() => noteId && store.remove(noteId)).then(() => toast(`${where} 안건에 넣었습니다.`)));
}

function patchActions(m, fn) {
  const cur = byId.get(m.id) || m, M = cur.meeting || {};
  return store.update(m.id, { meeting: { ...M, actions: fn(M.actions || []) } });
}
async function addAction(m, text, dest, date) {
  let goal = "";
  if (dest !== "none") {
    const t = new Date();
    const data = dest === "day" ? { kind: "day", period: date || ymd(t) }
                                : { kind: "week", period: ymd(addDays(mondayOf(t), dest === "nextweek" ? 7 : 0)) };
    goal = (await store.add({ ...fresh(), title: text, parent: "", from: m.id, ...data })).id;
  }
  await patchActions(m, list => [...list, { id: rid(), text, goal, done: false }]);
}
function setActionDone(m, a, v) {
  const g = actionGoal(a);
  if (g) return act(store.update(g.id, { done: v, doneAt: v ? Date.now() : null }));
  act(patchActions(m, list => list.map(x => x.id === a.id ? { ...x, done: v } : x)));
}
function actionToGoal(m, a) {
  act(store.add({ ...fresh(), kind: "week", title: a.text, period: ymd(mondayOf(new Date())), parent: "", from: m.id, done: !!a.done })
    .then(r => patchActions(m, list => list.map(x => x.id === a.id ? { ...x, goal: r.id } : x)))
    .then(() => toast("이번 주 목표에 넣었습니다.")));
}
function removeAction(m, a) {
  const g = actionGoal(a);
  if (!confirm(`할 일 "${a.text}"을(를) 지울까요?` + (g ? "\n이미 만든 목표는 그대로 남습니다." : ""))) return;
  act(patchActions(m, list => list.filter(x => x.id !== a.id)));
}

function actRow(m, a, o = {}) {
  const g = actionGoal(a), done = actionDone(a);
  return h("li", { class: done ? "done" : "" },
    h("input", { type: "checkbox", checked: done, "aria-label": a.text, onchange: e => setActionDone(m, a, e.target.checked) }),
    h("span", {}, a.text),
    o.withMeeting && h("button", { type: "button", class: "chip", title: "미팅 노트 열기", onclick: () => goTo(m) }, `${m.title} · ${meetWhen(m)}`),
    g ? h("button", { type: "button", class: "chip", title: g.title, onclick: () => goTo(g) },
          g.kind === "week" ? `→ 주간 W${pad(isoWeek(parseYmd(g.period)))}` : `→ 일간 ${shortYmd(g.period)}`)
      : !o.readonly && h("button", { type: "button", class: "mini", onclick: () => actionToGoal(m, a) }, "→ 이번 주 목표로"),
    !o.readonly && h("button", { class: "x", type: "button", "aria-label": "할 일 삭제", onclick: () => removeAction(m, a) }, "삭제"));
}

function meetingMarkdown(m) {
  const M = m.meeting || {};
  const L = [`# ${m.title} · ${m.period || "날짜 미정"}`];
  if (M.with) L.push(`참석: ${M.with}`);
  L.push("");
  const sec = (t, v) => { if (v && v.trim()) L.push(`## ${t}`, v.trim(), ""); };
  sec("안건", M.agenda); sec("논의", M.notes); sec("결정 사항", M.decisions);
  const acts = M.actions || [];
  if (acts.length) L.push("## 할 일", ...acts.map(a => `- [${actionDone(a) ? "x" : " "}] ${a.text}`), "");
  return L.join("\n").trim();
}

function meetingFields(m) {
  const M = m.meeting || {}, acts = M.actions || [];
  const set = patch => act(store.update(m.id, { meeting: { ...((byId.get(m.id) || m).meeting || {}), ...patch } }));
  const prev = prevMeeting(m), pActs = prev ? (prev.meeting || {}).actions || [] : [];
  const box = (f, label, ph, rows = 3) => h("label", { class: "rv" }, h("span", {}, label),
    textInput(`mt:${m.id}:${f}`, M[f], v => set({ [f]: v }), { rows, placeholder: ph + " (Ctrl+Enter로 저장)", "aria-label": label }));
  const fk = "ma:" + m.id, dk = "mad:" + m.id;
  const addNow = () => {
    const text = (drafts.get(fk) || "").trim();
    if (!text) return;
    drafts.delete(fk);
    act(addAction(m, text, meetDest, drafts.get(dk) || ymd(new Date())));
  };
  return [
    h("div", { class: "fields" },
      h("label", {}, "날짜", h("input", { type: "date", value: m.period || "",
        onchange: e => { const v = e.target.value; if (v && v < "1900") return; act(store.update(m.id, { period: v || "" })); } })),
      h("label", {}, "참석", textInput("mw:" + m.id, M.with, v => set({ with: v }), { class: "edit sm", placeholder: "예: 지도교수, 김OO", "aria-label": "참석자" }))),
    pActs.length > 0 && h("div", { class: "checks prevact" },
      h("span", { class: "lk" }, `지난 미팅 할 일 · ${meetWhen(prev)} · ${pActs.filter(actionDone).length}/${pActs.length} 완료`),
      h("ul", {}, pActs.map(a => actRow(prev, a, { readonly: true })))),
    box("agenda", "안건", "- 물어볼 것, 보여줄 데이터"),
    box("notes", "논의 메모", "받은 피드백, 교수님 코멘트", 4),
    box("decisions", "결정 사항", "- 이렇게 하기로 함"),
    h("div", { class: "checks macts" },
      h("span", { class: "lk" }, `할 일 ${acts.filter(actionDone).length}/${acts.length}`),
      acts.length > 0 && h("ul", {}, acts.map(a => actRow(m, a))),
      h("div", { class: "ma-add" },
        h("input", { class: "add small", placeholder: "+ 할 일 (Enter)", "aria-label": "할 일 추가", dataset: { fk }, value: drafts.get(fk) || "",
          oninput: e => drafts.set(fk, e.target.value),
          onkeydown: e => { if (!typing(e) && e.key === "Enter") { e.preventDefault(); addNow(); } } }),
        h("select", { "aria-label": "할 일을 넣을 곳", onchange: e => { meetDest = e.target.value; render(); } },
          MEET_DEST.map(([v, l]) => h("option", { value: v, selected: meetDest === v }, l))),
        meetDest === "day" && h("input", { type: "date", "aria-label": "일간 목표 날짜", value: drafts.get(dk) || ymd(new Date()),
          onchange: e => { if (e.target.value >= "1900") drafts.set(dk, e.target.value); } }),
        h("button", { class: "btn ghost", type: "button", onclick: addNow }, "추가"))),
    h("div", { class: "rp-actions" },
      h("button", { class: "btn ghost", type: "button", onclick: () => navigator.clipboard.writeText(meetingMarkdown(m))
        .then(() => toast("미팅 노트를 복사했습니다."), () => toast("복사하지 못했습니다.")) }, "노트 복사 (Markdown)"),
      h("span", { class: "hint" }, "메일이나 메신저로 정리본을 보낼 때"))
  ];
}

function viewMeetings() {
  const td = ymd(new Date()), all = meetings(), titles = meetingTitles();
  const upcoming = all.filter(i => !i.period || i.period >= td)
                      .sort((a, b) => (a.period || "9999") < (b.period || "9999") ? -1 : (a.period || "9999") > (b.period || "9999") ? 1 : byCreated(a, b));
  const past = all.filter(i => i.period && i.period < td).sort((a, b) => a.period < b.period ? 1 : a.period > b.period ? -1 : (b.created || 0) - (a.created || 0));
  const date = drafts.get("mnew:date") || td;
  const create = () => {
    const title = (drafts.get("mnew:title") || "").trim() || titles[0] || "지도교수 미팅";
    const period = drafts.get("mnew:date") || td;
    drafts.delete("mnew:title");
    act(store.add({ ...fresh(), kind: "meeting", title, period, parent: "",
      meeting: { with: lastWith(title), agenda: "", notes: "", decisions: "", actions: [] } }).then(r => { openIds.add(r.id); render(); }));
  };
  const open = all.flatMap(m => ((m.meeting || {}).actions || []).filter(a => !actionDone(a)).map(a => ({ m, a })))
                  .sort((x, y) => (x.m.period || "9999") < (y.m.period || "9999") ? -1 : 1);
  const row = m => {
    const isOpen = openIds.has(m.id), M = m.meeting || {}, acts = M.actions || [];
    return h("li", { class: "item mrow" + (isOpen ? " open" : ""), dataset: { id: m.id } },
      h("button", { class: "sline", type: "button", "aria-expanded": String(isOpen), onclick: () => toggleOpen(m.id) },
        h("span", { class: "when" }, meetWhen(m)),
        h("b", {}, m.title),
        m.period === td && h("span", { class: "badge" }, "오늘"),
        h("span", { class: "sp" }, M.with || ""),
        acts.length > 0 && h("span", { class: "when" }, `할 일 ${acts.filter(actionDone).length}/${acts.length}`)),
      isOpen && detail(m, { meeting: true }));
  };
  return h("div", {},
    h("section", { class: "lab-form" },
      h("h2", {}, "새 미팅"),
      h("div", { class: "lf-row" },
        h("input", { type: "date", value: date, "aria-label": "미팅 날짜", onchange: e => { if (e.target.value >= "1900") drafts.set("mnew:date", e.target.value); } }),
        h("input", { class: "edit", list: "meet-titles", placeholder: titles[0] || "지도교수 미팅", "aria-label": "미팅 이름",
          dataset: { fk: "mnew:title" }, value: drafts.get("mnew:title") || "",
          oninput: e => drafts.set("mnew:title", e.target.value),
          onkeydown: e => { if (!typing(e) && e.key === "Enter") { e.preventDefault(); create(); } } }),
        h("datalist", { id: "meet-titles" }, titles.map(t => h("option", { value: t }))),
        h("button", { class: "btn", type: "button", onclick: create }, "만들기")),
      h("p", { class: "hint" }, "같은 이름의 미팅끼리 이어져서, 미팅을 열면 지난번 할 일이 위에 보입니다. 수집함에서 '미팅 안건'으로 보낸 것은 가장 가까운 예정 미팅에 쌓입니다.")),
    open.length > 0 && h("section", {},
      h("h2", {}, `남은 할 일 ${open.length}`),
      h("div", { class: "checks" }, h("ul", {}, open.map(({ m, a }) => actRow(m, a, { readonly: true, withMeeting: true }))))),
    h("section", {},
      h("h2", {}, `예정 ${upcoming.length}`),
      upcoming.length ? h("ul", { class: "items meets" }, upcoming.map(row)) : h("p", { class: "empty" }, "예정된 미팅이 없습니다.")),
    past.length > 0 && h("section", {},
      h("h2", {}, `지난 미팅 ${past.length}`),
      h("ul", { class: "items meets" }, past.map(row))));
}
