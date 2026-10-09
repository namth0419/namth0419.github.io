"use strict";
/* ------------------------------------------------------------------ 문헌 (읽은 논문)
 * DOI 를 넣으면 Crossref(일반 논문) 또는 DataCite(arXiv 등)에서 서지 정보를 채움.
 * 항목: kind "ref", ref: { doi, authors:[{family, given}], journal, year, volume, issue, pages, url, abstract, type, status, star }
 * 메모는 코멘트, PDF 는 Drive 첨부나 링크 첨부. EndNote(.enw)·RIS 로 내보내기.
 */
const READ = [["toread", "읽을 것"], ["reading", "읽는 중"], ["done", "다 읽음"]];
const readName = k => (READ.find(r => r[0] === k) || READ[0])[1];
let libStatus = "all", libStar = false, libQuery = "", libSort = "added", libBusy = false;
const libSel = new Set();

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;
const doiOf = text => { const m = (text || "").trim().match(DOI_RE); return m ? m[1].replace(/[.,;)\]]+$/, "") : ""; };
const stripTags = s => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function fetchMeta(doi) {
  // Crossref 먼저, 없으면 DataCite (arXiv, Zenodo 등)
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (r.ok) {
      const m = (await r.json()).message;
      const date = (m.issued && m.issued["date-parts"] && m.issued["date-parts"][0]) || [];
      return {
        title: stripTags((m.title || [])[0]) || doi,
        authors: (m.author || []).map(a => a.family ? { family: a.family, given: a.given || "" } : { family: a.name || "", given: "" }),
        journal: (m["container-title"] || [])[0] || (m["short-container-title"] || [])[0] || m.publisher || "",
        year: date[0] ? String(date[0]) : "", volume: m.volume || "", issue: m.issue || "",
        pages: m.page || m["article-number"] || "", url: `https://doi.org/${doi}`,
        abstract: stripTags(m.abstract), type: m.type || "journal-article"
      };
    }
  } catch (e) {}
  const r = await fetch(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
  if (!r.ok) throw new Error("DOI 정보를 찾지 못했습니다.");
  const a = (await r.json()).data.attributes;
  return {
    title: ((a.titles || [])[0] || {}).title || doi,
    authors: (a.creators || []).map(c => ({ family: c.familyName || c.name || "", given: c.givenName || "" })),
    journal: a.publisher || "", year: a.publicationYear ? String(a.publicationYear) : "", volume: "", issue: "", pages: "",
    url: `https://doi.org/${doi}`, abstract: stripTags(((a.descriptions || [])[0] || {}).description),
    type: /preprint/i.test((a.types || {}).resourceTypeGeneral || "") ? "posted-content" : "journal-article"
  };
}

async function addRef(text) {
  const doi = doiOf(text);
  const now = Date.now();
  const base = { kind: "ref", period: "", parent: "", done: false, doneAt: null, comments: [], created: now };
  if (!doi) {                                       // DOI 가 없으면 제목만으로 만들고 나머지는 직접 입력
    if (!text.trim()) return;
    act(store.add({ ...base, title: text.trim(), ref: { doi: "", authors: [], journal: "", year: "", volume: "", issue: "", pages: "", url: "", abstract: "", type: "journal-article", status: "toread", star: false } }));
    return;
  }
  const dup = items.find(i => i.kind === "ref" && (i.ref || {}).doi && i.ref.doi.toLowerCase() === doi.toLowerCase());
  if (dup) { drafts.delete("lib:add"); toast("이미 있는 문헌입니다."); goTo(dup); return true; }
  let ok = false;
  libBusy = true; render();
  try {
    const m = await fetchMeta(doi);
    act(store.add({ ...base, title: m.title, ref: { doi, ...m, status: "toread", star: false } }));
    drafts.delete("lib:add");
    ok = true;
  } catch (e) { toast(e.message + " DOI를 확인해 주세요."); }
  libBusy = false; render();
  return ok;
}

async function refillRef(it) {
  const doi = (it.ref || {}).doi;
  if (!doi) return toast("DOI가 없습니다.");
  try {
    const m = await fetchMeta(doi);
    const cur = byId.get(it.id) || it;
    act(store.update(it.id, { title: m.title, ref: { ...(cur.ref || {}), ...m, doi } }).then(() => toast("DOI 정보로 다시 채웠습니다.")));
  } catch (e) { toast(e.message); }
}

function setReadStatus(it, status) {
  const cur = byId.get(it.id) || it;
  const done = status === "done";
  act(store.update(it.id, { ref: { ...(cur.ref || {}), status }, done, doneAt: done ? (cur.doneAt || Date.now()) : null }));
}

