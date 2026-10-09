/**
 * Research Planner · 주간 메일 + 자동 백업 + 캘린더 연동 (Google Apps Script)
 *
 * 매주 월요일 아침에 플래너(Firestore)를 읽어서
 *   이번 주 목표 · 이번 달 진행 · 다가오는 마감 · 원고 현황 · 지난주 회고
 * 를 메일로 보냅니다. 또 매일 새벽 전체 데이터를 본인 Google Drive 의
 * "Research Planner 백업" 폴더에 JSON 으로 저장합니다(최근 BACKUP_KEEP 개만 남김).
 * 백업 파일은 플래너 ⚙ 설정 → 가져오기에 그대로 넣으면 복원됩니다.
 * 그리고 한 시간마다 마감일(마일스톤·원고·목표 등)과 미팅을 Google 캘린더의
 * "Research Planner" 캘린더에 맞춰 넣습니다(완료하거나 지우면 캘린더에서도 빠짐).
 * 마감은 3일 전·하루 전 오전 9시, 미팅은 하루 전 오전 9시에 휴대폰 알림이 옵니다.
 * 본인 Google 계정으로 실행되므로 비밀번호나 키를 따로 만들지 않습니다.
 * Drive 권한은 drive.file, 캘린더 권한은 calendar.app.created 라서
 * 이 스크립트가 만든 파일·캘린더에만 접근합니다(기존 일정은 읽지도 바꾸지도 않음).
 *
 * 설치
 *   1. https://script.google.com 에서 "새 프로젝트"
 *   2. Code.gs 내용을 이 파일로 바꾸기
 *   3. 왼쪽 톱니바퀴(프로젝트 설정) → "appsscript.json 매니페스트 파일 표시" 체크 →
 *      appsscript.json 을 아래 MANIFEST 주석의 내용으로 바꾸기
 *   4. Google Cloud 콘솔(프로젝트 namth0419) → API 및 서비스 → 라이브러리에서
 *      "Google Calendar API" 사용 설정 (Drive API 는 이미 켜져 있음)
 *   5. 위쪽 함수 선택에서 setup 을 골라 실행 → 권한 허용 (처음 한 번)
 *      → 시험 메일 한 통, 첫 백업, 캘린더 연동이 바로 되고,
 *        이후 매주 월요일 8시 메일 · 매일 4시 백업 · 매시간 캘린더 맞추기
 *   (예전 버전을 쓰던 중이면: 코드와 appsscript.json 을 바꾼 뒤 setup 을 한 번 더 실행)
 *
 * MANIFEST (appsscript.json)
 * {
 *   "timeZone": "Asia/Seoul",
 *   "runtimeVersion": "V8",
 *   "exceptionLogging": "STACKDRIVER",
 *   "oauthScopes": [
 *     "https://www.googleapis.com/auth/datastore",
 *     "https://www.googleapis.com/auth/drive.file",
 *     "https://www.googleapis.com/auth/calendar.app.created",
 *     "https://www.googleapis.com/auth/script.external_request",
 *     "https://www.googleapis.com/auth/script.send_mail",
 *     "https://www.googleapis.com/auth/script.scriptapp",
 *     "https://www.googleapis.com/auth/userinfo.email"
 *   ]
 * }
 */

const TO = "";                       // 받을 주소. 비워두면 이 스크립트를 실행한 Google 계정으로 보냄
const TZ = "Asia/Seoul";             // 기준 시간대. 미국에 있을 땐 "America/New_York"
const SEND_HOUR = 8;                 // 월요일 몇 시에 보낼지
const PROJECT = "namth0419";         // Firebase 프로젝트 ID
const PLANNER_URL = "https://namth0419.github.io/planner/";
const BACKUP_HOUR = 4;               // 매일 몇 시에 백업할지
const BACKUP_KEEP = 60;              // 백업 파일을 최근 몇 개까지 남길지 (매일 → 약 두 달)
const BACKUP_FOLDER = "Research Planner 백업";
const CALENDAR_NAME = "Research Planner";   // 마감·미팅을 넣을 캘린더 (스크립트가 새로 만듦)

