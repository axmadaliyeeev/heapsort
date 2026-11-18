"use strict";
/* Дополнения поверх app.js: песочница кучи, мини-плеер, свайпы, «Поделиться», офлайн (PWA). */

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- уведомления ---------- */
function toast(msg, ms = 2200) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}

/* ---------- «Поделиться» ---------- */
$("btnShare").onclick = async () => {
  if (state.input.length) saveUrl();
  const url = location.href;
  if (navigator.share) {
    try { await navigator.share({ title: "Heap Sort", text: "Пирамидальная сортировка", url }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); toast("Ссылка скопирована"); }
  catch (e) { toast("Скопируйте ссылку из адресной строки"); }
};

/* ---------- мини-плеер: управление остаётся под рукой, пока смотришь столбцы/дерево ---------- */
(function () {
  const mini = $("miniPlayer"), player = document.querySelector(".player"), viz = $("viz");
  let vizIn = false, playerIn = true;
  const sync = () => {
    $("mpPlay").textContent = $("btnPlay").textContent;
    $("mpCount").textContent = $("stepCounter").textContent;
    $("mpPrev").disabled = $("btnPrev").disabled; $("mpNext").disabled = $("btnNext").disabled;
  };
  const update = () => { mini.hidden = !(vizIn && !playerIn && state.steps.length); if (!mini.hidden) sync(); };
  if ("IntersectionObserver" in window) {
    // viz считается «видимым», только когда он занимает центральную полосу экрана (а не касается края)
    new IntersectionObserver((es) => { vizIn = es[es.length - 1].isIntersecting; update(); },
      { rootMargin: "-40% 0px -40% 0px" }).observe(viz);
    new IntersectionObserver((es) => { playerIn = es[es.length - 1].isIntersecting; update(); }).observe(player);
  }
  const mo = new MutationObserver(sync);
  [$("btnPlay"), $("stepCounter")].forEach((n) => mo.observe(n, { childList: true, characterData: true, subtree: true }));
  new MutationObserver(sync).observe($("btnNext"), { attributes: true, attributeFilter: ["disabled"] });
  $("mpPrev").onclick = () => $("btnPrev").click();
  $("mpNext").onclick = () => $("btnNext").click();
  $("mpPlay").onclick = () => $("btnPlay").click();
})();

/* ---------- свайпы по столбцам и дереву: ← → = шаг ---------- */
document.querySelectorAll("#barsSvg, #treeSvg").forEach((svg) => {
  const box = svg.parentElement;
  let x0 = 0, y0 = 0, t0 = 0, track = false;
  box.addEventListener("touchstart", (e) => {
    track = box.scrollWidth <= box.clientWidth + 2 && e.touches.length === 1;   // если блок прокручивается — свайп отдаём прокрутке
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  box.addEventListener("touchend", (e) => {
    if (!track) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 48 && Math.abs(dy) < 36 && Date.now() - t0 < 600) step(dx < 0 ? 1 : -1);
  }, { passive: true });
});

/* ---------- песочница кучи ---------- */
const PQ_MAX = 31;
const pq = { a: [], out: [], busy: false, timer: null };
const pqKind = () => $("pqKind").value;
const pqBetter = (x, y) => (pqKind() === "max" ? x > y : x < y);   // x ближе к корню, чем y
const pqWord = () => (pqKind() === "max" ? "максимум" : "минимум");

function pqFrame(F, hl, cls, msg) { F.push({ arr: pq.a.slice(), out: pq.out.slice(), hl, cls, msg }); }

function pqSiftUp(F, i) {
  const a = pq.a;
  while (i > 0) {
    const p = (i - 1) >> 1;
    pqFrame(F, [i, p], "cmp", `Сравниваем ${a[i]} с родителем ${a[p]}`);
    if (!pqBetter(a[i], a[p])) { pqFrame(F, [i], "done", `${a[i]} на своём месте: свойство кучи выполнено`); return; }
    [a[i], a[p]] = [a[p], a[i]];
    pqFrame(F, [p, i], "swap", `${a[p]} ${pqKind() === "max" ? "больше" : "меньше"} родителя — меняем местами`);
    i = p;
  }
  pqFrame(F, [0], "done", "Элемент поднялся до корня");
}

function pqSiftDown(F, i, n) {
  const a = pq.a;
  for (;;) {
    let best = i; const l = 2 * i + 1, r = l + 1;
    if (l < n) { pqFrame(F, [l, best], "cmp", `Сравниваем потомка ${a[l]} с ${a[best]}`); if (pqBetter(a[l], a[best])) best = l; }
    if (r < n) { pqFrame(F, [r, best], "cmp", `Сравниваем потомка ${a[r]} с ${a[best]}`); if (pqBetter(a[r], a[best])) best = r; }
    if (best === i) { pqFrame(F, [i], "done", `${a[i]} на своём месте: свойство кучи выполнено`); return; }
    [a[i], a[best]] = [a[best], a[i]];
    pqFrame(F, [i, best], "swap", `Меняем ${a[best]} с потомком ${a[i]}`);
    i = best;
  }
}

function pqInsertOps(F, v) {
  pq.a.push(v);
  pqFrame(F, [pq.a.length - 1], "cmp", `Вставляем ${v} в конец (позиция ${pq.a.length - 1})`);
  pqSiftUp(F, pq.a.length - 1);
}

function pqExtractOps(F) {
  const a = pq.a;
  if (!a.length) return false;
  const top = a[0];
  pqFrame(F, [0], "swap", `Корень ${top} — это ${pqWord()}, забираем его`);
  if (a.length === 1) { a.pop(); pq.out.push(top); pqFrame(F, [], "done", `Извлечено ${top}. Куча пуста`); return true; }
  const last = a.length - 1;
  [a[0], a[last]] = [a[last], a[0]];
  pqFrame(F, [0, last], "swap", `Меняем корень с последним элементом (${a[0]})`);
  a.pop(); pq.out.push(top);
  pqFrame(F, [0], "cmp", `Извлечённый ${top} убран из кучи; ${a[0]} теперь в корне и «тонет»`);
  pqSiftDown(F, 0, a.length);
  return true;
}

function pqHeapifyOps(F) {
  const n = pq.a.length;
  pqFrame(F, [], "cmp", `Строим ${pqKind()}-кучу (метод Флойда) из ${n} элементов`);
  for (let i = (n >> 1) - 1; i >= 0; i--) pqSiftDown(F, i, n);
}

function pqDraw(fr) {
  const arr = fr.arr, n = arr.length, svg = $("pqSvg");
  svg.replaceChildren();
  $("pqSize").textContent = n ? `· ${n} из ${PQ_MAX}` : "";
  if (!n) {
    svg.appendChild(el("text", { x: 320, y: 150, "text-anchor": "middle", fill: cssVar("--text-dim"), "font-size": 18 }, "Куча пуста"));
  } else {
    const W = 640, H = 300, levels = Math.floor(Math.log2(n)) + 1, slot = W / 2 ** (levels - 1);
    setMinWidth(svg, 2 ** (levels - 1) * 26);
    const sc = svgScale(svg);
    const r = Math.max(3, Math.min(slot / 2 - 1, Math.max(21, 15 / sc), 30)), pad = r + 6;
    const pos = (i) => {
      const lvl = Math.floor(Math.log2(i + 1)), first = 2 ** lvl - 1, cnt = 2 ** lvl;
      return { x: ((i - first + 0.5) / cnt) * W, y: pad + lvl * ((H - 2 * pad) / Math.max(levels - 1, 1)) };
    };
    for (let i = 1; i < n; i++) {
      const p = pos((i - 1) >> 1), c = pos(i);
      const hot = fr.cls === "swap" && fr.hl.length === 2 && fr.hl.includes(i) && fr.hl.includes((i - 1) >> 1);
      svg.appendChild(el("line", { x1: p.x, y1: p.y, x2: c.x, y2: c.y, class: "edge" + (hot ? " hot" : "") }));
    }
    const fpx = Math.min(14, r * sc * 0.85);
    for (let i = 0; i < n; i++) {
      const { x, y } = pos(i), on = fr.hl.includes(i);
      const g = el("g", { class: "node " + (on ? fr.cls : "heap") });
      g.appendChild(el("circle", { cx: x, cy: y, r }));
      const t = el("text", { x, y: y + (fpx / sc) * 0.35, "text-anchor": "middle", "font-size": fpx / sc }, arr[i]);
      if (r * sc < 8) t.setAttribute("display", "none");
      g.appendChild(t); svg.appendChild(g);
    }
  }
  const row = $("pqArr"); row.replaceChildren();
  arr.forEach((v, i) => {
    const c = document.createElement("span"), ix = document.createElement("i");
    c.className = "chip-s" + (fr.hl.includes(i) ? " hl-" + fr.cls : "");
    ix.textContent = i; c.append(ix, " " + v); row.appendChild(c);
  });
  const out = $("pqOut");
  out.textContent = "";
  if (!fr.out.length) out.textContent = "—";
  fr.out.forEach((v) => { const c = document.createElement("span"); c.className = "chip-s"; c.textContent = v; out.appendChild(c); });
}

function pqSetBusy(b) {
  pq.busy = b;
  ["pqInsert", "pqExtract", "pqRandom", "pqDrain", "pqClear", "pqKind"].forEach((id) => ($(id).disabled = b));
}

function pqPlay(F) {
  if (!F.length) return;
  const final = { arr: pq.a.slice(), out: pq.out.slice(), hl: [], cls: "done" };
  if (reduceMotion) { pqDraw(final); $("pqMsg").textContent = F[F.length - 1].msg; return; }
  pqSetBusy(true);
  let k = 0;
  const tick = () => {
    if (k >= F.length) { pqDraw(final); pqSetBusy(false); return; }
    pqDraw(F[k]); $("pqMsg").textContent = F[k].msg; k++;
    pq.timer = setTimeout(tick, Math.max(110, delay() * 0.55));
  };
  tick();
}

function pqInsert() {
  const v = Number($("pqValue").value);
  if ($("pqValue").value.trim() === "" || !Number.isFinite(v)) return toast("Введите число");
  if (pq.a.length >= PQ_MAX) return toast(`В песочнице максимум ${PQ_MAX} элементов`);
  const F = []; pqInsertOps(F, v); $("pqValue").value = "";
  pqPlay(F);
  if (matchMedia("(pointer:fine)").matches) $("pqValue").focus();
}
function pqExtract() {
  const F = [];
  if (!pqExtractOps(F)) return toast("Куча пуста");
  pqPlay(F);
}
function pqDrain() {
  if (!pq.a.length) return toast("Куча пуста");
  const F = [];
  while (pq.a.length) pqExtractOps(F);
  pqFrame(F, [], "done", `Все элементы извлечены — получилась сортировка по ${pqKind() === "max" ? "убыванию" : "возрастанию"}`);
  pqPlay(F);
}
function pqRandom() {
  const n = Math.max(1, Math.min(Number($("pqN").value) || 10, PQ_MAX));
  $("pqN").value = n;
  pq.a = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 99)); pq.out = [];
  const F = []; pqFrame(F, [], "cmp", `Случайный массив из ${n} элементов — пока это не куча`);
  pqHeapifyOps(F); pqPlay(F);
}
function pqClear() {
  clearTimeout(pq.timer); pq.a = []; pq.out = [];
  pqDraw({ arr: [], out: [], hl: [], cls: "done" });
  $("pqMsg").textContent = "Куча очищена."; pqSetBusy(false);
}

$("pqInsert").onclick = pqInsert;
$("pqExtract").onclick = pqExtract;
$("pqDrain").onclick = pqDrain;
$("pqRandom").onclick = pqRandom;
$("pqClear").onclick = pqClear;
$("pqValue").addEventListener("keydown", (e) => { if (e.key === "Enter") pqInsert(); });
$("pqKind").onchange = () => { const F = []; if (pq.a.length) { pqHeapifyOps(F); pqPlay(F); } };
addEventListener("resize", () => { if (!pq.busy) pqDraw({ arr: pq.a.slice(), out: pq.out.slice(), hl: [], cls: "done" }); });
// стартовая куча
pq.a = [5, 3, 8, 1, 9, 2, 7]; { const F = []; pqHeapifyOps(F); pqDraw({ arr: pq.a.slice(), out: [], hl: [], cls: "done" }); }

/* ---------- сеть и офлайн ---------- */
function netState() { $("netState").textContent = navigator.onLine ? "онлайн" : "офлайн"; }
addEventListener("online", () => { netState(); toast("Связь восстановлена"); });
addEventListener("offline", () => { netState(); toast("Нет сети — работает сохранённая копия"); });
netState();

if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