const authorText = r => (r.authors || []).map(a => a.family ? `${a.family}${a.given ? ", " + a.given : ""}` : "").filter(Boolean).join("; ");
const parseAuthors = s => s.split(/\s*;\s*/).filter(Boolean).map(x => { const [f, ...g] = x.split(/\s*,\s*/); return { family: f || "", given: g.join(" ") }; });
function shortAuthors(r) {
  const a = (r.authors || []).filter(x => x.family);
  if (!a.length) return "";
  return a.length === 1 ? a[0].family : a.length === 2 ? `${a[0].family}, ${a[1].family}` : `${a[0].family} et al.`;
}

function refFields(it) {
  const R = it.ref || {};
  const set = patch => act(store.update(it.id, { ref: { ...((byId.get(it.id) || it).ref || {}), ...patch } }));
  const tf = (key, label, cls, ph) => h("label", { class: cls || "" }, label,
    textInput(`rf:${key}:${it.id}`, R[key], v => set({ [key]: v }), { class: "edit", placeholder: ph || "", "aria-label": label }));
  return h("div", { class: "fields" },
    h("label", {}, "읽기 상태", h("select", { onchange: e => setReadStatus(it, e.target.value) },
      READ.map(([v, l]) => h("option", { value: v, selected: (R.status || "toread") === v }, l)))),
    tf("journal", "저널"), tf("year", "연도"), tf("volume", "권"), tf("issue", "호"), tf("pages", "쪽·논문번호"),
    h("label", { class: "wide" }, "저자 (성, 이름; 성, 이름 …)",
      textInput("rf:authors:" + it.id, authorText(R), v => set({ authors: parseAuthors(v) }), { class: "edit", "aria-label": "저자" })),
    tf("doi", "DOI", "wide", "10.xxxx/…"),
    R.doi && h("button", { class: "link", type: "button", onclick: () => refillRef(it) }, "DOI 정보로 다시 채우기"),
    R.abstract && h("details", { class: "abs wide" }, h("summary", {}, "초록"), h("p", {}, R.abstract)));
}

/* ---------- 내보내기: EndNote(.enw, Refer 형식)와 RIS ---------- */
const ENW_TYPE = { "journal-article": "Journal Article", "proceedings-article": "Conference Proceedings", "book-chapter": "Book Section", book: "Book", "posted-content": "Electronic Article" };
const RIS_TYPE = { "journal-article": "JOUR", "proceedings-article": "CPAPER", "book-chapter": "CHAP", book: "BOOK", "posted-content": "EJOUR" };
function refNotes(it) {
  const notes = (it.comments || []).map(c => c.text);
  for (const a of it.attachments || []) if (safeHref(a.link)) notes.push(`${a.name}: ${a.link}`);
  return notes.join("\n");
}
function toEnw(it, withNotes) {
  const R = it.ref || {}, L = [`%0 ${ENW_TYPE[R.type] || "Journal Article"}`];
  for (const a of R.authors || []) if (a.family) L.push(`%A ${a.family}${a.given ? ", " + a.given : ""}`);
  L.push(`%T ${it.title}`);
  if (R.journal) L.push(`%J ${R.journal}`);
  if (R.year) L.push(`%D ${R.year}`);
  if (R.volume) L.push(`%V ${R.volume}`);
  if (R.issue) L.push(`%N ${R.issue}`);
  if (R.pages) L.push(`%P ${R.pages}`);
  if (R.doi) L.push(`%R ${R.doi}`, `%U https://doi.org/${R.doi}`);
  else if (R.url) L.push(`%U ${R.url}`);
  if (R.abstract) L.push(`%X ${R.abstract}`);
  for (const t of tagsOf(it)) L.push(`%K ${t.slice(1)}`);
  const n = withNotes && refNotes(it);
  if (n) L.push(`%Z ${n.replace(/\n/g, " / ")}`);
  return L.join("\n");
}
function toRis(it, withNotes) {
  const R = it.ref || {}, L = [`TY  - ${RIS_TYPE[R.type] || "JOUR"}`];
  for (const a of R.authors || []) if (a.family) L.push(`AU  - ${a.family}${a.given ? ", " + a.given : ""}`);
  L.push(`TI  - ${it.title}`);
  if (R.journal) L.push(`T2  - ${R.journal}`);
  if (R.year) L.push(`PY  - ${R.year}`);
  if (R.volume) L.push(`VL  - ${R.volume}`);
  if (R.issue) L.push(`IS  - ${R.issue}`);
  if (R.pages) { const [sp, ep] = R.pages.split(/\s*[-–]\s*/); L.push(`SP  - ${sp}`); if (ep) L.push(`EP  - ${ep}`); }
  if (R.doi) L.push(`DO  - ${R.doi}`, `UR  - https://doi.org/${R.doi}`);
  else if (R.url) L.push(`UR  - ${R.url}`);
  if (R.abstract) L.push(`AB  - ${R.abstract}`);
  for (const t of tagsOf(it)) L.push(`KW  - ${t.slice(1)}`);
  const n = withNotes && refNotes(it);
  if (n) L.push(`N1  - ${n.replace(/\n/g, " / ")}`);
  L.push("ER  - ");
  return L.join("\r\n");
}
let libNotes = true;
function exportRefs(list, fmt) {
  if (!list.length) return toast("내보낼 문헌을 골라 주세요.");
  const body = fmt === "enw" ? list.map(i => toEnw(i, libNotes)).join("\n\n") + "\n" : list.map(i => toRis(i, libNotes)).join("\r\n\r\n") + "\r\n";
  download(`references-${ymd(new Date())}.${fmt}`, "﻿" + body, fmt === "enw" ? "application/x-endnote-refer" : "application/x-research-info-systems");
  toast(`${list.length}편을 ${fmt === "enw" ? "EndNote(.enw)" : "RIS"} 파일로 내려받았습니다.`);
}