/* ---------- 설치: 메일·백업·캘린더 예약 + 한 번씩 바로 실행 ---------- */
function setup() {
  ScriptApp.getProjectTriggers()
    .filter(t => ["sendWeekly", "backupDaily", "syncCalendar"].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("sendWeekly").timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(SEND_HOUR).inTimezone(TZ).create();
  ScriptApp.newTrigger("backupDaily").timeBased()
    .everyDays(1).atHour(BACKUP_HOUR).inTimezone(TZ).create();
  ScriptApp.newTrigger("syncCalendar").timeBased().everyHours(1).create();
  sendWeekly();
  backupDaily();
  syncCalendar();
}

/* ---------- Firestore 읽기 (all 이 아니면 휴지통 항목은 뺌) ---------- */
function loadItems(all) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
  const res = UrlFetchApp.fetch(url, {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "X-Goog-User-Project": PROJECT },
    payload: JSON.stringify({ structuredQuery: { from: [{ collectionId: "items", allDescendants: true }] } })
  });
  if (res.getResponseCode() !== 200) throw new Error("플래너 데이터를 읽지 못했습니다: " + res.getContentText());
  const list = JSON.parse(res.getContentText()).filter(r => r.document)
    .map(r => Object.assign({ id: r.document.name.split("/").pop() }, fields(r.document.fields || {})));
  return all ? list : list.filter(i => !i.deletedAt);
}

/* ---------- Google API 호출 (Drive·Calendar 공통) ---------- */
function gapi(path, opt) {
  const res = UrlFetchApp.fetch("https://www.googleapis.com/" + path, Object.assign({ muteHttpExceptions: true }, opt || {}, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "X-Goog-User-Project": PROJECT } }));
  if (res.getResponseCode() >= 300) throw new Error("Google API 오류 " + res.getResponseCode() + " (" + path.split("?")[0] + "): " + res.getContentText());
  const text = res.getContentText();
  return text ? JSON.parse(text) : {};
}
/* ---------- 자동 백업: Google Drive 에 JSON (플래너 "가져오기"로 복원) ---------- */
function backupFolder() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty("backupFolder");
  if (saved) {
    try { const f = gapi(`drive/v3/files/${saved}?fields=id,trashed`); if (!f.trashed) return saved; } catch (e) {}
  }
  const f = gapi("drive/v3/files?fields=id", { method: "post", contentType: "application/json",
    payload: JSON.stringify({ name: BACKUP_FOLDER, mimeType: "application/vnd.google-apps.folder" }) });
  props.setProperty("backupFolder", f.id);
  return f.id;
}
function backupDaily() {
  const items = loadItems(true);
  const folder = backupFolder();
  const now = new Date(), stamp = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
  const data = { backup: 1, source: `자동 백업 ${stamp}`, exportedAt: now.toISOString(), items };
  const file = gapi("drive/v3/files?fields=id", { method: "post", contentType: "application/json",
    payload: JSON.stringify({ name: `research-planner-backup-${stamp}.json`, parents: [folder], mimeType: "application/json" }) });
  gapi(`upload/drive/v3/files/${file.id}?uploadType=media`, { method: "patch", contentType: "application/json",
    payload: Utilities.newBlob(JSON.stringify(data), "application/json").getBytes() });
  // 오래된 백업은 Drive 휴지통으로
  const q = encodeURIComponent(`'${folder}' in parents and trashed = false`);
  const list = gapi(`drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=200&fields=files(id,name)`).files || [];
  list.filter(f => /^research-planner-backup-/.test(f.name)).slice(BACKUP_KEEP).forEach(f =>
    gapi(`drive/v3/files/${f.id}`, { method: "patch", contentType: "application/json", payload: JSON.stringify({ trashed: true }) }));
  return items.length;
}
function fields(f) { const o = {}; for (const k in f) o[k] = value(f[k]); return o; }
function value(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(value);
  if ("mapValue" in v) return fields(v.mapValue.fields || {});
  return null;
}

/* ---------- 날짜 (모두 "YYYY-MM-DD" 문자열) ---------- */
const D = s => new Date(s + "T00:00:00Z");
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const mondayOf = s => addDays(s, -((D(s).getUTCDay() + 6) % 7));
const md = s => `${+s.slice(5, 7)}.${+s.slice(8, 10)}`;
const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 864e5);
function isoWeek(mon) {
  const th = D(addDays(mon, 3)), jan1 = Date.UTC(th.getUTCFullYear(), 0, 1);
  return Math.floor(Math.round((th - jan1) / 864e5) / 7) + 1;
}
const startMs = s => Date.parse(s + "T00:00:00" + Utilities.formatDate(D(s), TZ, "XXX"));   // TZ 기준 그날 0시

/* ---------- 메일 ---------- */
const STAGE = { draft: "작성 중", submitted: "투고", review: "리뷰 중", revision: "리비전", accepted: "게재 확정", published: "출판" };
const KIND = { milestone: "마일스톤", month: "월간", week: "주간", day: "일간", paper: "원고", sample: "실험" };
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dd = n => n === 0 ? "D-day" : n > 0 ? `D-${n}` : `D+${-n}`;

