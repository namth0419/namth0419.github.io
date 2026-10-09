/*
 * Research Planner
 *   - 로그인: Firebase Auth (Google)
 *   - 저장:   Firestore  users/{uid}/items/{id}
 *   - 접근 제한은 Firebase 콘솔의 Firestore 규칙이 담당합니다 (이 파일이 아니라).
 *     이 파일은 공개되어 있으므로 여기에 비밀번호·개인 이메일 등을 넣지 마세요.
 *
 * item 문서 구조
 *   kind     : "milestone" | "month" | "week" | "day"
 *   title    : string
 *   done     : boolean,   doneAt: ms | null
 *   period   : milestone → 마감 월 "YYYY-MM" (없으면 "", end 와 맞춰 저장)
 *              month     → "YYYY-MM"
 *              week      → 그 주 월요일 "YYYY-MM-DD"
 *              day       → "YYYY-MM-DD"
 *   start,end: milestone 만. 간트 차트 기간 "YYYY-MM-DD" (없으면 "")
 *   parent   : month → milestone id,  week → month 목표 id,  day → week 목표 id  (없으면 "")
 *   comments : [{id, text, at(ms)}]
 *   created  : ms
 *
 * 로컬 미리보기: http://localhost:8000/planner/?demo  (로그인 없이 브라우저 저장소 사용)
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, reauthenticateWithPopup,
         onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence,
         collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch
       } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBE_12y8__8AzP6YOmF-LIAb88_rhcdOSU",
  authDomain: "namth0419.firebaseapp.com",
  projectId: "namth0419",
  storageBucket: "namth0419.firebasestorage.app",
  messagingSenderId: "545512775827",
  appId: "1:545512775827:web:b34733efd9482042096d66"
};

const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const DEMO = LOCAL && new URLSearchParams(location.search).has("demo");

/* ------------------------------------------------------------------ dates */
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymKey = (y, m) => `${y}-${pad(m + 1)}`;                       // m: 0-based
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
// 한 주는 목요일이 속한 달에 들어갑니다 (ISO 주차 규칙). 그래서 모든 주가 정확히 한 달에만 나옵니다.
function weeksOf(y, m) {
  const out = [], last = new Date(y, m + 1, 0);
  for (let mon = mondayOf(new Date(y, m, 1)); mon <= last; mon = addDays(mon, 7))
    if (addDays(mon, 3).getMonth() === m) out.push(ymd(mon));
  return out;
}
function isoWeek(mon) {
  const th = addDays(mon, 3), jan1 = new Date(th.getFullYear(), 0, 1);
  return Math.floor(Math.round((th - jan1) / 864e5) / 7) + 1;
}
const md = d => `${d.getMonth() + 1}.${d.getDate()}`;
const fmtWhen = ms => {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtYm = s => s ? s.replace("-", ".") : "";
const WD = "일월화수목금토";
const dayLabel = d => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
const monthEnd = ym => { const [y, m] = ym.split("-").map(Number); return ymd(new Date(y, m, 0)); };
// 마일스톤 기간. 예전 데이터(목표 월만 있는 경우)도 그대로 보이도록 period/created 로 보완
const msEnd = m => m.end || (m.period ? monthEnd(m.period) : "");
const msStart = m => m.start || ymd(new Date(m.created || Date.now()));
const shortYmd = s => s.slice(0, 4) === String(new Date().getFullYear())
  ? s.slice(5).replace("-", ".") : s.slice(2).replace(/-/g, ".");

/* ------------------------------------------------------------------ stores */
function firestoreStore(db, uid) {
  const col = collection(db, "users", uid, "items");
  return {
    subscribe: (cb, onErr) => onSnapshot(col, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr),
    add: data => addDoc(col, data),
    update: (id, patch) => updateDoc(doc(col, id), patch),
    remove: id => deleteDoc(doc(col, id)),
    updateMany: (ids, patch) => {
      const b = writeBatch(db);
      ids.forEach(id => b.update(doc(col, id), patch));
      return b.commit();
    },
    // 가져오기용. 한 번에 쓸 수 있는 개수(500)를 넘지 않게 나눠서 씀
    addMany: async list => {
      for (let i = 0; i < list.length; i += 400) {
        const b = writeBatch(db);
        list.slice(i, i + 400).forEach(({ id, data }) => b.set(doc(col, id), data));
        await b.commit();
      }
    },
    removeMany: async ids => {
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(db);
        ids.slice(i, i + 400).forEach(id => b.delete(doc(col, id)));
        await b.commit();
      }
    }
  };
}

function demoStore() {
  const KEY = "planner-demo-v2";
  let items = null, cb = null;
  try { items = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!Array.isArray(items)) items = demoSeed();
  const emit = () => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    if (cb) cb(items.map(x => ({ ...x })));
  };
  const find = id => items.find(x => x.id === id);
  return {
    subscribe: f => { cb = f; emit(); return () => { cb = null; }; },
    add: async d => { const id = rid(); items.push({ id, ...d }); emit(); return { id }; },
    update: async (id, p) => { Object.assign(find(id) || {}, p); emit(); },
    remove: async id => { items = items.filter(x => x.id !== id); emit(); },
    updateMany: async (ids, p) => { ids.forEach(id => Object.assign(find(id) || {}, p)); emit(); },
    addMany: async list => { list.forEach(({ id, data }) => items.push({ id, ...data })); emit(); },
    removeMany: async ids => { const s = new Set(ids); items = items.filter(x => !s.has(x.id)); emit(); }
  };
}
function demoSeed() {
  const now = new Date(), t = Date.now(), mk = ymKey(now.getFullYear(), now.getMonth()), wk = ymd(mondayOf(now));
  const base = { done: false, doneAt: null, comments: [], parent: "" };
  const y = now.getFullYear(), m = now.getMonth(), td = ymd(now);
  const m1 = { ...base, id: "m1", kind: "milestone", title: "논문 A 투고", created: t,
               start: ymd(new Date(y, m - 1, 1)), end: monthEnd(ymKey(y, m + 2)) };
  m1.period = m1.end.slice(0, 7);
  const m2 = { ...base, id: "m2", kind: "milestone", title: "소자 공정 조건 최적화", created: t + 1,
               start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 20)) };
  m2.period = m2.end.slice(0, 7);
  const g1 = { ...base, id: "g1", kind: "month", title: "Figure 3, 4 데이터 정리", period: mk, parent: "m1", created: t + 2,
               comments: [{ id: "c1", text: "XRD 데이터 재측정 필요할 수도 있음", at: t - 864e5 }] };
  const g2 = { ...base, id: "g2", kind: "month", title: "어닐링 온도 스윕 실험", period: mk, parent: "m2", created: t + 3 };
  const w1 = { ...base, id: "w1", kind: "week", title: "Figure 3 초안 그리기", period: wk, parent: "g1", created: t + 4, done: true, doneAt: t };
  const w2 = { ...base, id: "w2", kind: "week", title: "샘플 6개 제작", period: wk, parent: "g2", created: t + 5 };
  const d1 = { ...base, id: "d1", kind: "day", title: "Figure 3 축 라벨 정리", period: ymd(addDays(now, -1)), parent: "w1", created: t + 6, done: true, doneAt: t };
  const d2 = { ...base, id: "d2", kind: "day", title: "기판 세정", period: td, parent: "w2", created: t + 7, done: true, doneAt: t };
  const d3 = { ...base, id: "d3", kind: "day", title: "스퍼터링 3개", period: td, parent: "w2", created: t + 8 };
  const d4 = { ...base, id: "d4", kind: "day", title: "랩미팅 발표 자료", period: ymd(addDays(now, 1)), created: t + 9 };
  return [m1, m2, g1, g2, w1, w2, d1, d2, d3, d4];
}
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ------------------------------------------------------------------ state */
const app = document.getElementById("app");
const who = document.getElementById("who");
let state = "loading";           // loading | signedOut | denied | error | ready
let errorMsg = "";
let store = null, unsub = null, auth = null;
let items = [], byId = new Map();
const today = new Date();
let viewY = today.getFullYear(), viewM = today.getMonth();
const openIds = new Set();       // 펼쳐진 항목
const drafts = new Map();        // 입력 중인 글 (다시 그려도 유지)
let showDoneMs = false;
const TABS = [["goals", "목표"], ["calendar", "달력"], ["gantt", "간트"], ["papers", "원고"], ["library", "문헌"], ["lab", "실험"], ["review", "회고"]];
let query = "";                  // 전체 검색
let labFilter = "";              // 실험 기록 안에서 찾기
let revWeek = ymd(mondayOf(today));   // 회고 탭에서 보는 주
let tab = TABS.some(([k]) => "#" + k === location.hash) ? location.hash.slice(1) : "goals";
let selDay = ymd(today);         // 달력에서 고른 날
let ganttFolded = new Set();      // 간트에서 접은 마일스톤 (이 브라우저에만 기억)
try { ganttFolded = new Set(JSON.parse(localStorage.getItem("planner-gantt-folded")) || []); } catch (e) {}
const saveFolded = () => { try { localStorage.setItem("planner-gantt-folded", JSON.stringify([...ganttFolded])); } catch (e) {} };
addEventListener("hashchange", () => {
  const k = location.hash.slice(1);
  if (TABS.some(([t]) => t === k) && k !== tab) { tab = k; render(); }
});

function setItems(list) {
  items = list;
  byId = new Map(list.map(i => [i.id, i]));
  state = "ready";
  render();
  ensureRepeats();
}
const act = p => Promise.resolve(p).catch(e => {
  console.error(e);
  toast(e && e.code === "permission-denied" ? "저장 권한이 없습니다." : "저장하지 못했습니다: " + (e && e.message || e));
});
let toastTimer = 0;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), 4000);
}

/* ------------------------------------------------------------------ dom helper */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "value" || k === "checked" || k === "selected") el[k] = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity))
    if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const svg = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
const ICON_NOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg>';
const ICON_CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/></svg>';
const typing = e => e.isComposing || e.keyCode === 229;   // 한글 조합 중 Enter 무시

