"use strict";
/* ------------------------------------------------------------------ 실험 기록 */
function goalOptions(cur) {
  const t = new Date(), mk = ymKey(t.getFullYear(), t.getMonth());
  const pd = new Date(t.getFullYear(), t.getMonth() - 1, 1), pm = ymKey(pd.getFullYear(), pd.getMonth()), wk = ymd(mondayOf(t));
  const ok = i => (i.kind === "milestone" && !i.done) || (i.kind === "month" && (i.period === mk || i.period === pm))
               || (i.kind === "week" && i.period === wk) || i.id === cur;
  const rank = { milestone: 0, month: 1, week: 2 };
  return items.filter(ok).sort((a, b) => (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3) || byCreated(a, b))
              .map(i => ({ id: i.id, title: `[${KIND_LABEL[i.kind]}] ${i.title}` }));
}

function sampleFields(s) {
  const S = s.sample || {};
  const set = patch => act(store.update(s.id, { sample: { ...((byId.get(s.id) || s).sample || {}), ...patch } }));
  return h("div", { class: "fields col" },
    h("label", {}, "날짜", h("input", { type: "date", value: s.period || "",
      onchange: e => { const v = e.target.value; if (!v || v < "1900") return; act(store.update(s.id, { period: v, sample: { ...S, date: v } })); } })),
    h("label", { class: "wide" }, "공정·조건", textInput("sp:" + s.id, S.process, v => set({ process: v }), { class: "edit", rows: 2, "aria-label": "공정·조건" })),
    h("label", { class: "wide" }, "결과", textInput("sr:" + s.id, S.result, v => set({ result: v }), { class: "edit", rows: 2, "aria-label": "결과" })));
}

