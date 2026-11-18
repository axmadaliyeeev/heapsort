"use strict";
/* Frontend: backend'dan (/api/trace) iz olib, qadamma-qadam ijro etadi.
   Qo'shimcha: o'z ma'lumotlarini saralash, algoritmlarni taqqoslash, tema, URL holati. */

const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const TRACE_MAX = 64;

const state = {
  steps: [], idx: 0, input: [], result: [], timer: null,
  cmpAt: [], swpAt: [], buildDone: 0, n: 0, scale: 1, hasNeg: false,
  bars: [], vals: [], idxs: [], nodes: [], edges: [],
  sorted: [], bench: null,
};

/* ---------- yordamchilar ---------- */
function el(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
}
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

async function api(path, body) {
  let res;
  try {
    res = await fetch(path, body ? {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    } : undefined);
  } catch (e) {
    throw new Error(navigator.onLine ? "Нет связи с сервером" : "Нет сети — этот раздел работает только онлайн");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ошибка сервера " + res.status);
  return data;
}

function parseInput(text) {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (!parts.length) throw new Error("Введите хотя бы одно число");
  return parts.map((p) => {
    const v = Number(p.replace(",", "."));
    if (!Number.isFinite(v)) throw new Error("Не число: " + p);
    return v;
  });
}

function showError(e) {
  const m = $("message");
  m.replaceChildren();
  const s = document.createElement("span");
  s.className = "toast"; s.textContent = e.message || String(e);
  m.appendChild(s);
}
const fmtMs = (s) => (s * 1000 >= 100 ? (s * 1000).toFixed(0) : (s * 1000).toFixed(2)) + " мс";

/* ---------- tema ---------- */
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#0a0a0a" : "#f3f3ef";
  try { localStorage.setItem("theme", t); } catch (e) { /* private mode */ }
  if (state.bench) drawBench(state.bench);
}
const toggleTheme = () =>
  setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
$("themeBtn").onclick = toggleTheme;

/* ---------- ko'rinish effektlari: reveal, spotlight, nav ---------- */
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
  }), { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
  revealEls.forEach((e) => io.observe(e));
} else revealEls.forEach((e) => e.classList.add("is-visible"));

document.addEventListener("pointermove", (e) => {
  const c = e.target.closest && e.target.closest(".spot");
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty("--sx", e.clientX - r.left + "px");
  c.style.setProperty("--sy", e.clientY - r.top + "px");
});

const sections = ["viz", "heap", "sort", "bench", "about"].map((id) => $(id));
function updateNav() {
  let cur = "";
  sections.forEach((s) => { if (s.getBoundingClientRect().top <= 140) cur = s.id; });
  document.querySelectorAll(".nav-links a").forEach((a) => a.classList.toggle("active", a.dataset.nav === cur));
}
addEventListener("scroll", updateNav, { passive: true });
updateNav();

/* ---------- yuklash ---------- */
const isDesc = () => $("orderSel").value === "desc";

let loadSeq = 0;
async function load() {
  stop();
  const my = ++loadSeq;
  try {
    const arr = parseInput($("arrayInput").value);
    if (arr.length > TRACE_MAX) throw new Error(`Для визуализации максимум ${TRACE_MAX} элементов`);
    const data = await api("/api/trace", { array: arr, reverse: isDesc() });
    if (my !== loadSeq) return;   // устаревший ответ
    state.steps = data.steps; state.input = data.input; state.result = data.sorted;
    state.n = data.input.length;
    let c = 0, s = 0;
    state.cmpAt = []; state.swpAt = [];
    state.steps.forEach((st) => {
      if (st.type === "compare") c++;
      if (st.type === "swap" || st.type === "extract") s++;
      state.cmpAt.push(c); state.swpAt.push(s);
    });
    state.buildDone = Math.max(0, state.steps.findIndex((x) => x.type === "build_done"));
    state.idx = 0;
    initBars(); initTree(); buildLog();
    saveUrl();
    render();
  } catch (e) { showError(e); }
}