function deleteRefs(list) {
  if (!list.length) return;
  const what = list.length === 1 ? `"${list[0].title}"` : `문헌 ${list.length}편`;
  const att = list.some(i => (i.attachments || []).some(a => a.kind !== "link")) ? " Drive에 올린 PDF는 그대로 남습니다." : "";
  if (!confirm(`${what}을(를) 삭제할까요? ${TRASH_DAYS}일 동안 휴지통에서 되살릴 수 있습니다.${att}`)) return;
  moveToTrash(list.map(i => i.id), `${list.length}편을 휴지통으로 옮겼습니다.`);
}

/* ---------- 화면 ---------- */
function viewLibrary() {
  const all = items.filter(i => i.kind === "ref");
  const st = i => (i.ref || {}).status || "toread";
  const q = libQuery.trim().toLowerCase();
  let list = all.filter(i => (libStatus === "all" || st(i) === libStatus) && (!libStar || (i.ref || {}).star)
                          && (!q || textOf(i).toLowerCase().includes(q)));
  const sorters = {
    added: (a, b) => (b.created || 0) - (a.created || 0),
    year: (a, b) => ((b.ref || {}).year || "").localeCompare((a.ref || {}).year || "") || (b.created || 0) - (a.created || 0),
    title: (a, b) => a.title.localeCompare(b.title)
  };
  list = list.sort(sorters[libSort]);
  for (const id of [...libSel]) if (!byId.has(id)) libSel.delete(id);
  const selList = all.filter(i => libSel.has(i.id));
  const allShownSel = list.length > 0 && list.every(i => libSel.has(i.id));
  const add = () => { const v = drafts.get("lib:add") || ""; if (v.trim()) addRef(v); };
  const count = k => all.filter(i => st(i) === k).length;

  return h("div", {},
    h("section", { class: "lib-add" },
      h("div", { class: "la-row" },
        h("input", { class: "edit", placeholder: "DOI 또는 doi.org 주소를 붙여넣으세요 (DOI가 없으면 제목)", "aria-label": "DOI 또는 제목",
          dataset: { fk: "lib:add" }, value: drafts.get("lib:add") || "", disabled: libBusy,
          oninput: e => drafts.set("lib:add", e.target.value),
          onkeydown: e => { if (!typing(e) && e.key === "Enter") { e.preventDefault(); add(); } } }),
        h("button", { class: "btn", type: "button", disabled: libBusy, onclick: add }, libBusy ? "불러오는 중…" : "추가")),
      h("p", { class: "hint" }, "DOI를 넣으면 제목·저자·저널·연도·초록을 자동으로 채웁니다. PDF는 추가한 뒤 펼쳐서 Drive로 첨부하거나 링크를 붙이세요.")),
    h("div", { class: "lib-bar" },
      h("div", { class: "seg" },
        [["all", `전체 ${all.length}`], ...READ.map(([k, l]) => [k, `${l} ${count(k)}`])].map(([k, l]) =>
          h("button", { type: "button", "aria-pressed": String(libStatus === k), onclick: () => { libStatus = k; render(); } }, l)),
        h("button", { type: "button", "aria-pressed": String(libStar), title: "중요 표시한 것만", onclick: () => { libStar = !libStar; render(); } }, "★ 중요")),
      h("input", { type: "search", class: "edit lib-q", placeholder: "문헌 안에서 찾기 (제목, 저자, 저널, 메모)", "aria-label": "문헌 검색",
        dataset: { fk: "libq" }, value: libQuery, oninput: e => { libQuery = e.target.value; render(); } }),
      h("select", { "aria-label": "정렬", onchange: e => { libSort = e.target.value; render(); } },
        [["added", "추가한 순"], ["year", "연도 순"], ["title", "제목 순"]].map(([v, l]) => h("option", { value: v, selected: libSort === v }, l)))),
    h("div", { class: "lib-export" },
      h("label", { class: "chk" }, h("input", { type: "checkbox", checked: allShownSel,
        onchange: e => { list.forEach(i => e.target.checked ? libSel.add(i.id) : libSel.delete(i.id)); render(); } }), "보이는 것 모두 선택"),
      h("span", { class: "when" }, `선택 ${selList.length}편`),
      h("label", { class: "chk" }, h("input", { type: "checkbox", checked: libNotes, onchange: e => { libNotes = e.target.checked; } }), "메모·링크 포함"),
      h("button", { class: "btn", type: "button", disabled: !selList.length, onclick: () => exportRefs(selList, "enw") }, "EndNote (.enw)"),
      h("button", { class: "btn ghost", type: "button", disabled: !selList.length, onclick: () => exportRefs(selList, "ris") }, "RIS"),
      h("button", { class: "btn danger", type: "button", disabled: !selList.length, onclick: () => deleteRefs(selList) }, "선택 삭제")),
    list.length ? h("ul", { class: "reflist" }, list.map(refRow))
                : h("p", { class: "empty" }, all.length ? "조건에 맞는 문헌이 없습니다." : "아직 문헌이 없습니다. 위에 DOI를 붙여넣어 보세요."));
}

