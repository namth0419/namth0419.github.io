// 테마를 그리기 전에 결정 (홈페이지와 같은 localStorage 키 공유). 깜빡임을 막으려고 <head>에서 바로 실행
(function () {
  var t = "light";
  try {
    t = localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (e) {}
  document.documentElement.setAttribute("data-theme", t);
})();
