"use strict";
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
            if (!confirm(`"${s}"에서 가져온 항목 ${n}개를 모두 삭제할까요? ${TRASH_DAYS}일 동안 휴지통에서 되살릴 수 있습니다.`)) return;
            await moveToTrash(items.filter(i => i.src === s).map(i => i.id), `${n}개를 휴지통으로 옮겼습니다.`);
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
      + (old.length ? `\n\n같은 계획에서 이미 가져온 항목 ${old.length}개가 있습니다. 계속하면 그 항목을 휴지통으로 옮기고 새로 넣습니다.` : "");
    if (!confirm(msg)) return;
    try {
      if (old.length) await store.updateMany(old.map(i => i.id), { deletedAt: Date.now() });
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
  const TITLES = { papers: "원고", library: "문헌", lab: "실험 기록", thoughts: "생각", meetings: "미팅", review: "주간 회고" };
  const nNotes = items.filter(i => i.kind === "note").length;
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
                                             onclick: () => { query = ""; setTab(k); } }, label,
        k === "thoughts" && nNotes > 0 && h("span", { class: "tab-n", title: `수집함 ${nNotes}개` }, String(nNotes))))),
    query.trim() ? viewSearch()
      : tab === "calendar" ? viewCalendar() : tab === "gantt" ? viewGantt()
      : tab === "papers" ? viewPapers() : tab === "library" ? viewLibrary() : tab === "lab" ? viewLab()
      : tab === "thoughts" ? viewThoughts() : tab === "meetings" ? viewMeetings() : tab === "review" ? viewReview() : viewGoals());

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
    todayBrief(),
    h("div", { class: "stats" }, stat("월간 목표", mGoals), stat("주간 목표", allW), stat("일간 목표", allD)),

    (ensureHolidays(), dayList(selDay, `${relDay(selDay)} · ${dayLabel(parseYmd(selDay))}` + (holText(selDay) ? ` · ${holText(selDay)}` : ""), dayStrip())),

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
          class: "ds" + (k === selDay ? " sel" : "") + (k === todayKey ? " today" : "") + (k < todayKey ? " past" : "") + (holOf(k).length ? " hol" : "")
               + (d.getDay() === 1 ? " mon" : "") + (d.getDay() % 6 === 0 ? " we" : "") + (d.getDate() === 1 ? " first" : ""),
          title: dayLabel(d) + (holText(k) ? ` · ${holText(k)}` : "") + (c ? ` · 일간 목표 ${c[1]}/${c[0]}` : ""),
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

/* ------------------------------------------------------------------ 공휴일
 * 고른 나라의 공휴일을 Nager.Date(무료, 키 없음)에서 받아 달력·날짜 슬라이더·일간 목표 제목에 표시.
 * 나라 선택과 받은 목록은 이 브라우저에만 저장 (목록은 30일마다 새로 받음).
 */
const HOL_COUNTRIES = [["KR", "대한민국"], ["US", "미국"], ["JP", "일본"], ["CN", "중국"], ["HK", "홍콩"], ["SG", "싱가포르"],
  ["VN", "베트남"], ["GB", "영국"], ["DE", "독일"], ["FR", "프랑스"], ["NL", "네덜란드"], ["CH", "스위스"], ["CA", "캐나다"], ["AU", "호주"]];
// 날짜가 고정된 공휴일이 주말과 겹치면 Nager 는 원래 날짜를 빼고 대체일만 주므로, 원래 날짜를 채우고 대체일에 표시를 붙임
const FIXED_HOL = {
  KR: { "01-01": "새해", "03-01": "3·1절", "05-05": "어린이날", "06-06": "현충일", "08-15": "광복절", "10-03": "개천절", "10-09": "한글날", "12-25": "크리스마스" },
  US: { "01-01": "New Year's Day", "06-19": "Juneteenth National Independence Day", "07-04": "Independence Day", "11-11": "Veterans Day", "12-25": "Christmas Day" }
};
let holCountries = ["KR"];
try { const v = JSON.parse(localStorage.getItem("planner-hol-countries")); if (Array.isArray(v)) holCountries = v; } catch (e) {}
const holData = new Map();           // "KR-2026" → [{date, name}]
const holLoading = new Set();
let holidays = new Map();            // "YYYY-MM-DD" → [{cc, name}]