async function randomize() {
  try {
    const n = Math.max(1, Math.min(Number($("randN").value) || 10, 40));
    $("randN").value = n;
    const d = await api(`/api/random?n=${n}&kind=${$("kindSel").value}`);
    $("arrayInput").value = d.array.join(", ");
    load();
  } catch (e) { showError(e); }
}

function saveUrl() {
  try {
    const p = new URLSearchParams({ a: state.input.join(","), o: isDesc() ? "desc" : "asc" });
    history.replaceState(null, "", "?" + p + location.hash);
  } catch (e) { /* file:// и т.п. */ }
}
function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get("a")) $("arrayInput").value = p.get("a");
  if (p.get("o") === "desc") $("orderSel").value = "desc";
}

/* ---------- chizish: ustunlar ---------- */
// На узком экране даём SVG минимальную ширину (карточка прокручивается по горизонтали), на широком — вписываем целиком
function setMinWidth(svg, px) {
  svg.parentElement.style.setProperty("--min-w", svg.parentElement.clientWidth < 480 ? px + "px" : "0px");
}

function svgScale(svg) {
  const w = svg.getBoundingClientRect().width || svg.parentElement.clientWidth || 640;
  return Math.max(w / 640, 0.2);
}

function initBars() {
  const svg = $("barsSvg"); svg.replaceChildren();
  const a = state.input, n = a.length;
  const W = 640, H = 260, pad = 20;
  const max = Math.max(...a.map(Math.abs), 1);
  state.hasNeg = a.some((x) => x < 0);
  state.base = state.hasNeg ? H * 0.58 : H - 26;
  state.scale = (state.hasNeg ? state.base - 22 : state.base - 26) / max;
  state.bw = (W - pad * 2) / n; state.pad = pad;
  state.bars = []; state.vals = []; state.idxs = [];
  setMinWidth(svg, Math.min(n * 14, 900));
  const sc = svgScale(svg);                       // сколько CSS-пикселей в одной единице viewBox
  const fs = Math.min(state.bw / 1.8, Math.max(13, 11 / sc));
  state.showVals = Math.max(...a.map((v) => String(v).length)) * fs * 0.62 <= state.bw - 2;
  if (state.hasNeg) svg.appendChild(el("line", { x1: pad, x2: W - pad, y1: state.base, y2: state.base, class: "edge" }));
  for (let i = 0; i < n; i++) {
    const x = pad + i * state.bw;
    const r = el("rect", { x: x + 2, width: Math.max(state.bw - 4, 2), rx: 5, class: "bar heap" });
    svg.appendChild(r); state.bars.push(r);
    const t = el("text", { x: x + state.bw / 2, "text-anchor": "middle", class: "val",
      "font-size": fs });
    if (!state.showVals) t.setAttribute("display", "none");
    svg.appendChild(t); state.vals.push(t);
    const ix = el("text", { x: x + state.bw / 2, y: H - 7, "text-anchor": "middle", class: "idx", "font-size": Math.max(10, 9 / sc) }, i);
    if (i % Math.max(1, Math.ceil(13 / (state.bw * sc))) !== 0) ix.setAttribute("display", "none");   // показываем каждую k-ю
    svg.appendChild(ix);
  }
}

function cellClass(step, i) {
  if (i >= step.heap_size) return "done";
  if ((step.type === "swap" || step.type === "extract") && (i === step.i || i === step.j)) return "swap";
  if (step.type === "compare" && (i === step.i || i === step.j)) return "cmp";
  return "heap";
}

function drawBars(step) {
  step.array.forEach((v, i) => {
    const h = Math.max(Math.abs(v) * state.scale, 2);
    const y = v >= 0 ? state.base - h : state.base;
    const r = state.bars[i];
    r.style.height = h + "px"; r.style.y = y + "px";   // CSS-geometriya → silliq o'tish
    r.setAttribute("height", h); r.setAttribute("y", y);
    r.setAttribute("class", "bar " + cellClass(step, i));
    const t = state.vals[i];
    t.textContent = v; t.setAttribute("y", v >= 0 ? y - 5 : y + h + 13);
  });
}

