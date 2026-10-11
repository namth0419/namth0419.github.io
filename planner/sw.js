/* Research Planner 서비스 워커 (앱으로 설치·오프라인 열기용)
 * - 플래너 파일(/planner/)과 Firebase SDK 만 다룸. 데이터(Firestore)·로그인·외부 API 요청은 건드리지 않음.
 * - 플래너 파일은 항상 네트워크에서 새로 받고, 연결이 없을 때만 저장해 둔 것을 씀 (코드가 옛 버전으로 굳지 않게).
 * - Firebase SDK 는 주소에 버전이 박혀 있어서 한 번 받은 것을 그대로 씀.
 */
const CACHE = "planner-v2";        // v1 은 버전마다 사본이 쌓였음 → 바꾸면서 지움
const SHELL = ["./", "manifest.webmanifest", "icons/icon-192.png"];
const SDK = "https://www.gstatic.com/firebasejs/";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.href.startsWith(SDK)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
  // 주소 뒤의 ?v=… 같은 꼬리표는 떼고 파일마다 한 벌만 저장 (업데이트할 때마다 옛 사본이 쌓이지 않게)
  const key = url.origin + url.pathname;
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === "basic" && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key).then(hit => hit || (req.mode === "navigate" ? caches.match(new URL("./", self.registration.scope).href) : Response.error()))));
});