function bar(done, total) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return h("div", { class: "bar", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 },
    h("i", { style: `width:${pct}%` }));
}
const byCreated = (a, b) => (a.created || 0) - (b.created || 0);

/* ------------------------------------------------------------------ render */
const postRender = [];            // 그린 직후 실행할 일 (스크롤 위치 복원 등)
function render() {
  // 다시 그려도 입력 중이던 칸의 포커스와 커서 위치를 유지
  const ae = document.activeElement, fk = ae && ae.dataset && ae.dataset.fk;
  let s = null, e = null;
  try { s = ae.selectionStart; e = ae.selectionEnd; } catch (_) {}

  renderWho();
  app.replaceChildren(state === "ready" ? viewPlanner() : viewGate());

  if (fk) {
    const el = app.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      try { if (s != null) el.setSelectionRange(s, e); } catch (_) {}
    }
  }
  for (const f of postRender.splice(0)) f();
}

function renderWho() {
  who.replaceChildren();
  if (state === "ready")
    who.append(h("button", { class: "btn ghost", type: "button", onclick: openImport }, "가져오기"),
               h("button", { class: "btn ghost", type: "button", title: "모든 항목을 JSON 파일로 백업", onclick: exportBackup }, "내보내기"));
  if (DEMO) who.append(h("span", { class: "demo-flag" }, "DEMO · 로컬 저장"));
  else if (auth && auth.currentUser)
    who.append(h("span", {}, auth.currentUser.email),
               h("button", { class: "btn ghost", type: "button", onclick: logout }, "로그아웃"));
}

/* ------------------------------------------------------------------ import
 * 계획을 JSON 으로 한 번에 넣습니다. 계획 파일은 공개 저장소에 올리지 마세요.
 * { "source": "이름", "items": [
 *     { "key": "a", "kind": "milestone", "title": "...", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "comments": ["..."] },
 *     { "kind": "month", "period": "YYYY-MM", "title": "...", "parent": "a" },
 *     { "kind": "week",  "period": "YYYY-MM-DD", ... },   // 그 주의 아무 날짜 (월요일로 맞춤)
 *     { "kind": "day",   "period": "YYYY-MM-DD", ... } ] }
 * parent 는 같은 파일 안의 key. 같은 source 를 다시 가져오면 예전에 가져온 항목을 지우고 새로 넣습니다.
 */
function parsePlan(text) {
  const data = JSON.parse(text);
  if (data && data.backup) {                       // "내보내기"로 받은 백업 파일
    if (!Array.isArray(data.items)) throw new Error("백업 파일 형식이 아닙니다.");
    return data.items.map((x, i) => {
      if (!x || !x.id || !x.kind) throw new Error(`${i + 1}번째 항목에 id/kind 가 없습니다.`);
      const { id, ...rest } = x;
      return { id: String(id), data: rest, backup: true };
    });
  }
  if (!data || !Array.isArray(data.items) || !data.items.length) throw new Error("items 목록이 없습니다.");
  const src = String(data.source || "import").trim();
  const D = /^\d{4}-\d{2}-\d{2}$/, M = /^\d{4}-\d{2}$/;
  const keyToId = new Map(), now = Date.now();
  const rows = data.items.map((x, i) => {
    const where = `${i + 1}번째 항목`;
    if (!["milestone", "month", "week", "day"].includes(x.kind)) throw new Error(`${where}: kind 가 잘못되었습니다.`);
    if (!x.title || !String(x.title).trim()) throw new Error(`${where}: title 이 비어 있습니다.`);
    const id = rid();
    if (x.key != null) {
      if (keyToId.has(x.key)) throw new Error(`${where}: key "${x.key}" 가 중복됩니다.`);
      keyToId.set(x.key, id);
    }
    return { x, id, i, where };
  });
  return rows.map(({ x, id, i, where }) => {
    let period = "", extra = {};
    if (x.kind === "milestone") {
      const start = x.start || "", end = x.end || "";
      if ((start && !D.test(start)) || (end && !D.test(end))) throw new Error(`${where}: start/end 는 YYYY-MM-DD 형식이어야 합니다.`);
      if (start && end && end < start) throw new Error(`${where}: end 가 start 보다 빠릅니다.`);
      extra = { start, end };
      period = end ? end.slice(0, 7) : "";
    } else if (x.kind === "month") {
      if (!M.test(x.period || "")) throw new Error(`${where}: 월간 목표의 period 는 YYYY-MM 형식이어야 합니다.`);
      period = x.period;
    } else {
      if (!D.test(x.period || "")) throw new Error(`${where}: period 는 YYYY-MM-DD 형식이어야 합니다.`);
      period = x.kind === "week" ? ymd(mondayOf(parseYmd(x.period))) : x.period;
    }
    if (x.parent != null && !keyToId.has(x.parent)) throw new Error(`${where}: parent "${x.parent}" 를 찾을 수 없습니다.`);
    return { id, data: {
      kind: x.kind, title: String(x.title).trim(), period,
      parent: x.parent != null ? keyToId.get(x.parent) : "",
      done: !!x.done, doneAt: x.done ? now : null,
      comments: (x.comments || []).map((t, j) => ({ id: rid(), text: String(t), at: now + j })),
      created: now + i, src, ...extra } };
  });
}