const daysBetweenYmd = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
function rebuildHolidays() {
  holidays = new Map();
  for (const [key, list] of holData) {
    const cc = key.slice(0, 2);
    if (!holCountries.includes(cc)) continue;
    for (const x of list) {
      if (!holidays.has(x.date)) holidays.set(x.date, []);
      holidays.get(x.date).push({ cc, name: x.name });
    }
  }
}
function normalizeHolidays(cc, year, raw) {
  const list = raw.filter(x => x.global !== false).map(x => ({ date: x.date, name: cc === "KR" ? x.localName : x.name }));
  for (const [md, name] of Object.entries(FIXED_HOL[cc] || {})) {
    const date = `${year}-${md}`;
    const moved = list.find(x => x.name === name && x.date !== date && Math.abs(daysBetweenYmd(x.date, date)) <= 3);
    if (moved) moved.name = cc === "KR" ? `대체공휴일 (${name})` : `${name} (observed)`;
    if (!list.some(x => x.date === date && x.name === name)) list.push({ date, name });
  }
  // 같은 날 같은 이름이 겹치면 하나만
  const seen = new Set();
  return list.filter(x => { const k = x.date + x.name; if (seen.has(k)) return false; seen.add(k); return true; });
}
async function loadHolidayYear(cc, year) {
  const key = `${cc}-${year}`, lsKey = "planner-hol-" + key;
  if (holData.has(key) || holLoading.has(key)) return;
  try {
    const c = JSON.parse(localStorage.getItem(lsKey));
    if (c && Date.now() - c.at < 30 * 864e5) { holData.set(key, c.list); return; }
  } catch (e) {}
  holLoading.add(key);
  try {
    const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`);
    if (!r.ok) throw new Error(r.status);
    const list = normalizeHolidays(cc, year, await r.json());
    holData.set(key, list);
    try { localStorage.setItem(lsKey, JSON.stringify({ at: Date.now(), list })); } catch (e) {}
  } catch (e) { holData.set(key, []); }
  holLoading.delete(key);
}
// 보고 있는 해와 앞뒤 해의 공휴일을 준비. 새로 받은 게 있으면 다시 그림
function ensureHolidays() {
  const years = new Set([viewY - 1, viewY, viewY + 1, today.getFullYear()]);
  const need = [];
  for (const cc of holCountries) for (const y of years) if (!holData.has(`${cc}-${y}`) && !holLoading.has(`${cc}-${y}`)) need.push([cc, y]);
  const had = holidays.size;
  rebuildHolidays();
  if (!need.length) return;
  Promise.all(need.map(([cc, y]) => loadHolidayYear(cc, y))).then(() => { rebuildHolidays(); if (holidays.size !== had || need.length) render(); });
}
const holOf = key => holidays.get(key) || [];
const holText = key => {
  const list = holOf(key);
  return list.map(x => (holCountries.length > 1 ? `${x.cc} ` : "") + x.name).join(", ");
};
// 달력 위: 지금 표시 중인 나라와 설정으로 가는 링크
function holidaySummary() {
  const names = HOL_COUNTRIES.filter(([cc]) => holCountries.includes(cc)).map(([, n]) => n);
  return h("div", { class: "holpick" },
    h("span", { class: "dl-k" }, "휴일 표시"),
    h("span", { class: "when" }, names.length ? names.join(", ") : "없음"),
    h("button", { class: "link", type: "button", onclick: () => openSettings("place") }, "변경"));
}

function viewCalendar() {
  ensureHolidays();
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
        const hol = holText(key);
        return h("button", {
            type: "button",
            class: "cal-day" + (d.getMonth() !== viewM ? " out" : "") + (key === todayKey ? " today" : "")
                 + (key === selDay ? " sel" : "") + (k >= 5 ? " we" : "") + (hol ? " hol" : ""),
            "aria-label": `${dayLabel(d)}${hol ? ", " + hol : ""}, 일간 목표 ${list.length}개`, "aria-pressed": String(key === selDay),
            title: hol || null,
            onclick: () => { selDay = key; render(); } },
          h("span", { class: "top-line" },
            h("span", { class: "dn" }, d.getDate()),
            list.length > 0 && h("span", { class: "dc" + (nd === list.length ? " all" : "") }, `${nd}/${list.length}`)),
          hol && h("span", { class: "hn" }, hol),
          list.slice(0, 3).map(i => h("span", { class: "dt" + (i.done ? " done" : "") }, i.title)),
          list.length > 3 && h("span", { class: "more" }, `+${list.length - 3}`));
      }));
  };

  const hs = holText(selDay);
  return h("div", {},
    holidaySummary(),
    h("div", { class: "cal" }, head, rows.map(row)),
    dayList(selDay, dayLabel(parseYmd(selDay)) + (hs ? ` · ${hs}` : "") + " 일간 목표"));
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
