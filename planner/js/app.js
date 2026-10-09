"use strict";
/* ------------------------------------------------------------------ 휴지통
 * 지우면 바로 없애지 않고 deletedAt 을 붙여 30일 동안 휴지통에 둠 (설정 → 데이터 → 휴지통).
 * 30일이 지난 것은 플래너를 열 때 영구 삭제. 백업 파일에는 휴지통 항목도 들어감.
 */
const TRASH_DAYS = 30;
let trashPurged = false;
function moveToTrash(ids, msg) {
  if (!ids.length) return;
  ids.forEach(id => { openIds.delete(id); libSel.delete(id); });
  if (ideaSel && ids.includes(ideaSel)) ideaSel = null;
  return act(store.updateMany(ids, { deletedAt: Date.now() })
    .then(() => toast(msg || "휴지통으로 옮겼습니다.", { label: "되돌리기", fn: () => restoreItems(ids) })));
}
function restoreItems(ids) {
  return act(store.updateMany(ids, { deletedAt: null }).then(() => toast(ids.length === 1 ? "되살렸습니다." : `${ids.length}개를 되살렸습니다.`)));
}
function purgeTrash() {
  if (trashPurged || !store) return;
  trashPurged = true;
  const old = trash.filter(i => Date.now() - i.deletedAt > TRASH_DAYS * 864e5).map(i => i.id);
  if (old.length) act(store.removeMany(old));
}

function openTrash() {
  const dlg = h("dialog", { class: "dlg trash", "aria-label": "휴지통" });
  const cleanup = () => { removeEventListener("planner:items", fill); dlg.remove(); };
  const close = () => { dlg.close(); cleanup(); };
  function fill() {
    const list = trash.slice().sort((a, b) => b.deletedAt - a.deletedAt);
    const left = i => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - i.deletedAt) / 864e5));
    dlg.replaceChildren(
      h("div", { class: "set-head" }, h("h3", {}, `휴지통 ${list.length}`),
        h("button", { class: "sp-x", type: "button", "aria-label": "닫기", onclick: close }, "×")),
      h("p", {}, `지운 항목은 ${TRASH_DAYS}일 동안 여기에 있다가 영구 삭제됩니다. 첨부한 Drive 파일은 지워지지 않습니다.`),
      list.length
        ? h("ul", { class: "imports tr-list" }, list.map(i => h("li", {},
            h("span", { class: "kind" }, KIND_LABEL[i.kind] || i.kind),
            h("span", { class: "tr-t", title: i.title }, i.title || "(제목 없음)"),
            h("span", { class: "n" }, `${fmtWhen(i.deletedAt)} · ${left(i)}일 남음`),
            h("button", { class: "btn ghost", type: "button", onclick: () => restoreItems([i.id]) }, "되살리기"),
            h("button", { class: "btn danger", type: "button", onclick: () => {
              if (confirm(`"${i.title}"을(를) 영구 삭제할까요? 되돌릴 수 없습니다.`)) act(store.remove(i.id));
            } }, "영구 삭제"))))
        : h("p", { class: "empty" }, "비어 있습니다."),
      list.length > 0 && h("div", { class: "dlg-actions" },
        h("button", { class: "btn danger", type: "button", onclick: () => {
          if (confirm(`휴지통의 ${list.length}개를 모두 영구 삭제할까요? 되돌릴 수 없습니다.`)) act(store.removeMany(list.map(i => i.id)));
        } }, "휴지통 비우기")));
  }
  addEventListener("planner:items", fill);
  dlg.addEventListener("close", cleanup);
  fill();
  document.body.append(dlg);
  dlg.showModal();
}

/* ------------------------------------------------------------------ 오늘 요약 (목표 탭 맨 위)
 * 오늘 할 일·이번 주 진행, 오늘 미팅, 밀린 일간 목표, 수집함, 남은 미팅 할 일, 요일에 맞는 알림(월: 주간 목표, 금~일: 회고)
 */