function openImport() {
  const dlg = h("dialog", { class: "dlg", onclose: () => dlg.remove() });
  let text = "";
  const err = h("p", { class: "err", role: "alert" });
  const fill = () => {
    const sources = new Map();
    for (const i of items) if (i.src) sources.set(i.src, (sources.get(i.src) || 0) + 1);
    const ta = h("textarea", { placeholder: "여기에 JSON 을 붙여넣거나 위에서 파일을 고르세요.", "aria-label": "가져올 JSON",
                               value: text, oninput: e => { text = e.target.value; } });
    dlg.replaceChildren(
      h("h3", {}, "계획 가져오기"),
      h("p", {}, "JSON 파일로 마일스톤과 목표를 한 번에 추가하거나, '내보내기'로 받은 백업 파일을 복원합니다. 계획 파일은 공개 저장소에 올리지 마세요."),
      h("input", { type: "file", accept: ".json,application/json", "aria-label": "JSON 파일",
        onchange: async e => { const f = e.target.files[0]; if (f) { text = await f.text(); ta.value = text; } } }),
      ta, err,
      h("div", { class: "dlg-actions" },
        h("button", { class: "btn ghost", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "닫기"),
        h("button", { class: "btn", type: "button", onclick: () => runImport(text) }, "가져오기")),
      sources.size > 0 && h("div", {},
        h("h4", {}, "가져온 계획"),
        h("ul", { class: "imports" }, [...sources].map(([s, n]) => h("li", {},
          h("span", {}, s), h("span", { class: "n" }, `${n}개`),
          h("button", { class: "btn danger", type: "button", onclick: async () => {
            if (!confirm(`"${s}"에서 가져온 항목 ${n}개를 모두 삭제할까요? 그 항목에 남긴 체크와 코멘트도 지워집니다.`)) return;
            await act(store.removeMany(items.filter(i => i.src === s).map(i => i.id)));
            fill();
          } }, "모두 삭제"))))));
  };
  const runImport = async t => {
    err.textContent = "";
    let list;
    try { list = parsePlan(t); } catch (e) { err.textContent = "가져올 수 없습니다: " + e.message; return; }
    if (list[0].backup) {
      if (!confirm(`백업에서 ${list.length}개 항목을 복원할까요?\n같은 항목은 백업 내용으로 덮어쓰고, 백업 뒤에 새로 만든 항목은 그대로 둡니다.`)) return;
      try { await store.addMany(list); } catch (e) { err.textContent = "복원하지 못했습니다: " + (e.code || e.message); return; }
      dlg.close(); dlg.remove();
      toast(`${list.length}개 항목을 복원했습니다.`);
      return;
    }
    const src = list[0].data.src;
    const count = k => list.filter(r => r.data.kind === k).length;
    const old = items.filter(i => i.src === src);
    const msg = `"${src}": 마일스톤 ${count("milestone")}, 월간 ${count("month")}, 주간 ${count("week")}, 일간 ${count("day")}개를 가져올까요?`
      + (old.length ? `\n\n같은 계획에서 이미 가져온 항목 ${old.length}개가 있습니다. 계속하면 그 항목을 지우고 새로 넣습니다. 그 항목에 남긴 체크와 코멘트도 지워집니다.` : "");
    if (!confirm(msg)) return;
    try {
      if (old.length) await store.removeMany(old.map(i => i.id));
      await store.addMany(list);
    } catch (e) { err.textContent = "저장하지 못했습니다: " + (e.code || e.message); return; }
    dlg.close(); dlg.remove();
    toast(`${list.length}개 항목을 가져왔습니다.`);
  };
  fill();
  document.body.append(dlg);
  dlg.showModal();
}

function viewGate() {
  if (state === "loading") return h("div", { class: "gate" }, h("p", {}, "불러오는 중…"));
  if (state === "signedOut")
    return h("div", { class: "gate" },
      h("h1", {}, "Research Planner"),
      h("p", {}, "개인용 페이지입니다. 로그인해 주세요."),
      h("button", { class: "btn big", type: "button", onclick: login }, "Google 계정으로 로그인"));
  if (state === "denied")
    return h("div", { class: "gate" },
      h("h1", {}, "접근 권한 없음"),
      h("p", {}, `${auth.currentUser.email} 계정은 이 페이지를 사용할 수 없습니다.`),
      h("button", { class: "btn big", type: "button", onclick: logout }, "다른 계정으로 로그인"));
  return h("div", { class: "gate" },
    h("h1", {}, "오류"),
    h("p", {}, errorMsg),
    h("button", { class: "btn big", type: "button", onclick: () => location.reload() }, "새로고침"));
}

function viewPlanner() {
  const monthKey = ymKey(viewY, viewM);
  const isCurMonth = monthKey === ymKey(today.getFullYear(), today.getMonth());
  const shift = n => {
    const d = new Date(viewY, viewM + n, 1);
    viewY = d.getFullYear(); viewM = d.getMonth();
    const t = ymd(today);
    selDay = t.startsWith(ymKey(viewY, viewM)) ? t : ymd(d);   // 달력: 이번 달이면 오늘, 아니면 1일
    render();
  };
  const setTab = k => { tab = k; history.replaceState(null, "", "#" + k); render(); };

  const monthly = ["goals", "calendar", "gantt"].includes(tab);
  const TITLES = { papers: "원고", library: "문헌", lab: "실험 기록", review: "주간 회고" };
  const main = h("main", {},
    h("div", { class: "topline" },
      monthly
        ? h("div", { class: "month-nav" },
            h("button", { class: "nav-btn", type: "button", "aria-label": "이전 달", onclick: () => shift(-1) }, "‹"),
            h("div", { class: "m" }, `${viewY}년 ${viewM + 1}월`),
            h("button", { class: "nav-btn", type: "button", "aria-label": "다음 달", onclick: () => shift(1) }, "›"),
            h("input", { type: "date", class: "jump", value: selDay, "aria-label": "날짜로 이동", title: "날짜로 이동",
              onchange: e => { const v = e.target.value; if (v && v >= "1900") pickDay(v); } }),
            !isCurMonth && h("button", { class: "btn ghost", type: "button", onclick: () => {
              viewY = today.getFullYear(); viewM = today.getMonth(); selDay = ymd(today); render(); } }, "이번 달"))
        : h("div", { class: "month-nav" }, h("div", { class: "m solo" }, TITLES[tab])),
      searchBox()),
    deadlineBar(),
    h("div", { class: "tabs", role: "tablist" },
      TABS.map(([k, label]) => h("button", { type: "button", role: "tab", "aria-selected": String(tab === k && !query.trim()),
                                             onclick: () => { query = ""; setTab(k); } }, label))),
    query.trim() ? viewSearch()
      : tab === "calendar" ? viewCalendar() : tab === "gantt" ? viewGantt()
      : tab === "papers" ? viewPapers() : tab === "library" ? viewLibrary() : tab === "lab" ? viewLab() : tab === "review" ? viewReview() : viewGoals());

  return h("div", { class: "wrap" }, milestonePanel(), main);
}

function viewGoals() {
  const monthKey = ymKey(viewY, viewM);
  const curMonth = ymKey(today.getFullYear(), today.getMonth());
  const curWeek = ymd(mondayOf(today));
  const mGoals = items.filter(i => i.kind === "month" && i.period === monthKey).sort(byCreated);
  const weeks = weeksOf(viewY, viewM);
  const wGoalsOf = wk => items.filter(i => i.kind === "week" && i.period === wk).sort(byCreated);
  const allW = weeks.flatMap(wGoalsOf);
  const allD = items.filter(i => i.kind === "day" && i.period.startsWith(monthKey));
  const nDone = list => list.filter(i => i.done).length;
  const stat = (k, list) => h("div", { class: "stat" }, h("div", { class: "k" }, k),
    h("div", { class: "v" }, `${nDone(list)} / ${list.length}`), bar(nDone(list), list.length));

  const mUndone = mGoals.filter(i => !i.done);
  const nextMonth = (() => { const d = new Date(viewY, viewM + 1, 1); return ymKey(d.getFullYear(), d.getMonth()); })();

  return h("div", {},
    h("div", { class: "stats" }, stat("월간 목표", mGoals), stat("주간 목표", allW), stat("일간 목표", allD)),

    dayList(selDay, `${relDay(selDay)} · ${dayLabel(parseYmd(selDay))}`, dayStrip()),

    h("section", {},
      h("h2", {}, "월간 목표"),
      mGoals.length ? h("ul", { class: "items" }, mGoals.map(it => itemRow(it, { parents: milestoneOptions(it) })))
                    : h("p", { class: "empty" }, "아직 이 달의 목표가 없습니다."),
      adder("am:" + monthKey, "+ 월간 목표 추가 (Enter)", () => ({ kind: "month", period: monthKey, parent: "" })),
      mUndone.length > 0 && monthKey <= curMonth &&
        h("button", { class: "link", type: "button", onclick: () => {
          if (confirm(`미완료 월간 목표 ${mUndone.length}개를 ${fmtYm(nextMonth)}로 옮길까요?`))
            act(store.updateMany(mUndone.map(i => i.id), { period: nextMonth }));
        } }, `미완료 ${mUndone.length}개 → 다음 달로`)),

    h("section", {},
      h("h2", {}, "주간 목표"),
      weeks.map(wk => weekCard(wk, wGoalsOf(wk), mGoals, curWeek))));
}

// 하루치 일간 목표 목록 (목표 탭의 "오늘", 달력 탭에서 고른 날)
const relDay = key => { const n = daysTo(key); return n === 0 ? "오늘" : n === 1 ? "내일" : n === -1 ? "어제" : n > 0 ? `${n}일 후` : `${-n}일 전`; };
// 고른 날을 바꾸고, 보고 있는 달도 그 날짜의 달로 맞춤
function setDay(key) {
  if (!key) return;
  selDay = key;
  const d = parseYmd(key);
  viewY = d.getFullYear(); viewM = d.getMonth();
  render();
}
// 목표 탭의 날짜 슬라이더: 앞뒤 반년치 날짜를 한 줄로 이어 붙이고 7일씩 보여줌.
// 밀거나 화살표를 누르면 부드럽게 움직이고 주 단위(월요일)에서 멈춤. 다시 그려도 보던 자리를 유지.
let stripLeft = null;            // 슬라이더 왼쪽 끝에 보이던 날짜
let stripGoto = null;            // 다음에 그릴 때 부드럽게 보여줄 날짜
const pitchOf = track => { const a = track.children[0], b = track.children[1]; return a && b ? b.offsetLeft - a.offsetLeft : 0; };
function pickDay(key) { stripGoto = key; setDay(key); }
// 부드럽게 이동. 부드러운 스크롤이 안 되는 환경(동작 줄이기 설정 등)이면 바로 이동
function glide(track, left) {
  const from = track.scrollLeft;
  if (Math.abs(left - from) < 1) return;
  track.scrollTo({ left, behavior: "smooth" });
  setTimeout(() => { if (Math.abs(track.scrollLeft - from) < 1) track.scrollLeft = left; }, 600);
}

function dayStrip() {
  const todayKey = ymd(new Date());
  const [lo, hi] = [todayKey, selDay].sort();
  const start = addDays(mondayOf(parseYmd(lo)), -7 * 26), end = addDays(mondayOf(parseYmd(hi)), 7 * 27 - 1);
  const counts = new Map();
  for (const i of items) if (i.kind === "day") {
    const c = counts.get(i.period) || [0, 0];
    c[0]++; if (i.done) c[1]++;
    counts.set(i.period, c);
  }
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const label = h("span", { class: "ds-label", "aria-live": "polite" });
  const track = h("div", { class: "ds-track", role: "listbox", "aria-label": "날짜 고르기", tabindex: "0",
      onkeydown: e => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        pickDay(ymd(addDays(parseYmd(selDay), e.key === "ArrowRight" ? 1 : -1)));
      } },
    days.map(d => {
      const k = ymd(d), c = counts.get(k);
      return h("button", { type: "button", role: "option", "aria-selected": String(k === selDay), dataset: { d: k },
          class: "ds" + (k === selDay ? " sel" : "") + (k === todayKey ? " today" : "") + (k < todayKey ? " past" : "")
               + (d.getDay() === 1 ? " mon" : "") + (d.getDay() % 6 === 0 ? " we" : "") + (d.getDate() === 1 ? " first" : ""),
          title: dayLabel(d) + (c ? ` · 일간 목표 ${c[1]}/${c[0]}` : ""),
          onclick: () => pickDay(k) },
        h("span", { class: "wd" }, d.getDate() === 1 ? `${d.getMonth() + 1}월` : WD[d.getDay()]),
        h("span", { class: "dn" }, String(d.getDate())),
        h("span", { class: "dots" }, c ? Array.from({ length: Math.min(3, c[0]) }, (_, j) => h("i", { class: j < c[1] ? "on" : "" })) : null));
    }));
  let p = 0;                       // 하루 칸의 간격(px)
  // 왼쪽 끝 위치를 기억하고 위쪽에 보고 있는 달·주차 표시
  const show = left => {
    const d = addDays(start, Math.max(0, Math.round(left / p)));
    stripLeft = ymd(d);
    const th = addDays(mondayOf(d), 3);
    label.textContent = `${th.getFullYear()}년 ${th.getMonth() + 1}월 · W${pad(isoWeek(mondayOf(d)))}`;
  };
  const go = left => { glide(track, left); show(left); };
  const slide = n => { if (p) go(track.scrollLeft + n * 7 * p); };

  postRender.push(() => {
    p = pitchOf(track);
    if (!p) return;
    const idx = k => Math.round((parseYmd(k) - start) / 864e5);
    // 이전에 보던 자리로 바로 돌려놓고, 새로 고른 날이 있으면 그 주로 부드럽게 이동
    track.scrollLeft = idx(stripLeft || ymd(mondayOf(parseYmd(selDay)))) * p;
    show(track.scrollLeft);
    track.addEventListener("scroll", () => show(track.scrollLeft), { passive: true });
    if (stripGoto) {
      const target = idx(ymd(mondayOf(parseYmd(stripGoto)))) * p;
      stripGoto = null;
      go(target);
    }
  });

  return h("div", { class: "daystrip" },
    h("div", { class: "ds-head" }, label,
      selDay !== todayKey && h("button", { class: "link", type: "button", onclick: () => pickDay(todayKey) }, "오늘로")),
    h("div", { class: "ds-row" },
      h("button", { class: "ds-arrow", type: "button", "aria-label": "이전 주", onclick: () => slide(-1) }, "‹"),
      track,
      h("button", { class: "ds-arrow", type: "button", "aria-label": "다음 주", onclick: () => slide(1) }, "›")));
}

