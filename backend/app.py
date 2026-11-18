"""Flask-сервер: REST API + раздача frontend.

Локально:   python backend/app.py            → http://127.0.0.1:5000
Продакшн:   gunicorn --chdir backend app:app  (см. Procfile / railway.json)
"""
from __future__ import annotations

import logging
import math
import mimetypes
import os
import random
import statistics
import threading
import time
from collections import defaultdict, deque

from flask import Flask, jsonify, redirect, request, send_from_directory

from heapsort import heap_sort, heap_sort_trace
import benchmark
from algorithms import ALGORITHMS, LABELS

VERSION = "2.0.0"
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


MAX_TRACE_SIZE = 64                                   # визуализация имеет смысл только для небольших массивов
MAX_SORT_SIZE = _env_int("MAX_SORT_SIZE", 200_000)
MAX_TEXT_SIZE = 50_000
MAX_TEXT_LEN = 100
MAX_BENCH_SIZE = _env_int("MAX_BENCH_SIZE", 100_000)
MAX_BENCH_WORK = _env_int("MAX_BENCH_WORK", 1_500_000)  # sum(sizes) * repeats * algos — защита от многоминутных запросов
BENCH_PER_MIN = _env_int("BENCH_PER_MIN", 8)            # лимит замеров на IP в минуту
SORT_PER_MIN = _env_int("SORT_PER_MIN", 120)

mimetypes.add_type("application/manifest+json", ".webmanifest")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024    # 200 000 чисел ≈ 2 МБ JSON
app.json.ensure_ascii = False
app.json.sort_keys = False
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("heapsort")
STARTED = time.time()

try:                                                   # gzip/brotli для JSON и статики (необязательная зависимость)
    from flask_compress import Compress
    Compress(app)
except ImportError:                                    # pragma: no cover
    log.info("flask-compress не установлен — сжатие отключено")


# ---------------------------------------------------------------- вспомогательное
def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


def _client_ip() -> str:
    # за прокси Railway реальный адрес — первый в X-Forwarded-For
    xff = request.headers.get("X-Forwarded-For", "")
    return (xff.split(",")[0].strip() if xff else request.remote_addr) or "?"


def _limited(bucket: str, limit: int, window: float = 60.0) -> bool:
    """Скользящее окно в памяти процесса. True — лимит превышен."""
    now, key = time.monotonic(), f"{bucket}:{_client_ip()}"
    with _hits_lock:
        q = _hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return True
        q.append(now)
        if len(_hits) > 5000:                          # не даём словарю расти бесконечно
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > window]:
                _hits.pop(k, None)
    return False


def _parse_array(payload) -> list:
    if not isinstance(payload, dict) or "array" not in payload:
        raise ValueError("Ожидается JSON вида {\"array\": [..]}")
    arr = payload["array"]
    if not isinstance(arr, list):
        raise ValueError("Поле 'array' должно быть списком")
    out = []
    for x in arr:
        if isinstance(x, bool) or not isinstance(x, (int, float)):
            raise ValueError(f"Недопустимый элемент: {x!r} (нужны числа)")
        if isinstance(x, float):
            if not math.isfinite(x):          # NaN/Infinity ломают сравнение и JSON-ответ
                raise ValueError("Недопустимый элемент: NaN/Infinity")
            x = int(x) if x.is_integer() and abs(x) < 10**15 else x
        elif abs(x) > 10**15:
            raise ValueError("Число слишком большое (максимум 10^15 по модулю)")
        if isinstance(x, float) and abs(x) > 1e300:
            raise ValueError("Число слишком большое")
        out.append(x)
    return out


def _parse_words(payload) -> list[str]:
    arr = payload.get("array") if isinstance(payload, dict) else None
    if not isinstance(arr, list):
        raise ValueError("Ожидается JSON вида {\"array\": [..]}")
    if len(arr) > MAX_TEXT_SIZE:
        raise ValueError(f"Для слов максимум {MAX_TEXT_SIZE} элементов")
    for x in arr:
        if not isinstance(x, str):
            raise ValueError(f"Недопустимый элемент: {x!r} (нужны строки)")
        if len(x) > MAX_TEXT_LEN:
            raise ValueError(f"Слишком длинная строка (максимум {MAX_TEXT_LEN} символов)")
    return arr


def _num_stats(arr: list) -> dict:
    if not arr:
        return {}
    s = sorted(arr)
    return {"min": s[0], "max": s[-1], "sum": sum(arr),
            "mean": round(statistics.fmean(arr), 6), "median": statistics.median(s),
            "unique": len(set(arr))}


# ---------------------------------------------------------------- заголовки / ошибки
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://api.fontshare.com; "
       "font-src 'self' https://cdn.fontshare.com; img-src 'self' data: blob:; connect-src 'self'; "
       "worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


@app.after_request
def _headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if not request.path.startswith("/api/"):
        resp.headers.setdefault("Content-Security-Policy", CSP)
        resp.headers["Cache-Control"] = "no-cache"      # ETag + revalidate: обновления видны сразу
    else:
        resp.headers["Cache-Control"] = "no-store"
    if request.is_secure or request.headers.get("X-Forwarded-Proto") == "https":
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    return resp


