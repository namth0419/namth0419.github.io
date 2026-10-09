"use strict";
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
      it.from && byId.get(it.from) && h("button", { type: "button", class: "chip", title: "이 할 일이 나온 미팅 노트 열기",
        onclick: () => goTo(byId.get(it.from)) }, "미팅 " + (byId.get(it.from).period ? md(parseYmd(byId.get(it.from).period)) : "")),
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
      if (confirm(`"${it.title}" 항목을 삭제할까요? ${TRASH_DAYS}일 동안 휴지통(설정 → 데이터)에서 되살릴 수 있습니다.${att}`)) {
        moveToTrash([it.id], `"${it.title}"을(를) 휴지통으로 옮겼습니다.`);
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
    o.idea && ideaFields(it),
    o.meeting && meetingFields(it),
    extraFields(it, o),
    !o.meeting && checklist(it),
    linkedSamples(it),
    linkedIdeas(it),
    attachments(it),
    !o.meeting && comments.length > 0 && h("ol", { class: "comments" }, comments.map(c =>
      h("li", {},
        h("div", { class: "meta" },
          h("time", { datetime: new Date(c.at).toISOString() }, fmtWhen(c.at)),
          h("button", { class: "x", type: "button", onclick: () => {
            if (!confirm("이 코멘트를 삭제할까요?")) return;
            const cur = byId.get(it.id) || it;
            act(store.update(it.id, { comments: (cur.comments || []).filter(x => x.id !== c.id) }));
          } }, "삭제")),
        h("p", {}, linkify(c.text))))),
    !o.meeting && h("div", { class: "compose" },
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
const KIND_LABEL = { milestone: "마일스톤", month: "월간", week: "주간", day: "일간", paper: "원고", ref: "문헌", sample: "실험", review: "회고", note: "메모", idea: "아이디어", meeting: "미팅" };
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
  const all = [...items, ...trash];
  const data = { backup: 1, source: `백업 ${ymd(new Date())}`, exportedAt: new Date().toISOString(), items: all };
  download(`research-planner-backup-${ymd(new Date())}.json`, JSON.stringify(data, null, 1), "application/json");
  toast(`${all.length}개 항목을 백업 파일로 내려받았습니다.`);
}

/* ------------------------------------------------------------------ 검색·태그 */
const textOf = it => [it.title, it.body, ...(it.comments || []).map(c => c.text), ...(it.checks || []).map(c => c.text),
  it.idea && it.idea.body,
  it.meeting && [it.meeting.with, it.meeting.agenda, it.meeting.notes, it.meeting.decisions, ...(it.meeting.actions || []).map(a => a.text)].join(" "),
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
  if (it.kind === "note") return "수집함";
  if (it.kind === "idea") return ideaStageName((it.idea || {}).stage);
  if (it.kind === "meeting") return meetWhen(it);
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
  else if (it.kind === "note") setT("thoughts");
  else if (it.kind === "idea") { setT("thoughts"); ideaSel = it.id; }
  else if (it.kind === "meeting") setT("meetings");
  openIds.add(it.id);
  render();
  const el = document.querySelector(`main [data-id="${it.id}"]`);
  if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
}

/* ------------------------------------------------------------------ 항목 상세: 마감·반복·체크리스트·연결된 실험 */
function extraFields(it, o) {
  const out = [];
  if (!o.milestone && !["review", "idea", "meeting", "note"].includes(it.kind))
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