function dayList(key, heading, top) {
  const d = parseYmd(key), wk = ymd(mondayOf(d));
  const list = items.filter(i => i.kind === "day" && i.period === key).sort(byCreated);
  const parents = items.filter(i => i.kind === "week" && i.period === wk).sort(byCreated)
                       .map(g => ({ id: g.id, title: g.title }));
  const undone = list.filter(i => !i.done);
  const next = ymd(addDays(d, 1));
  return h("section", {},
    h("h2", {}, heading),
    top,
    list.length ? h("ul", { class: "items" }, list.map(it => itemRow(it, { parents, parentLabel: "주간 목표" })))
                : h("p", { class: "empty" }, "일간 목표가 없습니다."),
    adder("ad:" + key, "+ 일간 목표 추가 (Enter)", () => ({ kind: "day", period: key, parent: "" })),
    undone.length > 0 && key <= ymd(today) &&
      h("button", { class: "link", type: "button", onclick: () => {
        if (confirm(`미완료 일간 목표 ${undone.length}개를 ${md(addDays(d, 1))}로 옮길까요?`))
          act(store.updateMany(undone.map(i => i.id), { period: next }));
      } }, `미완료 ${undone.length}개 → 다음 날로`));
}

function viewCalendar() {
  const first = new Date(viewY, viewM, 1), last = new Date(viewY, viewM + 1, 0);
  const todayKey = ymd(today);
  const byDay = new Map();
  for (const i of items) if (i.kind === "day") {
    if (!byDay.has(i.period)) byDay.set(i.period, []);
    byDay.get(i.period).push(i);
  }
  const rows = [];
  for (let mon = mondayOf(first); mon <= last; mon = addDays(mon, 7)) rows.push(mon);

  const head = h("div", { class: "cal-row cal-head" },
    h("div", {}),
    [..."월화수목금토일"].map((w, k) => h("div", { class: k >= 5 ? "we" : "" }, w)));

  const row = mon => {
    const wg = items.filter(i => i.kind === "week" && i.period === ymd(mon));
    const wd = wg.filter(i => i.done).length;
    return h("div", { class: "cal-row" },
      h("div", { class: "cal-wk", title: wg.length ? `주간 목표 ${wd}/${wg.length}` : null },
        h("b", {}, "W" + pad(isoWeek(mon))),
        wg.length > 0 && h("small", {}, `${wd}/${wg.length}`)),
      [0, 1, 2, 3, 4, 5, 6].map(k => {
        const d = addDays(mon, k), key = ymd(d);
        const list = (byDay.get(key) || []).sort(byCreated);
        const nd = list.filter(i => i.done).length;
        return h("button", {
            type: "button",
            class: "cal-day" + (d.getMonth() !== viewM ? " out" : "") + (key === todayKey ? " today" : "")
                 + (key === selDay ? " sel" : "") + (k >= 5 ? " we" : ""),
            "aria-label": `${dayLabel(d)}, 일간 목표 ${list.length}개`, "aria-pressed": String(key === selDay),
            onclick: () => { selDay = key; render(); } },
          h("span", { class: "top-line" },
            h("span", { class: "dn" }, d.getDate()),
            list.length > 0 && h("span", { class: "dc" + (nd === list.length ? " all" : "") }, `${nd}/${list.length}`)),
          list.slice(0, 3).map(i => h("span", { class: "dt" + (i.done ? " done" : "") }, i.title)),
          list.length > 3 && h("span", { class: "more" }, `+${list.length - 3}`));
      }));
  };

  return h("div", {},
    h("div", { class: "cal" }, head, rows.map(row)),
    dayList(selDay, dayLabel(parseYmd(selDay)) + " 일간 목표"));
}

