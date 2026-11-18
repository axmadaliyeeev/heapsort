"""Замер времени работы сортировок: heap sort и конкуренты, разные типы входных данных."""
from __future__ import annotations

import math
import random
import time
from typing import Dict, List, Optional

from algorithms import ALGORITHMS

KINDS = ("random", "sorted", "reversed", "nearly", "few_unique")


def generate(n: int, kind: str = "random", rnd: Optional[random.Random] = None,
             hi: int = 10**6) -> List[int]:
    """Сгенерировать массив из n чисел заданного типа."""
    rnd = rnd or random
    if kind == "sorted":
        return sorted(rnd.randint(0, hi) for _ in range(n))
    if kind == "reversed":
        return sorted((rnd.randint(0, hi) for _ in range(n)), reverse=True)
    if kind == "nearly":
        a = sorted(rnd.randint(0, hi) for _ in range(n))
        for _ in range(max(1, n // 20)):
            i, j = rnd.randrange(n), rnd.randrange(n)
            a[i], a[j] = a[j], a[i]
        return a
    if kind == "few_unique":
        return [rnd.randint(1, 5) for _ in range(n)]
    return [rnd.randint(0, hi) for _ in range(n)]


def run(sizes: List[int] = None, repeats: int = 3, seed: int = 42,
        kind: str = "random", algos: Optional[List[str]] = None) -> List[Dict]:
    sizes = sizes or [1000, 2000, 5000, 10000, 20000]
    algos = [x for x in (algos or ["heap"]) if x in ALGORITHMS] or ["heap"]
    rnd = random.Random(seed)
    warm = generate(min(max(sizes), 2000), kind, random.Random(seed))
    for name in algos:            # прогрев: первый вызов в процессе заметно медленнее остальных
        ALGORITHMS[name](warm)
    rows = []
    for n in sizes:
        best = {name: float("inf") for name in algos}
        for _ in range(repeats):
            data = generate(n, kind, rnd)
            for name in algos:
                t0 = time.perf_counter()
                ALGORITHMS[name](data)
                best[name] = min(best[name], time.perf_counter() - t0)
        nlogn = n * math.log2(n) if n > 1 else 1
        h = best.get("heap", next(iter(best.values())))
        rows.append({
            "n": n,
            "times": {k: round(v, 6) for k, v in best.items()},
            "seconds": round(h, 6),
            "n_log_n": round(nlogn),
            "ratio": round(h / nlogn * 1e6, 4),  # мкс на n·log2 n
        })
    return rows


if __name__ == "__main__":
    for r in run(algos=list(ALGORITHMS)):
        print(r)