/* ---------- chizish: daraxt ---------- */
function treePos(i, n) {
  const W = 640, H = 300, pad = state.treePad || 28, levels = Math.floor(Math.log2(n)) + 1;
  const lvl = Math.floor(Math.log2(i + 1)), first = 2 ** lvl - 1, cnt = 2 ** lvl;
  return { x: ((i - first + 0.5) / cnt) * W, y: pad + lvl * ((H - 2 * pad) / Math.max(levels - 1, 1)) };
}

function initTree() {
  const svg = $("treeSvg"); svg.replaceChildren();
  const n = state.n, levels = Math.floor(Math.log2(n)) + 1;
  const sc = svgScale(svg), slot = 640 / 2 ** (levels - 1);
  const r = Math.max(3, Math.min(slot / 2 - 1, Math.max(21, 15 / sc), 32));   // единицы viewBox
  state.treePad = r + 6;                                                      // отступ, чтобы узлы не обрезались
  const rpx = r * sc, fontPx = Math.min(14, rpx * 0.85);                      // CSS-пиксели на экране
  setMinWidth(svg, Math.min(2 ** (levels - 1) * 26, 1300));
  state.edges = [null]; state.nodes = [];
  for (let i = 1; i < n; i++) {
    const p = treePos((i - 1) >> 1, n), c = treePos(i, n);
    const l = el("line", { x1: p.x, y1: p.y, x2: c.x, y2: c.y, class: "edge" });
    svg.appendChild(l); state.edges.push(l);
  }
  for (let i = 0; i < n; i++) {
    const { x, y } = treePos(i, n);
    const g = el("g", { class: "node heap" });
    g.appendChild(el("circle", { cx: x, cy: y, r }));
    const t = el("text", { x, y: y + (fontPx / sc) * 0.35, "text-anchor": "middle", "font-size": fontPx / sc });
    if (rpx < 8) t.setAttribute("display", "none");
    g.appendChild(t); svg.appendChild(g);
    state.nodes.push({ g, t });
  }
}

function drawTree(step) {
  step.array.forEach((v, i) => {
    const nd = state.nodes[i];
    nd.g.setAttribute("class", "node " + cellClass(step, i));
    nd.t.textContent = v;
  });
  for (let i = 1; i < state.n; i++) {
    const hot = step.type === "swap" && ((step.i === (i - 1) >> 1 && step.j === i) || (step.j === (i - 1) >> 1 && step.i === i));
    state.edges[i].setAttribute("class", "edge" + (hot ? " hot" : ""));
  }
}

/* ---------- jurnal, kod, bosqichlar, statistika ---------- */
function buildLog() {
  const ol = $("log"); ol.replaceChildren();
  state.steps.forEach((s, i) => {
    const li = document.createElement("li");
    li.textContent = s.message; li.dataset.i = i;
    li.addEventListener("click", () => { stop(); state.idx = i; render(); });
    ol.appendChild(li);
  });
}

function codeLines(step, phase) {
  const call = phase === 1 ? 2 : 5;
  switch (step.type) {
    case "build_start": return [1];
    case "build_done": return [1];
    case "compare": return [call, 6, 7];
    case "swap": return [call, 6, 8];
    case "extract": return [3, 4];
    case "sorted": return [3];
    default: return [];
  }
}