function viewGantt() {
  // 보고 있는 달의 전 달부터 6개월
  const r0 = new Date(viewY, viewM - 1, 1), r1 = new Date(viewY, viewM + 5, 0);
  const total = Math.round((r1 - r0) / 864e5) + 1;
  const pos = d => Math.round((d - r0) / 864e5);
  const pct = n => (n / total * 100).toFixed(3) + "%";
  const span = (s, e) => {               // s, e: Date (양 끝 포함)
    const a = pos(s), b = pos(e);
    if (b < 0 || a > total - 1 || b < a) return null;
    const ca = Math.max(0, a), cb = Math.min(total - 1, b);
    return { left: pct(ca), width: pct(cb - ca + 1), clipL: a < 0, clipR: b > total - 1 };
  };
  const todayKey = ymd(today);
  const byPeriod = (a, b) => a.period < b.period ? -1 : a.period > b.period ? 1 : byCreated(a, b);

  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(viewY, viewM - 1 + i, 1);
    months.push({ d, days: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() });
  }
  const head = h("div", { class: "g-row g-head" },
    h("div", { class: "g-label" }, "기간"),
    h("div", { class: "g-track" },
      h("div", { class: "g-months" }, months.map(({ d, days }, i) =>
        h("div", { class: d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() ? "cur" : "",
                   style: `width:${pct(days)}` },
          (i === 0 || d.getMonth() === 0 ? `${d.getFullYear()}.` : "") + `${d.getMonth() + 1}월`)))));

  // 월 경계선 + 오늘 선
  let acc = 0;
  const lines = months.slice(0, -1).map(({ days }) => { acc += days; return h("i", { style: `left:${pct(acc)}` }); });
  const tp = pos(today);
  const grid = h("div", { class: "g-grid" }, lines,
    tp >= 0 && tp < total && h("i", { class: "today", style: `left:${pct(tp + .5)}`, title: "오늘" }));

  const barBtn = (cls, sp, title, onclick, fill) => h("button", {
      type: "button", title, "aria-label": title, onclick,
      class: `g-bar ${cls}` + (sp.clipL ? " clip-l" : "") + (sp.clipR ? " clip-r" : ""),
      style: `left:${sp.left};width:${sp.width}` },
    fill != null && h("i", { style: `width:${Math.round(fill * 100)}%` }));

  const goMonthGoal = g => {
    const [y, m] = g.period.split("-").map(Number);
    viewY = y; viewM = m - 1; tab = "goals"; history.replaceState(null, "", "#goals");
    openIds.add(g.id); render();
    const el = document.querySelector(`main [data-id="${g.id}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const subRow = g => {
    const sp = span(parseYmd(g.period + "-01"), parseYmd(monthEnd(g.period)));
    return h("div", { class: "g-row sub" },
      h("div", { class: "g-label", title: g.title }, (g.done ? "✓ " : "") + g.title),
      h("div", { class: "g-track" },
        sp && barBtn("small" + (g.done ? " done" : ""), sp, `${g.title} · ${fmtYm(g.period)}`, () => goMonthGoal(g))));
  };

  const shown = items.filter(i => i.kind === "milestone" && (!i.done || showDoneMs))
                     .sort((a, b) => msStart(a) < msStart(b) ? -1 : msStart(a) > msStart(b) ? 1 : byCreated(a, b));
  const r0k = ymKey(r0.getFullYear(), r0.getMonth()), r1k = ymKey(r1.getFullYear(), r1.getMonth());
  const inRange = g => g.period >= r0k && g.period <= r1k;
  const monthGoals = items.filter(i => i.kind === "month");
  const groups = [];
  let outside = 0;
  for (const m of shown) {
    const s = msStart(m), e = msEnd(m);
    const sp = span(parseYmd(s), parseYmd(e || s));
    if (!sp) { outside++; continue; }       // 보이는 6개월과 겹치지 않는 마일스톤은 숨김
    groups.push({ m, s, e, sp, kids: monthGoals.filter(g => g.parent === m.id).sort(byPeriod) });
  }
  const setFolded = ids => { ganttFolded = new Set(ids); saveFolded(); render(); };

  const rows = [];
  for (const { m, s, e, sp, kids } of groups) {
    const k = kids.filter(g => g.done).length;
    const late = !m.done && e && e < todayKey;
    const visKids = kids.filter(inRange);
    const folded = ganttFolded.has(m.id);
    const label = `${m.title} · ${shortYmd(s)} → ${e ? shortYmd(e) : "마감일 미정"}`
                + (kids.length ? ` · 월간 목표 ${k}/${kids.length}` : "");
    rows.push(h("div", { class: "g-row ms-row" },
      h("div", { class: "g-label" },
        h("button", { type: "button", class: "g-fold" + (visKids.length ? "" : " none"),
                      "aria-expanded": String(!folded), "aria-label": folded ? "월간 목표 펼치기" : "월간 목표 접기",
                      onclick: () => { folded ? ganttFolded.delete(m.id) : ganttFolded.add(m.id); saveFolded(); render(); } },
          folded ? "▸" : "▾"),
        h("span", {}, (m.done ? "✓ " : "") + m.title, visKids.length > 0 && h("span", { class: "n" }, visKids.length))),
      h("div", { class: "g-track" },
        barBtn((e ? "" : "dot") + (m.done ? " done" : late ? " late" : ""), sp, label,
               () => openMilestone(m.id), kids.length ? k / kids.length : null))));
    if (!folded) visKids.forEach(g => rows.push(subRow(g)));
  }
  // 마일스톤에 연결되지 않았거나 연결 대상이 지워진 월간 목표
  const loose = monthGoals.filter(g => inRange(g) && (!g.parent || !byId.has(g.parent))).sort(byPeriod);
  if (loose.length) {
    rows.push(h("div", { class: "g-row group" }, h("div", { class: "g-label" }, "연결 없는 월간 목표"), h("div", { class: "g-track" })));
    loose.forEach(g => rows.push(subRow(g)));
  }

  return h("div", {},
    groups.length > 0 && h("div", { class: "g-tools" },
      h("button", { class: "link", type: "button", onclick: () => setFolded([]) }, "모두 펼치기"),
      h("button", { class: "link", type: "button", onclick: () => setFolded(groups.map(g => g.m.id)) }, "모두 접기")),
    rows.length
      ? h("div", { class: "gantt-wrap" }, h("div", { class: "gantt" }, head, rows, grid))
      : h("p", { class: "empty" }, "이 기간에 표시할 마일스톤이 없습니다. 마일스톤에 시작일·마감일을 정하거나 위에서 달을 옮겨 보세요."),
    outside > 0 && h("p", { class: "empty" }, `이 6개월과 겹치지 않는 마일스톤 ${outside}개는 숨겼습니다. 위에서 달을 옮기면 보입니다.`),
    h("div", { class: "g-legend" },
      h("span", {}, h("i", {}), "진행 중 (채운 부분 = 연결된 월간 목표 달성률)"),
      h("span", {}, h("i", { class: "done" }), "완료"),
      h("span", {}, h("i", { class: "late" }), "마감 지남"),
      h("span", {}, h("i", { class: "today" }), "오늘")),
    h("p", { class: "empty" }, "막대를 누르면 해당 항목이 열립니다. 마일스톤 기간은 왼쪽 목록에서 항목을 펼쳐 수정하세요."));
}

function openMilestone(id) {
  const m = byId.get(id);
  if (m && m.done) showDoneMs = true;
  openIds.add(id); render();
  const el = document.querySelector(`.ms [data-id="${id}"]`);
  if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function weekCard(wk, goals, mGoals, curWeek) {
  const mon = parseYmd(wk), sun = addDays(mon, 6);
  const done = goals.filter(i => i.done).length;
  const undone = goals.filter(i => !i.done);
  const next = ymd(addDays(mon, 7));
  const parentOpts = mGoals.map(g => ({ id: g.id, title: g.title }));
  return h("article", { class: "week" + (wk === curWeek ? " now" : wk < curWeek ? " past" : "") },
    h("header", {},
      h("span", { class: "wn" }, "W" + pad(isoWeek(mon))),
      h("span", { class: "wr" }, `${md(mon)} – ${md(sun)}`),
      wk === curWeek && h("span", { class: "badge" }, "이번 주"),
      h("span", { class: "wp" }, `${done}/${goals.length}`)),
    goals.length > 0 && bar(done, goals.length),
    goals.length > 0 && h("ul", { class: "items" }, goals.map(it => itemRow(it, { parents: parentOpts, parentLabel: "월간 목표" }))),
    adder("aw:" + wk, "+ 주간 목표 추가 (Enter)", () => ({ kind: "week", period: wk, parent: "" })),
    undone.length > 0 && wk <= curWeek &&
      h("button", { class: "link", type: "button", onclick: () => {
        if (confirm(`미완료 주간 목표 ${undone.length}개를 다음 주(${md(addDays(mon, 7))}~)로 옮길까요?`))
          act(store.updateMany(undone.map(i => i.id), { period: next }));
      } }, `미완료 ${undone.length}개 → 다음 주로`));
}

function milestoneOptions(it) {
  return items.filter(i => i.kind === "milestone" && (!i.done || i.id === it.parent))
              .sort(byCreated).map(m => ({ id: m.id, title: m.title }));
}

function milestonePanel() {
  const ms = items.filter(i => i.kind === "milestone");
  const order = (a, b) => (msEnd(a) || "9999") < (msEnd(b) || "9999") ? -1
                        : (msEnd(a) || "9999") > (msEnd(b) || "9999") ? 1 : byCreated(a, b);
  const active = ms.filter(m => !m.done).sort(order);
  const done = ms.filter(m => m.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const row = m => {
    const kids = items.filter(i => i.kind === "month" && i.parent === m.id);
    const k = kids.filter(i => i.done).length;
    return itemRow(m, {
      milestone: true,
      meta: msEnd(m) && h("span", { class: "when", title: "마감일 " + msEnd(m) }, "~" + shortYmd(msEnd(m))),
      after: kids.length > 0 && h("div", { class: "ms-bar", title: `연결된 월간 목표 ${k}/${kids.length} 완료` }, bar(k, kids.length))
    });
  };
  return h("aside", { class: "ms" },
    h("h2", {}, "Milestones"),
    active.length ? h("ul", { class: "items" }, active.map(row))
                  : h("p", { class: "empty" }, "장기 목표를 추가해 보세요."),
    adder("ams", "+ 마일스톤 추가 (Enter)", () => ({ kind: "milestone", period: "", parent: "", start: ymd(new Date()), end: "" })),
    done.length > 0 && h("div", {},
      h("button", { class: "link", type: "button", "aria-expanded": String(showDoneMs),
                    onclick: () => { showDoneMs = !showDoneMs; render(); } },
        (showDoneMs ? "▾ " : "▸ ") + `완료된 마일스톤 ${done.length}`),
      showDoneMs && h("ul", { class: "items" }, done.map(row))),
    tagCloud());
}

/* ------------------------------------------------------------------ one item */
function toggleOpen(id) { openIds.has(id) ? openIds.delete(id) : openIds.add(id); render(); }

function itemRow(it, o = {}) {
  const open = openIds.has(it.id);
  const parent = it.parent && byId.get(it.parent);
  const nC = (it.comments || []).length, nA = (it.attachments || []).length;
  const nK = (it.checks || []).length, nKd = (it.checks || []).filter(c => c.done).length;
  return h("li", { class: "item" + (it.done ? " done" : "") + (open ? " open" : ""), dataset: { id: it.id } },
    h("div", { class: "row" },
      h("input", { type: "checkbox", checked: !!it.done, "aria-label": "완료 표시",
        onchange: e => act(store.update(it.id, { done: e.target.checked, doneAt: e.target.checked ? Date.now() : null })) }),
      h("button", { class: "title", type: "button", "aria-expanded": String(open), onclick: () => toggleOpen(it.id) },
        it.title || "(제목 없음)"),
      parent && h("span", { class: "chip", title: parent.title }, "↳ " + parent.title),
      o.meta,
      it.kind !== "milestone" && dueChip(it),
      (it.repeat || it.repeatOf) && h("span", { class: "when", title: "반복" }, "↻"),
      nK > 0 && h("span", { class: "when", title: "체크 항목" }, `☑ ${nKd}/${nK}`),
      nA > 0 && h("button", { class: "cnt has", type: "button", title: "첨부 파일",
                              "aria-label": `첨부 파일 ${nA}개`, onclick: () => toggleOpen(it.id) },
        svg(ICON_CLIP), String(nA)),
      h("button", { class: "cnt" + (nC ? " has" : ""), type: "button", title: "코멘트",
                    "aria-label": `코멘트 ${nC}개`, onclick: () => toggleOpen(it.id) },
        svg(ICON_NOTE), nC ? String(nC) : "")),
    o.after,
    open && detail(it, o));
}

function detail(it, o) {
  const tKey = "t:" + it.id, cKey = "c:" + it.id;
  const commitTitle = () => {
    if (!drafts.has(tKey)) return;
    const t = drafts.get(tKey).trim(); drafts.delete(tKey);
    const cur = byId.get(it.id);
    if (t && cur && t !== cur.title) act(store.update(it.id, { title: t }));
    else render();
  };
  const fields = h("div", { class: "fields" },
    h("input", { class: "edit", "aria-label": "제목", dataset: { fk: tKey },
      value: drafts.has(tKey) ? drafts.get(tKey) : it.title,
      oninput: e => drafts.set(tKey, e.target.value),
      onkeydown: e => {
        if (typing(e)) return;
        if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
        if (e.key === "Escape") { drafts.delete(tKey); render(); }
      },
      onblur: commitTitle }),
    o.milestone
      ? [h("label", {}, "시작",
          h("input", { type: "date", value: msStart(it),
            onchange: e => {
              const v = e.target.value, end = msEnd(it);
              if (v && v < "1900") return;              // 연도를 입력하는 중
              if (!v) return render();
              if (end && v > end) { toast("시작일이 마감일보다 늦습니다."); return render(); }
              act(store.update(it.id, { start: v }));
            } })),
         h("label", {}, "마감",
          h("input", { type: "date", value: msEnd(it),
            onchange: e => {
              const v = e.target.value;
              if (v && v < "1900") return;
              if (v && v < msStart(it)) { toast("마감일이 시작일보다 빠릅니다."); return render(); }
              act(store.update(it.id, { end: v, period: v ? v.slice(0, 7) : "" }));
            } }))]
      : o.parents && h("label", {}, o.parentLabel || "마일스톤",
          h("select", { onchange: e => act(store.update(it.id, { parent: e.target.value })) },
            h("option", { value: "", selected: !it.parent }, "— 연결 없음"),
            o.parents.map(p => h("option", { value: p.id, selected: p.id === it.parent }, p.title)))),
    h("button", { class: "btn danger", type: "button", onclick: () => {
      const att = (it.attachments || []).length ? " 첨부 파일은 Google Drive에 그대로 남습니다." : "";
      if (confirm(`"${it.title}" 항목을 삭제할까요? 코멘트도 함께 지워집니다.${att}`)) {
        openIds.delete(it.id); act(store.remove(it.id));
        const tp = it.repeatOf && byId.get(it.repeatOf);   // 반복으로 만든 항목이면 이 기간은 다시 만들지 않음
        if (tp) act(store.update(tp.id, { repeatSkip: [...(tp.repeatSkip || []), it.period] }));
      }
    } }, "삭제"));

  const comments = (it.comments || []).slice().sort((a, b) => a.at - b.at);
  const addComment = () => {
    const text = (drafts.get(cKey) || "").trim();
    if (!text) return;
    drafts.delete(cKey);
    const cur = byId.get(it.id) || it;
    act(store.update(it.id, { comments: [...(cur.comments || []), { id: rid(), text, at: Date.now() }] }));
  };
  return h("div", { class: "detail" + (o.paper || o.sample || o.ref ? " form" : ""),
      ondragover: e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); e.currentTarget.classList.add("drop"); } },
      ondragleave: e => e.currentTarget.classList.remove("drop"),
      ondrop: e => {
        e.preventDefault(); e.currentTarget.classList.remove("drop");
        const files = [...(e.dataTransfer.files || [])];
        if (!files.length) return;
        if (!driveReady()) return toast("먼저 'Google Drive 연결'을 눌러 주세요.");
        uploadFiles(it.id, files);
      } },
    fields,
    o.paper && paperFields(it),
    o.ref && refFields(it),
    o.paper && cvFillField(it),
    o.sample && sampleFields(it),
    extraFields(it, o),
    checklist(it),
    linkedSamples(it),
    attachments(it),
    comments.length > 0 && h("ol", { class: "comments" }, comments.map(c =>
      h("li", {},
        h("div", { class: "meta" },
          h("time", { datetime: new Date(c.at).toISOString() }, fmtWhen(c.at)),
          h("button", { class: "x", type: "button", onclick: () => {
            if (!confirm("이 코멘트를 삭제할까요?")) return;
            const cur = byId.get(it.id) || it;
            act(store.update(it.id, { comments: (cur.comments || []).filter(x => x.id !== c.id) }));
          } }, "삭제")),
        h("p", {}, linkify(c.text))))),
    h("div", { class: "compose" },
      h("textarea", { rows: 2, placeholder: "코멘트 (Ctrl+Enter로 추가)", "aria-label": "코멘트", dataset: { fk: cKey },
        value: drafts.get(cKey) || "",
        oninput: e => drafts.set(cKey, e.target.value),
        onkeydown: e => {
          if (!typing(e) && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addComment(); }
        } }),
      h("button", { class: "btn", type: "button", onclick: addComment }, "추가")));
}

// 링크는 https 만 (가져온 파일 등에 이상한 주소가 섞여도 실행되지 않게)
const safeHref = u => /^https:\/\/[^\s"<>]+$/i.test(u || "") ? u : null;

// 코멘트 안의 주소를 링크로
function linkify(text) {
  return text.split(/(https?:\/\/[^\s<>"]+)/g).map((part, i) =>
    i % 2 ? h("a", { href: part, target: "_blank", rel: "noopener noreferrer" }, part) : part);
}

/* ------------------------------------------------------------------ Google Drive 첨부
 * 파일은 본인 Google Drive 의 "Research Planner" 폴더에 올라가고, 플래너(Firestore)에는 이름과 링크만 저장됩니다.
 * 권한은 drive.file: 이 플래너가 올린 파일에만 접근합니다(Drive 의 다른 파일은 못 봄).
 * 접근 토큰은 약 1시간 유효하고, 이 탭의 sessionStorage 에만 둡니다.
 * 필요한 설정: Google Cloud 콘솔에서 이 Firebase 프로젝트의 "Google Drive API" 사용 설정.
 */
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FOLDER = "Research Planner";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UP = "https://www.googleapis.com/upload/drive/v3/files";
const MAX_MB = 100;
let drive = null, driveFolder = null;
try { drive = JSON.parse(sessionStorage.getItem("planner-drive")); } catch (e) {}
const uploading = new Map();            // 항목 id → 올리는 중인 파일 이름들

const driveReady = () => DEMO || !!(drive && Date.now() < drive.exp);
function forgetDrive() { drive = null; try { sessionStorage.removeItem("planner-drive"); } catch (e) {} }

async function connectDrive() {
  if (DEMO) { render(); return; }
  try {
    const p = new GoogleAuthProvider();
    p.addScope(DRIVE_SCOPE);
    p.setCustomParameters({ login_hint: auth.currentUser.email });
    const res = await reauthenticateWithPopup(auth.currentUser, p);
    const cred = GoogleAuthProvider.credentialFromResult(res);
    if (!cred || !cred.accessToken) throw new Error("권한을 받지 못했습니다.");
    drive = { token: cred.accessToken, exp: Date.now() + 50 * 60e3 };
    try { sessionStorage.setItem("planner-drive", JSON.stringify(drive)); } catch (e) {}
    toast("Google Drive에 연결했습니다.");
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request")
      toast("Drive 연결 실패: " + (e.code || e.message));
  }
  render();
}

async function driveFetch(url, opt = {}) {
  if (!driveReady()) { forgetDrive(); throw new Error("Drive 연결이 만료되었습니다. 다시 연결해 주세요."); }
  const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + drive.token } });
  if (r.status === 401) { forgetDrive(); throw new Error("Drive 연결이 만료되었습니다. 다시 연결해 주세요."); }
  if (!r.ok) {
    let msg = "HTTP " + r.status;
    try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
    if (/has not been used|is disabled|accessNotConfigured/i.test(msg)) msg = "Google Cloud에서 Drive API가 아직 켜져 있지 않습니다.";
    throw new Error(msg);
  }
  return r;
}

async function driveFolderId() {
  if (driveFolder) return driveFolder;
  const q = encodeURIComponent(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await (await driveFetch(`${DRIVE_API}?q=${q}&fields=files(id)&spaces=drive`)).json();
  if (found.files && found.files.length) return (driveFolder = found.files[0].id);
  const made = await (await driveFetch(`${DRIVE_API}?fields=id`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: "application/vnd.google-apps.folder" }) })).json();
  return (driveFolder = made.id);
}

async function driveUpload(file) {
  const meta = { name: file.name, parents: [await driveFolderId()] };
  const type = file.type || "application/octet-stream";
  const fields = "id,name,mimeType,size,webViewLink";
  if (file.size <= 5 * 1024 * 1024) {             // 작은 파일: 한 번에
    const b = "rp" + rid();
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
      + `--${b}\r\nContent-Type: ${type}\r\n\r\n`, file, `\r\n--${b}--`]);
    return (await driveFetch(`${DRIVE_UP}?uploadType=multipart&fields=${fields}`, {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body })).json();
  }
  // 큰 파일: 업로드 세션을 열고 그 주소로 보냄
  const init = await driveFetch(`${DRIVE_UP}?uploadType=resumable&fields=${fields}`, {
    method: "POST", body: JSON.stringify(meta),
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": type, "X-Upload-Content-Length": String(file.size) } });
  const loc = init.headers.get("Location");
  if (!loc) throw new Error("큰 파일 업로드를 시작하지 못했습니다. Drive에 직접 올린 뒤 코멘트에 링크를 붙여 주세요.");
  const put = await fetch(loc, { method: "PUT", headers: { "Content-Type": type }, body: file });
  if (!put.ok) throw new Error("업로드 실패 (HTTP " + put.status + ")");
  return put.json();
}

async function uploadFiles(id, files) {
  const big = files.find(f => f.size > MAX_MB * 1024 * 1024);
  if (big) return toast(`${big.name}: ${MAX_MB}MB 이하 파일만 올릴 수 있습니다.`);
  uploading.set(id, [...(uploading.get(id) || []), ...files.map(f => f.name)]);
  render();
  for (const f of files) {
    try {
      // 데모에서는 Drive 대신 이 브라우저 안의 임시 링크를 씀
      const r = DEMO ? { id: rid(), name: f.name, mimeType: f.type, size: f.size, webViewLink: URL.createObjectURL(f) } : await driveUpload(f);
      const cur = byId.get(id);
      if (cur) await store.update(id, { attachments: [...(cur.attachments || []),
        { id: r.id, name: r.name || f.name, mime: r.mimeType || f.type || "", size: +r.size || f.size, link: r.webViewLink || "", at: Date.now() }] });
    } catch (e) {
      console.error(e);
      toast(`${f.name}: ${e.message}`);
    } finally {
      const left = uploading.get(id) || [], k = left.indexOf(f.name);
      if (k >= 0) left.splice(k, 1);
      left.length ? uploading.set(id, left) : uploading.delete(id);
      render();
    }
  }
}

async function removeAttachment(it, a) {
  if (a.kind === "link") {                          // 링크로 붙인 것은 목록에서만 뺌
    if (!confirm(`"${a.name}" 링크를 뺄까요?`)) return;
    const cur = byId.get(it.id) || it;
    return act(store.update(it.id, { attachments: (cur.attachments || []).filter(x => x.id !== a.id) }));
  }
  const viaDrive = driveReady() && !DEMO;
  const msg = viaDrive
    ? `"${a.name}" 첨부를 뺄까요?\nGoogle Drive의 파일은 휴지통으로 옮겨집니다(30일 안에 복구 가능).`
    : `"${a.name}" 첨부를 목록에서 뺄까요?` + (DEMO ? "" : "\nDrive에 연결되어 있지 않아서 Drive의 파일은 그대로 남습니다.");
  if (!confirm(msg)) return;
  if (viaDrive) {
    try { await driveFetch(`${DRIVE_API}/${encodeURIComponent(a.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }); }
    catch (e) { if (!confirm(`Drive에서 파일을 옮기지 못했습니다 (${e.message}).\n목록에서만 뺄까요?`)) return; }
  }
  const cur = byId.get(it.id) || it;
  act(store.update(it.id, { attachments: (cur.attachments || []).filter(x => x.id !== a.id) }));
}