function refRow(it) {
  const open = openIds.has(it.id), R = it.ref || {};
  const pdf = (it.attachments || []).find(a => safeHref(a.link) && (/pdf/i.test(a.mime || "") || /\.pdf$/i.test(a.name) || a.kind === "link"));
  const nC = (it.comments || []).length, g = it.parent && byId.get(it.parent);
  return h("li", { class: `rrow rs-${R.status || "toread"}` + (open ? " open" : ""), dataset: { id: it.id } },
    h("input", { type: "checkbox", class: "rsel", checked: libSel.has(it.id), "aria-label": "내보내기 선택",
      onchange: e => { e.target.checked ? libSel.add(it.id) : libSel.delete(it.id); render(); } }),
    h("button", { type: "button", class: "star" + (R.star ? " on" : ""), "aria-label": R.star ? "중요 표시 해제" : "중요 표시", "aria-pressed": String(!!R.star),
      onclick: () => act(store.update(it.id, { ref: { ...R, star: !R.star } })) }, R.star ? "★" : "☆"),
    h("div", { class: "rr-main" },
      h("button", { class: "pr-title", type: "button", "aria-expanded": String(open), onclick: () => toggleOpen(it.id) }, it.title),
      h("div", { class: "pm" },
        shortAuthors(R) && h("span", {}, shortAuthors(R)),
        R.journal && h("span", { class: "pj" }, R.journal),
        R.year && h("span", {}, R.year),
        R.doi && h("a", { href: `https://doi.org/${encodeURI(R.doi)}`, target: "_blank", rel: "noopener noreferrer" }, "DOI ↗"),
        pdf && h("a", { href: safeHref(pdf.link), target: "_blank", rel: "noopener noreferrer" }, "PDF ↗"),
        nC > 0 && h("span", {}, `메모 ${nC}`),
        g && h("span", { class: "chip" }, "↳ " + g.title))),
    h("div", { class: "rr-side" },
      h("select", { class: "rr-status", "aria-label": "읽기 상태", onchange: e => setReadStatus(it, e.target.value) },
        READ.map(([v, l]) => h("option", { value: v, selected: (R.status || "toread") === v }, l))),
      h("button", { class: "rr-del", type: "button", "aria-label": `${it.title} 삭제`, title: "삭제", onclick: () => deleteRefs([it]) }, "삭제")),
    open && h("div", { class: "pr-detail" }, detail(it, { ref: true, parents: goalOptions(it.parent), parentLabel: "연결 목표" })));
}