function render() {
  const total = state.steps.length;
  if (!total) return;
  const s = state.steps[state.idx];
  drawBars(s); drawTree(s);
  $("message").textContent = s.message;
  $("stepCounter").textContent = `${state.idx + 1} / ${total}`;
  $("progressBar").style.width = ((state.idx + 1) / total) * 100 + "%";
  $("progress").setAttribute("aria-valuemax", total); $("progress").setAttribute("aria-valuenow", state.idx + 1);
  $("stN").textContent = s.array.length;
  $("stCmp").textContent = state.cmpAt[state.idx];
  $("stSwap").textContent = state.swpAt[state.idx];
  $("stHeap").textContent = s.heap_size;
  const done = s.type === "done";
  $("result").textContent = done ? "[" + s.array.join(", ") + "]" : "—";
  const n = state.n;
  $("theory").textContent = done
    ? `Теоретическая верхняя граница ≈ 2·n·⌊log₂n⌋ = ${2 * n * Math.floor(Math.log2(Math.max(n, 1)))} сравнений; фактически: ${state.cmpAt[state.idx]}.`
    : "";
  // bosqich
  const phase = done ? 3 : state.idx >= state.buildDone && state.idx > 0 ? 2 : state.idx > 0 ? 1 : 0;
  [["ph1", 1], ["ph2", 2], ["ph3", 3]].forEach(([id, p]) => {
    $(id).classList.toggle("on", phase === p);
    $(id).classList.toggle("past", phase > p);
  });
  const lit = codeLines(s, phase === 2 && s.type !== "build_done" ? 2 : 1);
  document.querySelectorAll("#code span").forEach((sp) => sp.classList.toggle("on", lit.includes(Number(sp.dataset.l))));
  document.querySelectorAll("#log li").forEach((li) => {
    const cur = Number(li.dataset.i) === state.idx;
    li.classList.toggle("cur", cur);
    if (cur) {
      const box = li.parentElement;
      box.scrollTop = Math.max(0, li.offsetTop - box.clientHeight / 2);   // sahifani emas, faqat ro'yxatni aylantiradi
    }
  });
  $("btnPrev").disabled = $("btnFirst").disabled = state.idx === 0;
  $("btnNext").disabled = $("btnLast").disabled = state.idx === total - 1;
}

/* ---------- boshqaruv ---------- */
const delay = () => 1100 - Number($("speed").value) * 100;
function stop() { clearInterval(state.timer); state.timer = null; $("btnPlay").textContent = "▶ Пуск"; }

function nextIdx(d) {
  let j = state.idx + d;
  if ($("skipCmp").checked) while (j >= 0 && j < state.steps.length && state.steps[j].type === "compare") j += d;
  return j;
}
function play() {
  if (!state.steps.length) return;
  if (state.idx >= state.steps.length - 1) { state.idx = 0; render(); }
  $("btnPlay").textContent = "⏸ Пауза";
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    const j = nextIdx(1);
    if (j >= state.steps.length) { state.idx = state.steps.length - 1; render(); return stop(); }
    state.idx = j; render();
    if (j >= state.steps.length - 1) stop();
  }, delay());
}
const toggle = () => (state.timer ? stop() : play());
function step(d) {
  stop();
  const j = Math.max(0, Math.min(nextIdx(d), state.steps.length - 1));
  if (j !== state.idx) { state.idx = j; render(); }
}
function goto(i) { stop(); state.idx = Math.max(0, Math.min(i, state.steps.length - 1)); render(); }

$("btnLoad").onclick = load;
$("btnRandom").onclick = randomize;
$("orderSel").onchange = load;
$("btnPlay").onclick = toggle;
$("btnNext").onclick = () => step(1);
$("btnPrev").onclick = () => step(-1);
$("btnFirst").onclick = () => goto(0);
$("btnLast").onclick = () => goto(state.steps.length - 1);
$("speed").oninput = () => { if (state.timer) play(); };
$("arrayInput").addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
$("progress").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  goto(Math.round(((e.clientX - r.left) / r.width) * (state.steps.length - 1)));
});

$("progress").addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") { e.preventDefault(); goto(state.idx + 1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); goto(state.idx - 1); }
  else if (e.key === "Home") { e.preventDefault(); goto(0); }
  else if (e.key === "End") { e.preventDefault(); goto(state.steps.length - 1); }
});