function sendWeekly() {
  const items = loadItems();
  const byId = {};
  items.forEach(i => { byId[i.id] = i; });
  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  const mon = mondayOf(today), sun = addDays(mon, 6), lastMon = addDays(mon, -7);
  const thu = addDays(mon, 3), month = thu.slice(0, 7);
  const due = i => i.kind === "milestone" ? (i.end || "") : (i.due || "");
  const parentOf = i => { const p = i.parent && byId[i.parent]; return p ? ` <span style="color:#888">↳ ${esc(p.title)}</span>` : ""; };

  const week = items.filter(i => i.kind === "week" && i.period === mon);
  const carried = items.filter(i => i.kind === "week" && i.period === lastMon && !i.done);
  const monthGoals = items.filter(i => i.kind === "month" && i.period === month);
  const soon = items.filter(i => !i.done && due(i) && i.kind !== "review" && due(i) <= addDays(today, 14))
                    .sort((a, b) => due(a) < due(b) ? -1 : 1);
  const papers = items.filter(i => i.kind === "paper" && (i.paper || {}).stage !== "published")
                      .sort((a, b) => Object.keys(STAGE).indexOf((b.paper || {}).stage) - Object.keys(STAGE).indexOf((a.paper || {}).stage));
  const review = items.find(i => i.kind === "review" && i.period === lastMon);
  const t0 = startMs(lastMon), t1 = startMs(mon);
  const lastDone = items.filter(i => i.done && i.doneAt >= t0 && i.doneAt < t1 && i.kind !== "review").length;

  const H = [];
  const sec = (title, body) => H.push(`<h3 style="font:600 13px sans-serif;letter-spacing:.06em;color:#555;margin:22px 0 6px;border-bottom:1px solid #e3e0da;padding-bottom:4px">${title}</h3>${body}`);
  const ul = arr => `<ul style="margin:0;padding-left:18px;line-height:1.7">${arr.join("")}</ul>`;
  const li = s => `<li>${s}</li>`;

  H.push(`<p style="margin:0 0 4px;color:#888;font-size:12px">${mon.slice(0, 4)} W${isoWeek(mon)} · ${md(mon)} – ${md(sun)}</p>`);
  H.push(`<p style="margin:0;font-size:14px">지난주 완료 <b>${lastDone}</b>개 · 이번 주 목표 <b>${week.length}</b>개 · 2주 안 마감 <b>${soon.length}</b>개</p>`);

  sec("이번 주 목표", week.length ? ul(week.map(i => li(`${i.done ? "✓ " : "☐ "}${esc(i.title)}${parentOf(i)}`))) : `<p style="color:#888">아직 이번 주 목표가 없습니다. 플래너에서 세워 보세요.</p>`);
  if (carried.length) sec("지난주에서 넘어온 일", ul(carried.map(i => li(esc(i.title)))));
  if (monthGoals.length) {
    const dn = monthGoals.filter(i => i.done).length;
    sec(`이번 달 목표 ${dn}/${monthGoals.length}`, ul(monthGoals.map(i => li(`${i.done ? "✓ " : "☐ "}${esc(i.title)}${parentOf(i)}`))));
  }
  if (soon.length) sec("다가오는 마감 (2주)", ul(soon.map(i => {
    const n = daysBetween(today, due(i));
    return li(`<b style="color:${n < 0 ? "#c0392b" : n <= 3 ? "#d9822f" : "#333"}">${dd(n)}</b> ${esc(i.title)} <span style="color:#888">· ${KIND[i.kind] || ""} · ${due(i)}</span>`);
  })));
  if (papers.length) sec("원고 현황", ul(papers.map(p => {
    const P = p.paper || {};
    const dur = n => n >= 14 ? `${Math.floor(n / 7)}주` : `${n}일`;
    // 투고·리뷰·리비전 모두 투고일부터
    const wait = !["submitted", "review", "revision"].includes(P.stage) ? ""
               : P.submitted ? `투고 후 ${dur(Math.max(0, daysBetween(P.submitted, today)))}` : "투고일 미입력";
    const extra = [P.journal, wait, p.due ? dd(daysBetween(today, p.due)) : ""].filter(Boolean).join(" · ");
    return li(`<b>${STAGE[P.stage] || "작성 중"}</b> ${esc(p.title)}${extra ? ` <span style="color:#888">· ${esc(extra)}</span>` : ""}`);
  })));
  if (review && review.review) {
    const r = review.review, part = (k, l) => r[k] ? `<p style="margin:6px 0"><b>${l}</b><br>${esc(r[k]).replace(/\n/g, "<br>")}</p>` : "";
    if (r.good || r.blocked || r.next) sec("지난주 회고", part("next", "이번 주에 하기로 한 것") + part("blocked", "막혔던 것") + part("good", "잘된 것"));
  }
  H.push(`<p style="margin:26px 0 0"><a href="${PLANNER_URL}" style="color:#b4532a">플래너 열기 →</a></p>`);

  const html = `<div style="font-family:-apple-system,'Noto Sans KR',sans-serif;max-width:620px;color:#1f1d1a;font-size:14px">${H.join("")}</div>`;
  MailApp.sendEmail({
    to: TO || Session.getEffectiveUser().getEmail(),
    subject: `[Research Planner] W${isoWeek(mon)} (${md(mon)} – ${md(sun)}) 이번 주 목표`,
    htmlBody: html,
    body: html.replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n")
  });
}