const fmtSize = n => !n ? "" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB";
function fileKind(mime, name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/")) return "IMG";
  if (mime === "application/pdf" || ext === "pdf") return "PDF";
  if (/sheet|excel|csv/.test(mime) || ["xlsx", "xls", "csv"].includes(ext)) return "XLS";
  if (/presentation|powerpoint/.test(mime) || ["pptx", "ppt"].includes(ext)) return "PPT";
  if (/word|document/.test(mime) || ["docx", "doc", "hwp", "hwpx"].includes(ext)) return "DOC";
  if (/zip|compressed/.test(mime) || ["zip", "7z", "rar"].includes(ext)) return "ZIP";
  return ext && ext.length <= 4 ? ext.toUpperCase() : "FILE";
}

function attachments(it) {
  const list = it.attachments || [], busy = uploading.get(it.id) || [];
  return h("div", { class: "atts" },
    list.length > 0 && h("ul", { class: "att-list" }, list.map(a => h("li", {},
      h("span", { class: "att-kind" }, fileKind(a.mime || "", a.name)),
      safeHref(a.link) ? h("a", { href: safeHref(a.link), target: "_blank", rel: "noopener noreferrer" }, a.name) : h("span", {}, a.name),
      h("span", { class: "att-size" }, fmtSize(a.size)),
      h("button", { class: "x", type: "button", "aria-label": `${a.name} 첨부 빼기`, onclick: () => removeAttachment(it, a) }, "삭제")))),
    busy.map(n => h("p", { class: "att-busy" }, "올리는 중… " + n)),
    driveReady()
      ? h("label", { class: "btn ghost att-pick" }, "+ 파일 첨부",
          h("input", { type: "file", multiple: true, hidden: true,
            onchange: e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) uploadFiles(it.id, fs); } }))
      : h("button", { class: "btn ghost att-pick", type: "button", onclick: connectDrive }, "Google Drive 연결해서 파일 첨부"),
    driveReady() && h("span", { class: "att-hint" }, "여기로 파일을 끌어다 놓아도 됩니다"),
    h("input", { class: "add small att-link", placeholder: "또는 링크 붙이기 (https://… Enter)", "aria-label": "링크 첨부",
      dataset: { fk: "al:" + it.id }, value: drafts.get("al:" + it.id) || "",
      oninput: e => drafts.set("al:" + it.id, e.target.value),
      onkeydown: e => {
        if (typing(e) || e.key !== "Enter") return;
        e.preventDefault();
        const url = (drafts.get("al:" + it.id) || "").trim();
        if (!safeHref(url)) return toast("https:// 로 시작하는 주소를 넣어 주세요.");
        drafts.delete("al:" + it.id);
        let name = "링크";
        try { const u = new URL(url); name = /drive\.google|docs\.google/.test(u.hostname) ? "Google Drive 파일" : (decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "") || u.hostname); } catch (err) {}
        const cur = byId.get(it.id) || it;
        act(store.update(it.id, { attachments: [...(cur.attachments || []), { id: rid(), name, link: url, kind: "link", mime: "", size: 0, at: Date.now() }] }));
      } }));
}