function viewLab() {
  const f = k => drafts.get("lab:" + k) || "";
  const date = drafts.get("lab:date") || ymd(new Date());
  const add = () => {
    const code = f("code").trim(), process = f("process").trim(), result = f("result").trim();
    if (!code && !process && !result) return toast("시료 번호나 내용을 적어 주세요.");
    ["code", "process", "result"].forEach(k => drafts.delete("lab:" + k));
    act(store.add({ kind: "sample", title: code || "시료", period: date, parent: f("parent"),
      sample: { date, process, result }, done: false, doneAt: null, comments: [], created: Date.now() }));
  };
  const bind = (k, tag, props) => h(tag, { ...props, dataset: { fk: "lab:" + k }, value: f(k),
    oninput: e => drafts.set("lab:" + k, e.target.value),
    onkeydown: e => { if (!typing(e) && e.key === "Enter" && (tag === "input" || e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } } });
  const opts = goalOptions(f("parent"));
  const lf = labFilter.trim().toLowerCase();
  const list = items.filter(i => i.kind === "sample" && (!lf || textOf(i).toLowerCase().includes(lf)
                                   || ((byId.get(i.parent) || {}).title || "").toLowerCase().includes(lf)))
                    .sort((a, b) => a.period < b.period ? 1 : a.period > b.period ? -1 : (b.created || 0) - (a.created || 0));
  return h("div", {},
    h("section", { class: "lab-form" },
      h("h2", {}, "실험 기록 추가"),
      h("div", { class: "lf-row" },
        h("input", { type: "date", value: date, "aria-label": "날짜", onchange: e => drafts.set("lab:date", e.target.value) }),
        bind("code", "input", { class: "edit", placeholder: "시료 번호 (예: S-1023)", "aria-label": "시료 번호" }),
        h("select", { "aria-label": "연결할 목표", onchange: e => drafts.set("lab:parent", e.target.value) },
          h("option", { value: "" }, "— 연결할 목표 (선택)"),
          opts.map(o => h("option", { value: o.id, selected: f("parent") === o.id }, o.title)))),
      bind("process", "textarea", { rows: 2, placeholder: "공정·조건 (예: IGZO 30 nm, 300°C 1h 어닐링, ALD Al2O3 20 nm)", "aria-label": "공정·조건" }),
      bind("result", "textarea", { rows: 2, placeholder: "결과 (예: μ 12 cm²/Vs, Vth 0.8 V, 수율 46/50)  ·  Ctrl+Enter로 기록", "aria-label": "결과" }),
      h("div", { class: "lf-actions" },
        h("span", { class: "hint" }, "데이터 파일은 기록을 만든 뒤 펼쳐서 첨부하세요."),
        h("button", { class: "btn", type: "button", onclick: add }, "기록"))),
    h("section", {},
      h("h2", {}, `기록 ${list.length}`),
      h("input", { type: "search", class: "edit lab-q", placeholder: "기록 안에서 찾기 (번호, 조건, 결과, 목표)", "aria-label": "실험 기록 검색",
        dataset: { fk: "labq" }, value: labFilter, oninput: e => { labFilter = e.target.value; render(); } }),
      list.length ? h("ul", { class: "items samples" }, list.map(sampleRow)) : h("p", { class: "empty" }, "아직 기록이 없습니다.")));
}

function sampleRow(s) {
  const open = openIds.has(s.id), S = s.sample || {}, g = s.parent && byId.get(s.parent);
  const nA = (s.attachments || []).length, nC = (s.comments || []).length;
  return h("li", { class: "item srow" + (open ? " open" : ""), dataset: { id: s.id } },
    h("button", { class: "sline", type: "button", "aria-expanded": String(open), onclick: () => toggleOpen(s.id) },
      h("span", { class: "when" }, s.period ? shortYmd(s.period) : ""),
      h("b", {}, s.title),
      h("span", { class: "sp" }, S.process || ""),
      h("span", { class: "sr" }, S.result || ""),
      g && h("span", { class: "chip" }, "↳ " + g.title),
      (nA || nC) ? h("span", { class: "when" }, [nA && `첨부 ${nA}`, nC && `코멘트 ${nC}`].filter(Boolean).join(" · ")) : null),
    open && detail(s, { sample: true, parents: goalOptions(s.parent), parentLabel: "목표" }));
}

/* ------------------------------------------------------------------ 주간 회고·보고서 */
function weekReport(wk) {
  const mon = parseYmd(wk), t0 = mon.getTime(), t1 = addDays(mon, 7).getTime(), end = ymd(addDays(mon, 6));
  const inW = ms => !!ms && ms >= t0 && ms < t1;
  const soonEnd = ymd(addDays(mon, 20));
  return {
    done: items.filter(i => i.done && inW(i.doneAt) && !["review", "sample"].includes(i.kind)).sort((a, b) => a.doneAt - b.doneAt),
    checks: items.flatMap(i => (i.checks || []).filter(c => c.done && inW(c.at)).map(c => ({ it: i, c }))),
    open: items.filter(i => i.kind === "week" && i.period === wk && !i.done),
    moves: items.filter(i => i.kind === "paper").flatMap(p => (p.stageLog || []).map((x, k, arr) => ({ p, x, prev: k ? arr[k - 1].stage : null }))
                                                          .filter(m => m.prev && inW(m.x.at))),
    samples: items.filter(i => i.kind === "sample" && i.period >= wk && i.period <= end),
    meetings: items.filter(i => i.kind === "meeting" && i.period && i.period >= wk && i.period <= end).sort((a, b) => a.period < b.period ? -1 : 1),
    comments: items.flatMap(i => (i.comments || []).filter(c => inW(c.at)).map(c => ({ it: i, c }))),
    next: items.filter(i => i.kind === "week" && i.period === ymd(addDays(mon, 7))),
    soon: items.filter(i => !i.done && dueOf(i) && i.kind !== "review" && dueOf(i) > end && dueOf(i) <= soonEnd)
               .sort((a, b) => dueOf(a) < dueOf(b) ? -1 : 1)
  };
}

function parentNote(i) { const p = i.parent && byId.get(i.parent); return p ? ` (↳ ${p.title})` : ""; }

function buildMarkdown(wk, R, rv) {
  const mon = parseYmd(wk), L = [`# 주간 보고 · ${mon.getFullYear()} W${pad(isoWeek(mon))} (${md(mon)} – ${md(addDays(mon, 6))})`, ""];
  const sec = (title, arr) => { if (arr.length) L.push(`## ${title}`, ...arr, ""); };
  sec("완료한 일", R.done.map(i => `- [${KIND_LABEL[i.kind]}] ${i.title}${parentNote(i)}`));
  sec("완료한 세부 항목", R.checks.map(({ it, c }) => `- ${c.text} (${it.title})`));
  sec("원고 진행", R.moves.map(({ p, x, prev }) => `- ${p.title}: ${stageName(prev)} → ${stageName(x.stage)}`));
  sec("실험 기록", R.samples.map(s => `- ${shortYmd(s.period)} ${s.title}` + (s.sample && s.sample.process ? ` — ${s.sample.process}` : "")
                                    + (s.sample && s.sample.result ? ` → ${s.sample.result}` : "")));
  sec("미팅", R.meetings.flatMap(m => {
    const M = m.meeting || {}, dec = (M.decisions || "").split(/\n+/).map(x => x.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
    return [`- ${shortYmd(m.period)} ${m.title}`, ...dec.map(x => `  - 결정: ${x}`), ...(M.actions || []).map(a => `  - [${actionDone(a) ? "x" : " "}] ${a.text}`)];
  }));
  sec("이월 (못 한 주간 목표)", R.open.map(i => `- ${i.title}`));
  const r = (rv && rv.review) || {};
  if (r.good || r.blocked || r.next) {
    L.push("## 회고");
    if (r.good) L.push("**잘된 것**", r.good, "");
    if (r.blocked) L.push("**막힌 것**", r.blocked, "");
    if (r.next) L.push("**다음 주 계획**", r.next, "");
  }
  sec("다음 주 목표", R.next.map(i => `- ${i.title}`));
  sec("다가오는 마감 (2주)", R.soon.map(i => `- ${dueOf(i)} [${KIND_LABEL[i.kind]}] ${i.title}`));
  if (L.length <= 2) L.push("_이번 주 기록이 없습니다._");
  return L.join("\n").trim();
}

function heatmap() {
  const counts = new Map();
  const add = ms => { if (!ms) return; const k = ymd(new Date(ms)); counts.set(k, (counts.get(k) || 0) + 1); };
  for (const i of items) { if (i.done && i.kind !== "review") add(i.doneAt); for (const c of i.checks || []) if (c.done) add(c.at); }
  const weeks = 26, start = addDays(mondayOf(new Date()), -7 * (weeks - 1)), now = new Date();
  let total = 0;
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w * 7 + d), k = ymd(day), n = counts.get(k) || 0;
      total += n;
      const lv = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
      cells.push(h("i", { class: `l${lv}` + (day > now ? " f" : ""), title: `${k} · 완료 ${n}` }));
    }
    cols.push(h("div", { class: "hc" }, cells));
  }
  return h("section", {},
    h("h2", {}, `최근 6개월 · 완료 ${total}`),
    h("div", { class: "heat", role: "img", "aria-label": `최근 6개월 동안 완료한 항목 ${total}개` }, cols),
    h("div", { class: "heat-legend" }, "적음", [0, 1, 2, 3, 4].map(l => h("i", { class: "l" + l })), "많음"));
}