/* ---------- 캘린더 연동: 마감·미팅 → "Research Planner" 캘린더 ----------
 * 각 일정에 플래너 항목 키(plannerKey)를 붙여 두고, 실행할 때마다 플래너와 같아지도록
 * 새로 넣고 · 바꾸고 · 지움. 30일보다 지난 일정은 건드리지 않음(기록으로 남김).
 */
const CAL_LABEL = { milestone: "마일스톤", month: "월간 목표", week: "주간 목표", day: "일간 목표", paper: "원고", ref: "문헌", sample: "실험", idea: "아이디어", note: "메모" };
function plannerCalendar() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty("calendarId");
  if (saved) {
    try { gapi(`calendar/v3/calendars/${encodeURIComponent(saved)}`); return saved; } catch (e) {}
  }
  const c = gapi("calendar/v3/calendars", { method: "post", contentType: "application/json",
    payload: JSON.stringify({ summary: CALENDAR_NAME, description: "Research Planner 에서 자동으로 맞추는 캘린더입니다. 여기서 고친 내용은 다음 동기화 때 되돌아갑니다.", timeZone: TZ }) });
  props.setProperty("calendarId", c.id);
  return c.id;
}
function syncCalendar() {
  const items = loadItems();
  const cal = encodeURIComponent(plannerCalendar());
  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"), from = addDays(today, -30);
  const due = i => i.kind === "milestone" ? (i.end || "") : (i.due || "");
  const remind = mins => ({ useDefault: false, overrides: mins.map(m => ({ method: "popup", minutes: m })) });

  // 플래너에 있어야 할 일정
  const want = {};
  items.forEach(i => {
    const d = due(i);
    if (d && !i.done && i.kind !== "review" && d >= from)
      want[i.id + ":due"] = { date: d, summary: `[마감] ${i.title}`, description: `${CAL_LABEL[i.kind] || ""} 마감\n${PLANNER_URL}`, reminders: remind([2 * 1440 + 900, 900]) };
    if (i.kind === "meeting" && i.period && i.period >= from) {
      const M = i.meeting || {};
      const desc = [M.with ? "참석: " + M.with : "", M.agenda ? "안건\n" + M.agenda : "", PLANNER_URL + "#meetings"].filter(Boolean).join("\n\n");
      want[i.id + ":meeting"] = { date: i.period, summary: `[미팅] ${i.title}`, description: desc, reminders: remind([900]) };
    }
  });

  // 캘린더에 이미 있는 것
  const have = {};
  let page = "";
  do {
    const r = gapi(`calendar/v3/calendars/${cal}/events?timeMin=${encodeURIComponent(from + "T00:00:00Z")}&maxResults=2500&singleEvents=true` + (page ? "&pageToken=" + page : ""));
    (r.items || []).forEach(e => { const k = e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.plannerKey; if (k) have[k] = e; });
    page = r.nextPageToken || "";
  } while (page);

  const body = (k, w) => JSON.stringify({ summary: w.summary, description: w.description, reminders: w.reminders, transparency: "transparent",
    start: { date: w.date }, end: { date: addDays(w.date, 1) }, extendedProperties: { private: { plannerKey: k } } });
  let added = 0, changed = 0, removed = 0;
  Object.keys(want).forEach(k => {
    const w = want[k], e = have[k];
    if (!e) { gapi(`calendar/v3/calendars/${cal}/events`, { method: "post", contentType: "application/json", payload: body(k, w) }); added++; return; }
    if (e.summary !== w.summary || (e.description || "") !== w.description || (e.start && e.start.date) !== w.date) {
      gapi(`calendar/v3/calendars/${cal}/events/${e.id}`, { method: "patch", contentType: "application/json", payload: body(k, w) }); changed++;
    }
  });
  Object.keys(have).forEach(k => {
    if (!want[k]) { gapi(`calendar/v3/calendars/${cal}/events/${have[k].id}`, { method: "delete" }); removed++; }
  });
  console.log(`캘린더: 추가 ${added}, 변경 ${changed}, 삭제 ${removed}`);
}