function vizInView() {
  const r = $("viz").getBoundingClientRect();
  return r.top < innerHeight * 0.7 && r.bottom > innerHeight * 0.3;
}
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "range" && e.target.type !== "checkbox") return;
  if (e.key === "t" || e.key === "T") return toggleTheme();
  if (!vizInView()) return;
  if (e.target.type === "range" && /^(Arrow|Home|End)/.test(e.key)) return;   // ползунок скорости сам обрабатывает стрелки
  if (e.target === $("progress")) return;
  if (e.code === "Space" && e.target.tagName !== "BUTTON") { e.preventDefault(); toggle(); }
  else if (e.key === "ArrowRight") step(1);
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "Home") { e.preventDefault(); goto(0); }
  else if (e.key === "End") { e.preventDefault(); goto(state.steps.length - 1); }
});

/* ---------- 02 Saralash ---------- */
const SHOW_MAX = 2000;
function sortMsg(t, cls) { const m = $("sortMsg"); m.textContent = t; m.className = "muted " + (cls || ""); }

const sortMode = () => document.querySelector("input[name=sortMode]:checked").value;
const WORD_PARTS = ["ал", "бе", "ва", "га", "до", "ка", "ли", "ма", "но", "по", "ра", "си", "ту", "фо", "ше", "ян", "ор", "ик", "ен", "ус"];
function randomWord(rnd) {
  let w = "";
  for (let k = 2 + (rnd() * 3 | 0); k > 0; k--) w += WORD_PARTS[rnd() * WORD_PARTS.length | 0];
  return rnd() < 0.2 ? w[0].toUpperCase() + w.slice(1) : w;
}
const fmtNum = (x) => (Number.isInteger(x) ? x : Number(Number(x).toFixed(3))).toLocaleString("ru");
function renderSortExtra(d) {
  const box = $("sortExtra"); box.replaceChildren();
  const s = d.stats || {};
  const items = d.mode === "text"
    ? [["уникальных", s.unique], ["первое", d.sorted[0]], ["последнее", d.sorted[d.sorted.length - 1]]]
    : [["min", s.min], ["max", s.max], ["среднее", s.mean], ["медиана", s.median], ["сумма", s.sum], ["уникальных", s.unique]];
  items.forEach(([k, v]) => {
    if (v === undefined) return;
    const c = document.createElement("span"), b = document.createElement("b");
    c.className = "chip-s"; b.textContent = k; c.append(b, " " + (typeof v === "number" ? fmtNum(v) : v)); box.appendChild(c);
  });
}

async function genSort() {
  try {
    if (sortMode() === "text") {
      const n = Math.max(1, Math.min(Number($("sortN").value) || 100, 50000));
      $("sortN").value = n;
      $("sortInput").value = Array.from({ length: n }, () => randomWord(Math.random)).join(", ");
      sortMsg(`Создано слов: ${n}.`);
      return;
    }
    const n = Math.max(1, Math.min(Number($("sortN").value) || 1000, 200000));
    $("sortN").value = n;
    sortMsg("Генерация…");
    const d = await api(`/api/random?n=${n}&kind=${$("sortKind").value}`);
    $("sortInput").value = d.array.join(", ");
    sortMsg(`Создано чисел: ${d.array.length}.`);
  } catch (e) { sortMsg(e.message, "bad"); }
}