function viewReview() {
  const wk = revWeek, mon = parseYmd(wk), sun = addDays(mon, 6), cur = ymd(mondayOf(new Date()));
  const R = weekReport(wk);
  const rv = items.find(i => i.kind === "review" && i.period === wk);
  const save = (field, v) => {
    const now = items.find(i => i.kind === "review" && i.period === wk);
    if (now) act(store.update(now.id, { review: { ...(now.review || {}), [field]: v } }));
    else if (v) act(store.add({ kind: "review", title: `주간 회고 W${pad(isoWeek(mon))} (${md(mon)}–${md(sun)})`, period: wk, parent: "",
      review: { good: "", blocked: "", next: "", [field]: v }, done: false, doneAt: null, comments: [], created: Date.now() }));
  };
  const box = (field, label, ph) => h("label", { class: "rv" }, h("span", {}, label),
    textInput(`rv:${wk}:${field}`, rv && rv.review && rv.review[field], v => save(field, v), { rows: 3, placeholder: ph, "aria-label": label }));
  const list = (title, arr, fmt) => arr.length > 0 && h("div", { class: "rs" }, h("h3", {}, `${title} ${arr.length}`), h("ul", {}, arr.slice(0, 30).map(fmt)));
  const mdText = buildMarkdown(wk, R, rv);
  return h("div", {},
    h("div", { class: "wk-nav" },
      h("button", { class: "nav-btn", type: "button", "aria-label": "이전 주", onclick: () => { revWeek = ymd(addDays(mon, -7)); render(); } }, "‹"),
      h("div", { class: "m" }, `W${pad(isoWeek(mon))}`, h("small", {}, `${md(mon)} – ${md(sun)}`)),
      h("button", { class: "nav-btn", type: "button", "aria-label": "다음 주", onclick: () => { revWeek = ymd(addDays(mon, 7)); render(); } }, "›"),
      wk !== cur && h("button", { class: "btn ghost", type: "button", onclick: () => { revWeek = cur; render(); } }, "이번 주")),
    h("section", {},
      h("h2", {}, "이번 주 기록 (자동)"),
      h("div", { class: "rsum" },
        list("완료", R.done, i => h("li", {}, h("span", { class: "kind" }, KIND_LABEL[i.kind]), i.title)),
        list("세부 항목 완료", R.checks, ({ it, c }) => h("li", {}, c.text, h("span", { class: "when" }, " · " + it.title))),
        list("원고 진행", R.moves, ({ p, x, prev }) => h("li", {}, p.title, h("span", { class: "when" }, ` · ${stageName(prev)} → ${stageName(x.stage)}`))),
        list("실험 기록", R.samples, s => h("li", {}, h("span", { class: "when" }, shortYmd(s.period) + " "), s.title)),
        list("미팅", R.meetings, m => h("li", {}, h("span", { class: "when" }, shortYmd(m.period) + " "), m.title)),
        list("코멘트", R.comments, ({ it, c }) => h("li", {}, c.text.length > 60 ? c.text.slice(0, 60) + "…" : c.text, h("span", { class: "when" }, " · " + it.title))),
        list("못 한 주간 목표", R.open, i => h("li", {}, i.title))),
      !R.done.length && !R.checks.length && !R.moves.length && !R.samples.length && !R.meetings.length && !R.comments.length && !R.open.length
        && h("p", { class: "empty" }, "이 주에 기록된 내용이 없습니다.")),
    h("section", {},
      h("h2", {}, "회고"),
      box("good", "잘된 것", "이번 주에 잘 풀린 것, 배운 것"),
      box("blocked", "막힌 것", "막힌 부분, 도움이 필요한 것"),
      box("next", "다음 주 계획", "다음 주에 꼭 할 것")),
    h("section", {},
      h("h2", {}, "보고서"),
      h("div", { class: "rp-actions" },
        h("button", { class: "btn", type: "button", onclick: () => navigator.clipboard.writeText(mdText).then(() => toast("보고서를 복사했습니다."), () => toast("복사하지 못했습니다.")) }, "복사"),
        h("button", { class: "btn ghost", type: "button", onclick: () => download(`weekly-${wk}.md`, mdText, "text/markdown") }, "파일로 받기 (.md)"),
        h("span", { class: "hint" }, "랩미팅·교수님 보고용. 회고 칸을 채우면 함께 들어갑니다.")),
      h("pre", { class: "report" }, mdText)),
    heatmap());
}