function todayBrief() {
  const now = new Date(), td = ymd(now), wk = ymd(mondayOf(now)), wd = now.getDay();
  const dayG = items.filter(i => i.kind === "day" && i.period === td);
  const weekG = items.filter(i => i.kind === "week" && i.period === wk);
  const nDone = list => list.filter(i => i.done).length;
  const late = items.filter(i => i.kind === "day" && !i.done && i.period < td && i.period >= ymd(addDays(now, -14)));
  const meet = meetings().filter(m => m.period === td);
  const notes = items.filter(i => i.kind === "note").length;
  const acts = meetings().flatMap(m => ((m.meeting || {}).actions || []).filter(a => !actionDone(a))).length;
  const hasReview = items.some(i => i.kind === "review" && i.period === wk && i.review && (i.review.good || i.review.blocked || i.review.next));
  const go = k => { query = ""; tab = k; history.replaceState(null, "", "#" + k); render(); scrollTo({ top: 0 }); };
  const line = (tag, body, btn, cls) => h("li", { class: cls || "" }, h("span", { class: "kind" }, tag), h("span", { class: "br-t" }, body), btn);
  const link = (label, fn) => h("button", { class: "link", type: "button", onclick: fn }, label);
  const hol = holText(td);
  const lines = [
    ...meet.map(m => {
      const a = (m.meeting || {}).actions || [];
      return line("미팅", [h("b", {}, m.title), (m.meeting || {}).with ? ` · ${m.meeting.with}` : "",
        (m.meeting || {}).agenda ? " · 안건 준비됨" : " · 안건 아직 없음"], link("열기", () => goTo(m)));
    }),
    late.length > 0 && line("밀린 일", `지난 2주 동안 못 끝낸 일간 목표 ${late.length}개`, link("오늘로 옮기기", () => {
      if (confirm(`못 끝낸 일간 목표 ${late.length}개를 오늘로 옮길까요?`)) act(store.updateMany(late.map(i => i.id), { period: td }));
    }), "warn"),
    wd === 1 && !weekG.length && line("월요일", "이번 주 목표가 아직 없습니다", link("세우러 가기", () => {
      viewY = now.getFullYear(); viewM = now.getMonth(); render();
      const el = document.querySelector(".week.now"); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    })),
    (wd === 5 || wd === 6 || wd === 0) && !hasReview && line("회고", "이번 주 회고를 아직 안 썼습니다", link("쓰러 가기", () => { revWeek = wk; go("review"); })),
    notes > 0 && line("수집함", `정리 안 한 메모 ${notes}개`, link("정리하기", () => go("thoughts"))),
    acts > 0 && line("미팅 할 일", `아직 안 끝난 할 일 ${acts}개`, link("보기", () => go("meetings")))
  ].filter(Boolean);
  return h("section", { class: "brief" },
    h("div", { class: "br-head" },
      h("b", {}, "오늘"),
      h("span", {}, dayLabel(now) + (hol ? ` · ${hol}` : "")),
      h("span", { class: "br-stat" }, `일간 ${nDone(dayG)}/${dayG.length}`, h("i", {}, "·"), `이번 주 ${nDone(weekG)}/${weekG.length}`)),
    lines.length ? h("ul", {}, lines) : h("p", { class: "br-ok" }, "챙길 일이 따로 없습니다. 오늘 목표에 집중하세요."));
}

/* ------------------------------------------------------------------ 앱으로 설치 (PWA)
 * manifest.webmanifest + sw.js. 휴대폰 홈 화면·컴퓨터에 앱처럼 설치하고, 아이콘을 길게 누르면 '빠른 메모'.
 * sw.js 는 플래너 파일을 항상 새로 받고(네트워크 우선) 연결이 없을 때만 저장해 둔 것을 씀.
 */
let pendingCapture = new URLSearchParams(location.search).has("capture");
if (pendingCapture) {
  const q = [...new URLSearchParams(location.search)].filter(([k]) => k !== "capture").map(([k, v]) => v ? `${k}=${encodeURIComponent(v)}` : k).join("&");
  history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
}
if ("serviceWorker" in navigator && (location.protocol === "https:" || LOCAL))
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("service worker", e)));