function adder(fk, placeholder, make) {
  return h("input", { class: "add", placeholder, "aria-label": placeholder, dataset: { fk },
    value: drafts.get(fk) || "",
    oninput: e => drafts.set(fk, e.target.value),
    onkeydown: e => {
      if (typing(e) || e.key !== "Enter") return;
      e.preventDefault();
      const title = (drafts.get(fk) || "").trim();
      if (!title) return;
      drafts.delete(fk);
      e.target.value = "";
      act(store.add({ ...make(), title, done: false, doneAt: null, comments: [], created: Date.now() }));
    } });
}

/* ------------------------------------------------------------------ 공통 도구 */
const KIND_LABEL = { milestone: "마일스톤", month: "월간", week: "주간", day: "일간", paper: "원고", ref: "문헌", sample: "실험", review: "회고" };
const STAGES = [["draft", "작성 중"], ["submitted", "투고"], ["review", "리뷰 중"], ["revision", "리비전"], ["accepted", "게재 확정"], ["published", "출판"]];
const ROLES = ["1저자", "공동 1저자", "공저자", "교신저자"];
const stageName = k => (STAGES.find(s => s[0] === k) || STAGES[0])[1];

// 글자 입력칸: 다시 그려도 쓰던 글이 남고, 칸을 벗어나거나 Enter(여러 줄은 Ctrl+Enter)를 누르면 저장
function textInput(fk, value, commit, props = {}) {
  const multi = props.rows != null;
  return h(multi ? "textarea" : "input", { ...props, dataset: { fk },
    value: drafts.has(fk) ? drafts.get(fk) : (value || ""),
    oninput: e => drafts.set(fk, e.target.value),
    onkeydown: e => {
      if (typing(e)) return;
      if (e.key === "Enter" && (!multi || e.ctrlKey || e.metaKey)) { e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape") { drafts.delete(fk); render(); }
    },
    onblur: () => {
      if (!drafts.has(fk)) return;
      const v = drafts.get(fk).trim(); drafts.delete(fk);
      if (v !== (value || "").trim()) commit(v); else render();
    } });
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ------------------------------------------------------------------ 마감일 */
const dueOf = it => it.kind === "milestone" ? msEnd(it) : (it.due || "");
const daysTo = d => Math.round((parseYmd(d) - parseYmd(ymd(new Date()))) / 864e5);
const ddText = n => n === 0 ? "D-day" : n > 0 ? `D-${n}` : `D+${-n}`;
const ddClass = n => n < 0 ? " late" : n <= 3 ? " soon" : "";

function dueChip(it) {
  const d = dueOf(it);
  if (!d || it.done) return null;
  const n = daysTo(d);
  return h("span", { class: "due" + ddClass(n), title: "마감 " + d }, ddText(n));
}

function deadlineBar() {
  const list = items.filter(i => !i.done && dueOf(i) && i.kind !== "review" && daysTo(dueOf(i)) <= 30)
                    .sort((a, b) => dueOf(a) < dueOf(b) ? -1 : dueOf(a) > dueOf(b) ? 1 : 0);
  if (!list.length && !items.some(i => dueOf(i))) return null;
  const shown = list.slice(0, 6);
  return h("div", { class: "deadlines" },
    h("span", { class: "dl-k" }, "다가오는 마감"),
    shown.length
      ? shown.map(it => { const n = daysTo(dueOf(it));
          return h("button", { type: "button", class: "dl" + ddClass(n), title: `${KIND_LABEL[it.kind]} · ${dueOf(it)}`, onclick: () => goTo(it) },
            h("b", {}, ddText(n)), it.title); })
      : h("span", { class: "dl-none" }, "30일 안에는 없음"),
    list.length > shown.length && h("span", { class: "dl-none" }, `외 ${list.length - shown.length}개`),
    h("button", { type: "button", class: "link dl-ics", title: "구글 캘린더 등에서 '가져오기'로 추가", onclick: exportIcs }, "캘린더 파일 (.ics)"));
}

function exportIcs() {
  const esc = s => String(s).replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
  const d8 = s => s.replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const ev = items.filter(i => !i.done && dueOf(i) && i.kind !== "review").map(i => {
    const d = dueOf(i), next = ymd(addDays(parseYmd(d), 1));
    return ["BEGIN:VEVENT", `UID:${i.id}@research-planner`, `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${d8(d)}`, `DTEND;VALUE=DATE:${d8(next)}`,
            `SUMMARY:${esc(`[${KIND_LABEL[i.kind]}] ${i.title}`)}`, "END:VEVENT"].join("\r\n");
  });
  if (!ev.length) return toast("마감일이 있는 항목이 없습니다.");
  download(`research-planner-${ymd(new Date())}.ics`,
    ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Research Planner//KO", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR"].join("\r\n"),
    "text/calendar");
  toast(`마감 ${ev.length}개를 캘린더 파일로 내려받았습니다.`);
}

/* ------------------------------------------------------------------ 백업 */
function exportBackup() {
  const data = { backup: 1, source: `백업 ${ymd(new Date())}`, exportedAt: new Date().toISOString(), items };
  download(`research-planner-backup-${ymd(new Date())}.json`, JSON.stringify(data, null, 1), "application/json");
  toast(`${items.length}개 항목을 백업 파일로 내려받았습니다.`);
}

/* ------------------------------------------------------------------ 검색·태그 */
const textOf = it => [it.title, ...(it.comments || []).map(c => c.text), ...(it.checks || []).map(c => c.text),
  it.ref && [(it.ref.authors || []).map(a => `${a.family} ${a.given}`).join(" "), it.ref.journal, it.ref.year, it.ref.doi].join(" "),
  it.paper && [it.paper.journal, it.paper.authors].join(" "),
  it.sample && [it.sample.process, it.sample.result].join(" "),
  it.review && [it.review.good, it.review.blocked, it.review.next].join(" "),
  ...(it.attachments || []).map(a => a.name)].filter(Boolean).join("\n");
const tagsOf = it => [...new Set((textOf(it).match(/#[\p{L}\p{N}_-]+/gu) || []).map(t => t.toLowerCase()))];

function periodLabel(it) {
  if (it.kind === "milestone") return msEnd(it) ? "~" + shortYmd(msEnd(it)) : "";
  if (it.kind === "month") return fmtYm(it.period);
  if (it.kind === "week" || it.kind === "review") { const m = parseYmd(it.period); return `W${pad(isoWeek(m))} · ${md(m)}~`; }
  if (it.kind === "day" || it.kind === "sample") return it.period ? shortYmd(it.period) : "";
  if (it.kind === "paper") return stageName((it.paper || {}).stage);
  if (it.kind === "ref") return [(it.ref || {}).journal, (it.ref || {}).year].filter(Boolean).join(" · ");
  return "";
}

function searchBox() {
  return h("div", { class: "search" },
    h("input", { type: "search", placeholder: "검색 또는 #태그", "aria-label": "전체 검색", dataset: { fk: "q" }, value: query,
      oninput: e => { query = e.target.value; render(); },
      onkeydown: e => { if (e.key === "Escape") { query = ""; render(); } } }));
}

function viewSearch() {
  const q = query.trim().toLowerCase();
  const hits = items.filter(it => q.startsWith("#") ? tagsOf(it).includes(q) : textOf(it).toLowerCase().includes(q))
                    .sort((a, b) => (b.created || 0) - (a.created || 0));
  return h("section", {},
    h("h2", {}, `"${query.trim()}" 검색 결과 ${hits.length}`),
    hits.length
      ? h("ul", { class: "results" }, hits.slice(0, 200).map(it => h("li", {},
          h("button", { type: "button", onclick: () => goTo(it) },
            h("span", { class: "kind" }, KIND_LABEL[it.kind] || it.kind),
            h("span", { class: "rt" + (it.done ? " done" : "") }, it.title),
            h("span", { class: "when" }, periodLabel(it))))))
      : h("p", { class: "empty" }, "찾는 내용이 없습니다."),
    h("button", { class: "link", type: "button", onclick: () => { query = ""; render(); } }, "검색 지우기"));
}

function tagCloud() {
  const count = new Map(), label = new Map();      // 비교는 소문자로, 표시는 처음 쓴 모양 그대로
  for (const it of items) {
    const seen = new Set();
    for (const raw of textOf(it).match(/#[\p{L}\p{N}_-]+/gu) || []) {
      const t = raw.toLowerCase();
      if (!label.has(t)) label.set(t, raw);
      if (!seen.has(t)) { seen.add(t); count.set(t, (count.get(t) || 0) + 1); }
    }
  }
  if (!count.size) return null;
  const q = query.trim().toLowerCase();
  return h("div", { class: "tags" },
    h("h2", {}, "태그"),
    [...count].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([t, n]) =>
      h("button", { type: "button", class: "tag" + (q === t ? " on" : ""), onclick: () => { query = q === t ? "" : label.get(t); render(); } },
        label.get(t), h("span", {}, String(n)))),
    h("p", { class: "hint" }, "제목이나 코멘트에 #M3D 처럼 쓰면 태그가 됩니다."));
}

// 항목이 있는 탭·달로 이동해서 펼침
function goTo(it) {
  query = "";
  const setT = k => { tab = k; history.replaceState(null, "", "#" + k); };
  if (it.kind === "milestone") { if (!["gantt", "goals", "calendar"].includes(tab)) setT("goals"); openMilestone(it.id); return; }
  if (it.kind === "month") { const [y, m] = it.period.split("-").map(Number); viewY = y; viewM = m - 1; setT("goals"); }
  else if (it.kind === "week") { const th = addDays(parseYmd(it.period), 3); viewY = th.getFullYear(); viewM = th.getMonth(); setT("goals"); }
  else if (it.kind === "day") { const d = parseYmd(it.period); viewY = d.getFullYear(); viewM = d.getMonth(); selDay = it.period; setT("calendar"); }
  else if (it.kind === "paper") { setT("papers"); paperFold.delete((it.paper || {}).stage || "draft"); savePaperFold(); }
  else if (it.kind === "sample") setT("lab");
  else if (it.kind === "ref") { setT("library"); libStatus = "all"; libStar = false; libQuery = ""; }
  else if (it.kind === "review") { revWeek = it.period; setT("review"); }
  openIds.add(it.id);
  render();
  const el = document.querySelector(`main [data-id="${it.id}"]`);
  if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
}

/* ------------------------------------------------------------------ 항목 상세: 마감·반복·체크리스트·연결된 실험 */
function extraFields(it, o) {
  const out = [];
  if (!o.milestone && it.kind !== "review")
    out.push(h("label", {}, "마감", h("input", { type: "date", value: it.due || "",
      onchange: e => { const v = e.target.value; if (v && v < "1900") return; act(store.update(it.id, { due: v || "" })); } })));
  const R = { month: [["monthly", "매달"]], week: [["weekly", "매주"]], day: [["daily", "매일"], ["weekdays", "평일마다"]] }[it.kind];
  if (R) {
    if (it.repeatOf) out.push(h("span", { class: "when" }, "↻ 반복해서 만들어진 항목"));
    else out.push(h("label", {}, "반복", h("select", { onchange: e => act(store.update(it.id, { repeat: e.target.value })) },
      h("option", { value: "", selected: !it.repeat }, "안 함"),
      R.map(([v, l]) => h("option", { value: v, selected: it.repeat === v }, l)))));
  }
  return out.length ? h("div", { class: "fields" }, out) : null;
}

function checklist(it) {
  const list = it.checks || [], fk = "ck:" + it.id;
  const save = checks => act(store.update(it.id, { checks }));
  const cur = () => (byId.get(it.id) || it).checks || [];
  return h("div", { class: "checks" },
    list.length > 0 && h("ul", {}, list.map(c => h("li", { class: c.done ? "done" : "" },
      h("input", { type: "checkbox", checked: !!c.done, "aria-label": c.text,
        onchange: e => save(cur().map(x => x.id === c.id ? { ...x, done: e.target.checked, at: e.target.checked ? Date.now() : null } : x)) }),
      h("span", {}, c.text),
      h("button", { class: "x", type: "button", "aria-label": "체크 항목 삭제", onclick: () => save(cur().filter(x => x.id !== c.id)) }, "삭제")))),
    h("input", { class: "add small", placeholder: "+ 체크 항목 (통과 기준, 세부 할 일) Enter", "aria-label": "체크 항목 추가",
      dataset: { fk }, value: drafts.get(fk) || "",
      oninput: e => drafts.set(fk, e.target.value),
      onkeydown: e => {
        if (typing(e) || e.key !== "Enter") return;
        e.preventDefault();
        const text = (drafts.get(fk) || "").trim();
        if (!text) return;
        drafts.delete(fk); e.target.value = "";
        save([...cur(), { id: rid(), text, done: false, at: null }]);
      } }));
}

function linkedSamples(it) {
  if (!["milestone", "month", "week"].includes(it.kind)) return null;
  const list = items.filter(s => s.kind === "sample" && s.parent === it.id).sort((a, b) => a.period < b.period ? 1 : -1);
  if (!list.length) return null;
  return h("div", { class: "linked" },
    h("span", { class: "lk" }, `실험 기록 ${list.length}`),
    list.slice(0, 10).map(s => h("button", { type: "button", class: "chip", onclick: () => goTo(s) }, `${shortYmd(s.period)} ${s.title}`)));
}

/* ------------------------------------------------------------------ 반복 목표
 * 반복으로 지정한 항목(원본)을 보고, 이번 주·이번 달·오늘 몫이 없으면 하나 만듭니다.
 * 반복으로 만든 항목을 지우면 그 기간은 다시 만들지 않습니다.
 */
const repeatMade = new Set();
function ensureRepeats() {
  if (state !== "ready" || !store) return;
  const t = new Date(), td = ymd(t), wk = ymd(mondayOf(t)), mk = ymKey(t.getFullYear(), t.getMonth());
  const list = [];
  for (const tp of items) {
    if (!tp.repeat || tp.repeatOf) continue;
    const target = tp.repeat === "weekly" ? wk : tp.repeat === "monthly" ? mk : tp.repeat === "daily" ? td
                 : tp.repeat === "weekdays" && t.getDay() % 6 ? td : null;
    if (!target || target <= tp.period || (tp.repeatSkip || []).includes(target)) continue;
    const key = tp.id + ":" + target;
    if (repeatMade.has(key) || items.some(i => i.repeatOf === tp.id && i.period === target)) continue;
    repeatMade.add(key);
    // 연결(상위 목표)은 같은 달·같은 주일 때만 이어받음
    const par = tp.parent && byId.get(tp.parent);
    let parent = "";
    if (par && tp.kind === "month") parent = tp.parent;
    if (par && tp.kind === "week") { const th = addDays(parseYmd(target), 3); if (par.period === ymKey(th.getFullYear(), th.getMonth())) parent = tp.parent; }
    if (par && tp.kind === "day" && par.period === ymd(mondayOf(t))) parent = tp.parent;
    list.push({ id: rid(), data: { kind: tp.kind, title: tp.title, period: target, parent, repeatOf: tp.id,
      done: false, doneAt: null, comments: [], checks: (tp.checks || []).map(c => ({ id: rid(), text: c.text, done: false, at: null })),
      created: Date.now() } });
  }
  if (list.length) act(store.addMany(list));
}
setInterval(ensureRepeats, 30 * 60e3);

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
        list("코멘트", R.comments, ({ it, c }) => h("li", {}, c.text.length > 60 ? c.text.slice(0, 60) + "…" : c.text, h("span", { class: "when" }, " · " + it.title))),
        list("못 한 주간 목표", R.open, i => h("li", {}, i.title))),
      !R.done.length && !R.checks.length && !R.moves.length && !R.samples.length && !R.comments.length && !R.open.length
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
  if (dup) { drafts.delete("lib:add"); toast("이미 있는 문헌입니다."); goTo(dup); return; }
  libBusy = true; render();
  try {
    const m = await fetchMeta(doi);
    act(store.add({ ...base, title: m.title, ref: { doi, ...m, status: "toread", star: false } }));
    drafts.delete("lib:add");
  } catch (e) { toast(e.message + " DOI를 확인해 주세요."); }
  libBusy = false; render();
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
      h("button", { class: "btn ghost", type: "button", disabled: !selList.length, onclick: () => exportRefs(selList, "ris") }, "RIS")),
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
    h("select", { class: "rr-status", "aria-label": "읽기 상태", onchange: e => setReadStatus(it, e.target.value) },
      READ.map(([v, l]) => h("option", { value: v, selected: (R.status || "toread") === v }, l))),
    open && h("div", { class: "pr-detail" }, detail(it, { ref: true, parents: goalOptions(it.parent), parentLabel: "연결 목표" })));
}

/* ------------------------------------------------------------------ auth */
async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-environment")
      return signInWithRedirect(auth, provider);
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request")
      toast("로그인 실패: " + (e.code || e.message));
  }
}