@app.errorhandler(404)
def _not_found(_e):
    if request.path.startswith("/api/"):
        return _error("Не найдено", 404)
    return "Not found", 404


@app.errorhandler(405)
def _bad_method(_e):
    return _error("Метод не поддерживается", 405)


@app.errorhandler(413)
def _too_large(_e):
    return _error("Слишком большой запрос (максимум 4 МБ)", 413)


@app.errorhandler(500)
def _server_error(e):
    log.exception("Внутренняя ошибка: %s", e)
    return _error("Внутренняя ошибка сервера", 500)


# ---------------------------------------------------------------- статика
@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/favicon.ico")
def favicon():
    return redirect("/icon.svg", code=301)


@app.get("/<path:name>")
def static_files(name):
    return send_from_directory(FRONTEND_DIR, name)


# ---------------------------------------------------------------- API
@app.post("/api/sort")
def api_sort():
    if _limited("sort", SORT_PER_MIN):
        return _error("Слишком много запросов, подождите минуту", 429)
    payload = request.get_json(silent=True)
    text = isinstance(payload, dict) and payload.get("mode") == "text"
    try:
        arr = _parse_words(payload) if text else _parse_array(payload)
    except ValueError as e:
        return _error(str(e))
    if len(arr) > MAX_SORT_SIZE:
        return _error(f"Максимум {MAX_SORT_SIZE} элементов")
    reverse = bool(payload.get("reverse", False))
    key = str.casefold if text else None
    t0 = time.perf_counter()
    res = heap_sort(arr, reverse=reverse, key=key)
    ms = (time.perf_counter() - t0) * 1000
    keys = [key(x) for x in res] if key else res
    expected = sorted((key(x) for x in arr) if key else arr, reverse=reverse)
    out = {"input": arr, "sorted": res, "n": len(arr), "time_ms": round(ms, 3),
           "verified": keys == expected, "mode": "text" if text else "number"}
    if text:
        out["stats"] = {"unique": len(set(arr))} if arr else {}
    else:
        out["stats"] = _num_stats(arr)
    return jsonify(out)


@app.post("/api/trace")
def api_trace():
    payload = request.get_json(silent=True)
    try:
        arr = _parse_array(payload)
    except ValueError as e:
        return _error(str(e))
    if len(arr) > MAX_TRACE_SIZE:
        return _error(f"Для визуализации максимум {MAX_TRACE_SIZE} элементов")
    return jsonify({"input": arr, **heap_sort_trace(arr, reverse=bool(payload.get("reverse", False)))})


@app.get("/api/random")
def api_random():
    try:
        n = max(1, min(int(request.args.get("n", 10)), MAX_SORT_SIZE))
    except ValueError:
        return _error("Параметр n должен быть целым")
    kind = request.args.get("kind", "random")
    if kind not in benchmark.KINDS:
        return _error("Неизвестный kind: " + kind)
    hi = 99 if n <= MAX_TRACE_SIZE else 10**6
    arr = benchmark.generate(n, kind, hi=hi)
    if kind != "few_unique" and n <= MAX_TRACE_SIZE:
        arr = [max(1, x) for x in arr]
    return jsonify({"array": arr, "kind": kind})


_bench_slot = threading.BoundedSemaphore(1)           # один замер за раз на процесс: замеры честные и не душат CPU


@app.get("/api/benchmark")
def api_benchmark():
    if _limited("bench", BENCH_PER_MIN):
        return _error("Слишком много замеров, подождите минуту", 429)
    try:
        sizes = [int(x) for x in request.args.get("sizes", "1000,2000,5000,10000,20000").split(",") if x]
        repeats = max(1, min(int(request.args.get("repeats", 2)), 5))
    except ValueError:
        return _error("sizes и repeats должны быть целыми числами")
    sizes = sorted({s for s in sizes if 2 <= s <= MAX_BENCH_SIZE})[:8]
    if not sizes:
        return _error(f"Размеры должны быть в диапазоне 2..{MAX_BENCH_SIZE}")
    kind = request.args.get("kind", "random")
    if kind not in benchmark.KINDS:
        return _error("Неизвестный kind: " + kind)
    algos = [x for x in request.args.get("algos", "heap").split(",") if x in ALGORITHMS] or ["heap"]
    if sum(sizes) * repeats * len(algos) > MAX_BENCH_WORK:
        return _error("Слишком тяжёлый замер: уменьшите размеры, число повторов или алгоритмов")
    if not _bench_slot.acquire(blocking=False):
        return _error("Сервер сейчас выполняет другой замер — повторите через несколько секунд", 429)
    try:
        rows = benchmark.run(sizes=sizes, repeats=repeats, kind=kind, algos=algos)
    finally:
        _bench_slot.release()
    return jsonify({"kind": kind, "algos": algos, "labels": LABELS, "rows": rows})


@app.get("/api/health")
def api_health():
    return jsonify({"ok": True, "version": VERSION, "uptime_s": round(time.time() - STARTED),
                    "limits": {"trace": MAX_TRACE_SIZE, "sort": MAX_SORT_SIZE, "text": MAX_TEXT_SIZE,
                              "bench": MAX_BENCH_SIZE}})


if __name__ == "__main__":
    # локальный запуск; на Railway приложение стартует через gunicorn (host/port задаёт он)
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", 5000)), debug=False)