async function doSort() {
  try {
    const text = sortMode() === "text";
    const arr = text ? $("sortInput").value.split(/[\s,;]+/).filter(Boolean) : parseInput($("sortInput").value);
    if (!arr.length) throw new Error("Введите хотя бы одно слово");
    $("btnSort").disabled = true; sortMsg("Сортировка…");
    const d = await api("/api/sort", { array: arr, reverse: $("sortOrder").value === "desc", mode: text ? "text" : "number" });
    renderSortExtra(d);
    state.sorted = d.sorted; state.sortedInput = d.input;
    $("sN").textContent = d.n.toLocaleString("ru");
    $("sT").textContent = d.time_ms + " мс";
    const v = $("sV"); v.textContent = d.verified ? "✓ верно" : "✗ ошибка"; v.className = d.verified ? "ok" : "bad";
    const shown = d.sorted.slice(0, SHOW_MAX).join(", ");
    $("sortOutput").value = d.sorted.length > SHOW_MAX ? `${shown}, … (ещё ${d.sorted.length - SHOW_MAX})` : shown;
    ["btnCopy", "btnDownload"].forEach((id) => ($(id).disabled = false));
    $("btnToViz").disabled = d.n > TRACE_MAX || d.mode === "text";
    sortMsg(d.sorted.length > SHOW_MAX ? "На экране первые 2000; при копировании и скачивании — все элементы." : "");
  } catch (e) { sortMsg(e.message, "bad"); }
  $("btnSort").disabled = false;
}

$("btnGen").onclick = genSort;
$("btnSort").onclick = doSort;
$("btnClearSort").onclick = () => {
  $("sortInput").value = ""; $("sortOutput").value = ""; sortMsg("");
  ["sN", "sT", "sV"].forEach((id) => { $(id).textContent = "—"; $(id).className = ""; });
  $("sortExtra").replaceChildren();
  ["btnCopy", "btnDownload", "btnToViz"].forEach((id) => ($(id).disabled = true));
};
$("btnCopy").onclick = async () => {
  try { await navigator.clipboard.writeText(state.sorted.join(", ")); sortMsg("Скопировано ✓", "ok"); }
  catch (e) { $("sortOutput").select(); sortMsg("Не удалось скопировать автоматически — текст выделен, нажмите Ctrl+C."); }
};
$("btnDownload").onclick = () => {
  const url = URL.createObjectURL(new Blob([state.sorted.join("\n")], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "sorted.txt" });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("btnToViz").onclick = () => {
  $("arrayInput").value = state.sortedInput.join(", ");
  $("orderSel").value = $("sortOrder").value;
  $("viz").scrollIntoView(); load();
};
$("fileIn").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const text = await f.text();
    let nums;
    if (f.name.endsWith(".json")) {
      const j = JSON.parse(text); nums = Array.isArray(j) ? j : j.array;
      if (!Array.isArray(nums)) throw new Error("JSON должен быть массивом");
      $("sortInput").value = nums.join(", ");
    } else $("sortInput").value = text.trim();
    sortMsg(`Файл «${f.name}» загружен.`);
  } catch (err) { sortMsg(err.message, "bad"); }
  e.target.value = "";
};

/* ---------- 03 Taqqoslash ---------- */
const ALGO_VAR = { heap: "--a-heap", quick: "--a-quick", merge: "--a-merge", python: "--a-python" };

async function bench() {
  const algos = [...document.querySelectorAll("#algoBox input:checked")].map((i) => i.value);
  if (!algos.length) { $("benchStatus").textContent = "Выберите хотя бы один алгоритм"; return; }
  const sizes = $("bSizes").value.split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  const q = new URLSearchParams({ sizes: sizes.join(","), kind: $("bKind").value, repeats: $("bRep").value, algos: algos.join(",") });
  $("benchStatus").textContent = "Идёт замер… (для больших размеров нужно подождать)";
  $("btnBench").disabled = true;
  try {
    state.bench = await api("/api/benchmark?" + q);
    drawBench(state.bench);
    $("btnCsv").disabled = false;
    $("benchStatus").textContent = "Готово";
  } catch (e) { $("benchStatus").textContent = e.message; }
  $("btnBench").disabled = false;
}

function niceScale(max, ticks) {
  // шаг из ряда 1, 2, 2.5, 5 × 10^k; возвращает шаг и верхнюю границу, кратную шагу
  const raw = max / ticks, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
  return { step, max: Math.ceil(max / step - 1e-9) * step };
}

const chart = { pts: [], L: 78, R: 24, T: 20, B: 52, W: 0, H: 0 };

