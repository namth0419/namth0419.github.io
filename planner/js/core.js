"use strict";
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
 *
 * 파일 구성 (index.html 에서 이 순서대로 불러옴. 모두 같은 전역 범위를 씀):
 *   core.js      설정, 날짜, 저장소(Firestore·데모), 상태, 화면 그리기 도구
 *   goals.js     가져오기, 첫 화면, 목표·날짜 슬라이더·공휴일·달력·간트·마일스톤
 *   items.js     항목 한 줄·상세, Drive 첨부, 마감, 백업, 검색·태그, 체크리스트, 반복
 *   papers.js    원고
 *   lab.js       실험 기록, 주간 회고·보고서
 *   library.js   문헌
 *   thoughts.js  수집함·빠른 메모·아이디어 보드
 *   meetings.js  미팅 노트
 *   app.js       휴지통, 오늘 요약, 앱 설치, 로그인, 설정 창, 시작
 */
// Firebase SDK 는 start() 에서 불러와 아래 이름들에 채움 (데모 모드에서는 불러오지 않음)
const FIREBASE = "https://www.gstatic.com/firebasejs/12.3.0/";
let initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, reauthenticateWithPopup, onAuthStateChanged, signOut,
    initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence,
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch;
async function loadFirebase() {
  const [A, U, F] = await Promise.all(["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map(f => import(FIREBASE + f)));
  ({ initializeApp } = A);
  ({ getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, reauthenticateWithPopup, onAuthStateChanged, signOut } = U);
  ({ initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence,
     collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch } = F);
}

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
    updateMany: async (ids, patch) => {
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(db);
        ids.slice(i, i + 400).forEach(id => b.update(doc(col, id), patch));
        await b.commit();
      }
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
let items = [], byId = new Map(), trash = [];   // trash: 휴지통 (deletedAt 이 있는 항목)
const today = new Date();
let viewY = today.getFullYear(), viewM = today.getMonth();
const openIds = new Set();       // 펼쳐진 항목
const drafts = new Map();        // 입력 중인 글 (다시 그려도 유지)
let showDoneMs = false;
const TABS = [["goals", "목표"], ["calendar", "달력"], ["gantt", "간트"], ["papers", "원고"], ["library", "문헌"], ["lab", "실험"], ["thoughts", "생각"], ["meetings", "미팅"], ["review", "회고"]];
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
  items = list.filter(i => !i.deletedAt);
  trash = list.filter(i => i.deletedAt);
  byId = new Map(items.map(i => [i.id, i]));
  state = "ready";
  render();
  ensureRepeats();
  purgeTrash();
  dispatchEvent(new CustomEvent("planner:items"));
  if (pendingCapture) { pendingCapture = false; openCapture(); }
}
const act = p => Promise.resolve(p).catch(e => {
  console.error(e);
  toast(e && e.code === "permission-denied" ? "저장 권한이 없습니다." : "저장하지 못했습니다: " + (e && e.message || e));
});
let toastTimer = 0;
function toast(msg, action) {
  const el = document.getElementById("toast");
  el.replaceChildren(msg);
  if (action) el.append(h("button", { type: "button", class: "toast-act",
    onclick: () => { el.classList.remove("on"); action.fn(); } }, action.label));
  el.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), action ? 8000 : 4000);
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

// 오른쪽 위에는 데모 표시만. 가져오기·내보내기·로그아웃은 설정 창에
function renderWho() {
  who.replaceChildren();
  if (DEMO) who.append(h("span", { class: "demo-flag" }, "DEMO · 로컬 저장"));
}