let installPrompt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; dispatchEvent(new CustomEvent("planner:scene")); });
addEventListener("appinstalled", () => { installPrompt = null; toast("앱으로 설치했습니다."); });
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function installRow() {
  if (standalone()) return h("div", { class: "set-row" }, h("span", {}, "앱"), h("span", { class: "acct" }, "앱으로 실행 중"));
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return h("div", { class: "set-row col" },
    h("span", {}, "앱으로 설치"),
    installPrompt
      ? h("div", { class: "set-row start" }, h("button", { class: "btn", type: "button", onclick: async () => {
          const p = installPrompt; installPrompt = null;
          p.prompt(); await p.userChoice.catch(() => {}); dispatchEvent(new CustomEvent("planner:scene"));
        } }, "이 기기에 설치"))
      : h("p", { class: "hint" }, ios
          ? "Safari 아래쪽 공유 버튼(□↑) → '홈 화면에 추가'를 누르세요."
          : "Chrome 주소창 오른쪽의 설치 아이콘, 또는 메뉴(⋮) → '앱 설치' / '홈 화면에 추가'를 누르세요."),
    h("p", { class: "hint" }, "홈 화면 아이콘으로 바로 열리고, 아이콘을 길게 누르면 '빠른 메모'가 나옵니다(Android·PC)."));
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
async function start() {
  if (DEMO) {
    store = demoStore();
    store.subscribe(setItems);
    return;
  }
  try { await loadFirebase(); }
  catch (e) {
    console.error(e);
    state = "error"; errorMsg = "로그인 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.";
    render(); return;
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
    items = []; byId = new Map(); trash = []; trashPurged = false; openIds.clear(); drafts.clear();
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

/* ------------------------------------------------------------------ 설정 창
 * 오른쪽 위 ⚙ 하나로 테마·계절 풍경·위치·휴일 국가·가져오기/내보내기·로그아웃을 모음.
 * 위치와 풍경은 season.js 가 window.PlannerScene 으로 열어 둔 기능을 씀.
 */
function themeMode() { try { return localStorage.getItem("theme") || "system"; } catch (e) { return "system"; } }
function applyTheme(mode) {
  try { if (mode === "system") localStorage.removeItem("theme"); else localStorage.setItem("theme", mode); } catch (e) {}
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (themeMode() === "system") applyTheme("system"); });

function toggleHoliday(cc) {
  holCountries = holCountries.includes(cc) ? holCountries.filter(x => x !== cc) : [...holCountries, cc];
  try { localStorage.setItem("planner-hol-countries", JSON.stringify(holCountries)); } catch (e) {}
  render();
}

let settingsDlg = null;
function openSettings(section) {
  if (settingsDlg) { settingsDlg.close(); settingsDlg.remove(); }
  const dlg = h("dialog", { class: "dlg settings", "aria-label": "설정" });
  settingsDlg = dlg;
  let results = null, msg = "";
  const Sc = () => window.PlannerScene;
  const seg = (cur, opts, onPick) => h("div", { class: "seg" }, opts.map(([v, l]) =>
    h("button", { type: "button", "aria-pressed": String(cur === v), onclick: () => { onPick(v); fill(); } }, l)));
  const doSearch = async () => {
    const text = (drafts.get("set:q") || "").trim();
    if (!text || !Sc()) return;
    msg = "찾는 중…"; results = null; fill();
    try { results = await Sc().search(text); msg = ""; } catch (e) { msg = "검색하지 못했습니다."; }
    fill();
  };
  const doLocate = async () => {
    if (!Sc()) return;
    msg = "현재 위치 확인 중…"; fill();
    try { await Sc().locate(); msg = ""; results = null; } catch (e) { msg = e.message; }
    fill();
  };
  const fill = () => {
    const S = Sc();
    dlg.replaceChildren(...[
      h("div", { class: "set-head" }, h("h3", {}, "설정"),
        h("button", { class: "sp-x", type: "button", "aria-label": "닫기", onclick: () => { dlg.close(); cleanup(); } }, "×")),
      h("section", { class: "set-sec" },
        h("h4", {}, "화면"),
        h("div", { class: "set-row" }, h("span", {}, "테마"),
          seg(themeMode(), [["light", "라이트"], ["dark", "다크"], ["system", "시스템 따라가기"]], applyTheme)),
        S && h("div", { class: "set-row" }, h("span", {}, "계절 풍경"),
          seg(S.isOn() ? "on" : "off", [["on", "켜기"], ["off", "끄기"]], v => S.setOn(v === "on"))),
        window.PlannerAmbient && h("div", { class: "set-row" }, h("span", {}, "배경 소리"),
          seg(window.PlannerAmbient.isOn() ? "on" : "off", [["on", "켜기"], ["off", "끄기"]], v => window.PlannerAmbient.setOn(v === "on"))),
        S && h("p", { class: "hint" }, "풍경을 누르면 크게, 한 번 더 누르면 전체 화면(배경화면처럼)으로 볼 수 있어요. 배경 소리는 지금 날씨·시각·계절에 맞춰 바람·비·새·풀벌레 같은 실제 자연 녹음을 섞어 들려줍니다.")),
      h("section", { class: "set-sec", dataset: { sec: "place" } },
        h("h4", {}, "지역"),
        S && h("div", { class: "set-row col" },
          h("span", {}, "날씨 · 해와 달 위치"),
          h("p", { class: "set-now" }, h("b", {}, S.place().name), S.weather() ? " · " + S.weather() : ""),
          h("div", { class: "sp-row" },
            h("input", { type: "search", placeholder: "도시 이름 (예: 대전광역시, State College)", "aria-label": "도시 검색",
              dataset: { fk: "set:q" }, value: drafts.get("set:q") || "",
              oninput: e => drafts.set("set:q", e.target.value),
              onkeydown: e => { if (!typing(e) && e.key === "Enter") { e.preventDefault(); doSearch(); } } }),
            h("button", { type: "button", onclick: doSearch }, "검색"),
            h("button", { type: "button", onclick: doLocate }, "현재 위치")),
          msg && h("p", { class: "hint" }, msg),
          results && h("div", { class: "sp-list" }, results.length
            ? results.map(x => h("button", { type: "button", onclick: () => { S.setPlace({ name: x.name, lat: x.lat, lon: x.lon }); results = null; drafts.delete("set:q"); fill(); } },
                h("b", {}, x.name), " " + x.detail))
            : "결과가 없습니다. 영문 이름으로도 찾아보세요."),
          h("p", { class: "hint" }, "이 위치의 해·달 움직임과 날씨가 풍경에 반영됩니다. 이 브라우저에만 저장되고 날씨 조회에만 쓰입니다.")),
        h("div", { class: "set-row col" },
          h("span", {}, "휴일 표시 국가"),
          h("div", { class: "seg chips" }, HOL_COUNTRIES.map(([cc, name]) => h("button", { type: "button", "aria-pressed": String(holCountries.includes(cc)),
            onclick: () => { toggleHoliday(cc); fill(); } }, name))))),
      state === "ready" && h("section", { class: "set-sec" },
        h("h4", {}, "데이터"),
        h("div", { class: "set-row start" },
          h("button", { class: "btn ghost", type: "button", onclick: () => { dlg.close(); cleanup(); openImport(); } }, "가져오기"),
          h("button", { class: "btn ghost", type: "button", onclick: exportBackup }, "내보내기 (백업)"),
          h("button", { class: "btn ghost", type: "button", onclick: exportIcs }, "캘린더 파일 (.ics)"),
          h("button", { class: "btn ghost", type: "button", onclick: () => { dlg.close(); cleanup(); openTrash(); } }, `휴지통 ${trash.length}`)),
        installRow()),
      !DEMO && auth && auth.currentUser && h("section", { class: "set-sec" },
        h("h4", {}, "계정"),
        h("div", { class: "set-row" }, h("span", { class: "acct" }, auth.currentUser.email),
          h("button", { class: "btn ghost", type: "button", onclick: logout }, "로그아웃")))].filter(Boolean));
  };
  const onScene = () => { if (dlg.open) fill(); };
  addEventListener("planner:scene", onScene);
  addEventListener("planner:items", onScene);
  addEventListener("planner:sound", onScene);
  function cleanup() { removeEventListener("planner:scene", onScene); removeEventListener("planner:items", onScene); removeEventListener("planner:sound", onScene); dlg.remove(); if (settingsDlg === dlg) settingsDlg = null; }
  dlg.addEventListener("close", cleanup);
  fill();
  document.body.append(dlg);
  dlg.showModal();
  if (section) { const el = dlg.querySelector(`[data-sec="${section}"]`); if (el) el.scrollIntoView({ block: "start" }); }
}
document.getElementById("gear").addEventListener("click", () => openSettings());
document.getElementById("capture").addEventListener("click", () => openCapture());
addEventListener("planner:open-settings", e => openSettings(e.detail && e.detail.section));

render();
start();