function drawBench(res) {
  const { rows, algos, labels } = res;
  const cv = $("benchCanvas"), ctx = cv.getContext("2d");
  // размер берём из вёрстки: чётко на любом экране (HiDPI) и читаемые подписи на телефоне
  const cssW = Math.max(280, Math.round(cv.parentElement.clientWidth)), small = cssW < 560;
  const cssH = Math.round(small ? cssW * 0.8 : Math.min(420, cssW * 0.42));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  chart.L = small ? 62 : 78; chart.R = small ? 14 : 24; chart.B = small ? 46 : 52;
  const W = cssW, H = cssH, { L, R, T, B } = chart;
  chart.W = W; chart.H = H;
  const text = cssVar("--text-dim"), grid = cssVar("--line");
  ctx.clearRect(0, 0, W, H);
  const maxN = Math.max(...rows.map((r) => r.n));
  const rawMax = Math.max(...rows.flatMap((r) => algos.map((a) => r.times[a]))) * 1.04 || 1e-3;
  const { step: tStep, max: maxT } = niceScale(rawMax * 1000, 5);   // шкала в мс с круглыми делениями
  const maxS = maxT / 1000;
  const X = (n) => L + (n / maxN) * (W - L - R), Y = (t) => H - B - (t / maxS) * (H - T - B);
  ctx.font = (small ? 11 : 13) + "px General Sans, system-ui, sans-serif"; ctx.lineWidth = 1;
  const dec = tStep >= 1 ? 0 : tStep >= 0.1 ? 1 : 2;
  for (let v = 0; v <= maxT + 1e-9; v += tStep) {
    const y = Y(v / 1000);
    ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
    ctx.fillStyle = text; ctx.textAlign = "right"; ctx.fillText(v.toFixed(dec) + " мс", L - 10, y + 4);
  }
  ctx.textAlign = "center";
  let lastX = -1e9;                                  // прореживаем подписи оси X, чтобы не слипались
  rows.forEach((r) => {
    const lab = small && r.n >= 10000 ? Math.round(r.n / 1000) + "k" : r.n.toLocaleString("ru");
    if (X(r.n) - lastX >= ctx.measureText(lab).width + 10) { ctx.fillText(lab, X(r.n), H - B + 20); lastX = X(r.n); }
  });
  ctx.fillText("n (число элементов)", (L + W - R) / 2, H - 10);
  chart.pts = rows.map((r) => ({ x: X(r.n), r }));
  chart.maxT = maxS; chart.Y = Y;

  if ($("bTheory").checked && algos.includes("heap")) {
    const last = rows[rows.length - 1], c = last.times.heap / (last.n * Math.log2(last.n));
    ctx.setLineDash([7, 6]); ctx.strokeStyle = text; ctx.lineWidth = 1.5; ctx.beginPath();
    rows.forEach((r, i) => { const x = X(r.n), y = Y(c * r.n * Math.log2(r.n)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
  }
  algos.forEach((a) => {
    const col = cssVar(ALGO_VAR[a]);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath();
    rows.forEach((r, i) => { const x = X(r.n), y = Y(r.times[a]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    rows.forEach((r) => { ctx.beginPath(); ctx.arc(X(r.n), Y(r.times[a]), 5, 0, 7); ctx.fill(); });
  });

  // jadval
  const t = $("benchTable"); t.replaceChildren();
  const head = t.insertRow();
  ["n", ...algos.map((a) => labels[a] + ", мс"), ...(algos.includes("heap") ? ["heap: мкс/(n·log₂n)"] : [])]
    .forEach((h) => { const th = document.createElement("th"); th.textContent = h; head.appendChild(th); });
  rows.forEach((r) => {
    const tr = t.insertRow();
    const best = Math.min(...algos.map((a) => r.times[a]));
    tr.insertCell().textContent = r.n.toLocaleString("ru");
    algos.forEach((a) => {
      const td = tr.insertCell(); td.textContent = (r.times[a] * 1000).toFixed(2);
      if (r.times[a] === best && algos.length > 1) td.className = "best";
    });
    if (algos.includes("heap")) tr.insertCell().textContent = r.ratio;
  });

  // xulosa
  const v = $("benchVerdict"), last = rows[rows.length - 1];
  if (algos.length > 1) {
    const rank = [...algos].sort((a, b) => last.times[a] - last.times[b]);
    let s = `При n = ${last.n.toLocaleString("ru")} быстрее всех: ${labels[rank[0]]} (${fmtMs(last.times[rank[0]])}).`;
    if (algos.includes("heap") && rank[0] !== "heap")
      s += ` Heap sort медленнее в ${(last.times.heap / last.times[rank[0]]).toFixed(1)} раза.`;
    v.textContent = s;
  } else v.textContent = `При n = ${last.n.toLocaleString("ru")}: ${fmtMs(last.times[algos[0]])}.`;
  v.hidden = false;
  // оценка показателя роста T ~ n^k методом наименьших квадратов в log-log
  const exps = algos.map((a) => {
    const pts = rows.filter((r) => r.times[a] > 0 && r.n > 1).map((r) => [Math.log(r.n), Math.log(r.times[a])]);
    if (pts.length < 2) return null;
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    return den ? `${labels[a]} ≈ n^${(pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / den).toFixed(2)}` : null;
  }).filter(Boolean);
  $("benchExp").textContent = exps.length
    ? `Оценка роста T ~ nᵏ: ${exps.join(" · ")}. Для n·log n на этих размерах ожидается k ≈ 1.1–1.2, для n² — около 2.`
    : "";
}

function benchCsv() {
  const { rows, algos, labels } = state.bench;
  const lines = [["n", ...algos.map((a) => labels[a] + " (с)")].join(";")]
    .concat(rows.map((r) => [r.n, ...algos.map((a) => String(r.times[a]).replace(".", ","))].join(";")));
  downloadText("benchmark.csv", "\ufeff" + lines.join("\r\n"), "text/csv");
}

function downloadText(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("btnCsv").onclick = benchCsv;
$("btnBench").onclick = bench;
$("bTheory").onchange = () => state.bench && drawBench(state.bench);

const tip = $("chartTip");
$("benchCanvas").addEventListener("pointermove", (e) => {
  if (!state.bench || !chart.pts.length) return;
  const cv = e.currentTarget, rect = cv.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * chart.W;
  const p = chart.pts.reduce((a, b) => (Math.abs(b.x - mx) < Math.abs(a.x - mx) ? b : a));
  if (Math.abs(p.x - mx) > 60) { tip.hidden = true; return; }
  const { algos, labels } = state.bench;
  tip.replaceChildren();
  const b = document.createElement("b"); b.textContent = "n = " + p.r.n.toLocaleString("ru"); tip.appendChild(b);
  algos.forEach((a) => {
    const d = document.createElement("div"), i = document.createElement("i");
    i.style.background = cssVar(ALGO_VAR[a]);
    d.append(i, `${labels[a]}: ${fmtMs(p.r.times[a])}`); tip.appendChild(d);
  });
  tip.hidden = false;
  const px = (p.x / chart.W) * rect.width;
  tip.style.left = Math.min(px + 14, rect.width - tip.offsetWidth - 4) + "px";
  tip.style.top = "12px";
});
$("benchCanvas").addEventListener("pointerleave", () => (tip.hidden = true));
$("benchCanvas").addEventListener("pointerdown", (e) => e.currentTarget.dispatchEvent(new PointerEvent("pointermove", e)));
let rzT, lastW = innerWidth;
addEventListener("resize", () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    if (innerWidth === lastW) return;            // на телефоне resize вызывает и прячущаяся адресная строка
    lastW = innerWidth;
    if (state.bench) drawBench(state.bench);
    if (state.steps.length) { initBars(); initTree(); render(); }
  }, 150);
});

/* ---------- start ---------- */
readUrl();
load();