// 로그아웃: 이 브라우저에 저장해 둔 플래너 데이터(오프라인 캐시)와 Drive 연결까지 지움
async function logout() {
  forgetDrive();
  if (unsub) { unsub(); unsub = null; }
  let cleared = true;
  try { if (db) { await terminate(db); await clearIndexedDbPersistence(db); } }
  catch (e) { cleared = false; console.warn(e); }
  if (!cleared) alert("다른 탭에 플래너가 열려 있어서 이 브라우저에 저장된 데이터를 다 지우지 못했습니다. 플래너 탭을 모두 닫은 뒤 다시 로그아웃해 주세요.");
  try { await signOut(auth); } catch (e) {}
  location.reload();
}

let db = null;
function start() {
  if (DEMO) {
    store = demoStore();
    store.subscribe(setItems);
    return;
  }
  const fbApp = initializeApp(firebaseConfig);
  auth = getAuth(fbApp);
  try {
    db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = getFirestore(fbApp);                // 사생활 보호 모드 등에서 오프라인 캐시를 못 쓸 때
  }
  onAuthStateChanged(auth, user => {
    if (unsub) { unsub(); unsub = null; }
    items = []; byId = new Map(); openIds.clear(); drafts.clear();
    if (!user) { state = "signedOut"; store = null; render(); return; }
    state = "loading"; render();
    store = firestoreStore(db, user.uid);
    unsub = store.subscribe(setItems, err => {
      console.error(err);
      if (err.code === "permission-denied") state = "denied";
      else { state = "error"; errorMsg = "데이터를 불러오지 못했습니다. (" + (err.code || err.message) + ")"; }
      render();
    });
  });
}

/* ------------------------------------------------------------------ theme */
document.getElementById("tt").addEventListener("click", () => {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch (e) {}
});

render();
start();
