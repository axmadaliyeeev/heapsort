"""Пирамидальная сортировка (Heap sort).

Модуль содержит:
  * heap_sort        — обычная сортировка на месте (in-place);
  * heap_sort_trace  — та же сортировка, но с записью каждого шага
                       (используется визуализатором и трассировкой в отчёте);
  * sift_down        — просеивание элемента вниз по куче.

Куча — максимальная (max-heap): значение в каждом узле не меньше значений
потомков. Для узла с индексом i (нумерация с 0):
    левый потомок  = 2*i + 1
    правый потомок = 2*i + 2
    родитель       = (i - 1) // 2
"""
from __future__ import annotations

from typing import Any, Callable, Iterable, List, Optional

Step = dict[str, Any]


def sift_down(a: List[Any], i: int, n: int, key: Optional[Callable] = None) -> None:
    """Просеять элемент a[i] вниз в куче размера n."""
    k = key or (lambda x: x)
    while True:
        largest = i
        left, right = 2 * i + 1, 2 * i + 2
        if left < n and k(a[left]) > k(a[largest]):
            largest = left
        if right < n and k(a[right]) > k(a[largest]):
            largest = right
        if largest == i:
            return
        a[i], a[largest] = a[largest], a[i]
        i = largest


def heap_sort(data: Iterable[Any], reverse: bool = False,
              key: Optional[Callable] = None) -> List[Any]:
    """Вернуть новый отсортированный список (исходные данные не меняются)."""
    a = list(data)
    n = len(a)
    # Фаза 1: построение кучи, O(n)
    for i in range(n // 2 - 1, -1, -1):
        sift_down(a, i, n, key)
    # Фаза 2: извлечение максимума, O(n log n)
    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]
        sift_down(a, 0, end, key)
    if reverse:
        a.reverse()
    return a


def heap_sort_trace(data: Iterable[int], reverse: bool = False) -> dict[str, Any]:
    """Сортировка с подробным журналом шагов.

    reverse=False — по возрастанию (max-куча), reverse=True — по убыванию (min-куча).

    Возвращает словарь:
      sorted      — результат;
      steps       — список шагов {type, i, j, array, heap_size, message};
      comparisons — число сравнений элементов;
      swaps       — число обменов.

    Типы шагов: init, build_start, compare, swap, build_done,
                extract, sorted, done.
    """
    a = list(data)
    n = len(a)
    steps: List[Step] = []
    stats = {"comparisons": 0, "swaps": 0}
    # «лучше» = больше для max-кучи и меньше для min-кучи
    better = (lambda x, y: x < y) if reverse else (lambda x, y: x > y)
    root = "min" if reverse else "max"

    def log(kind: str, msg: str, i: int = -1, j: int = -1, heap: int = None):
        steps.append({
            "type": kind,
            "i": i,
            "j": j,
            "array": a.copy(),
            "heap_size": n if heap is None else heap,
            "message": msg,
        })

    def sift(i: int, size: int) -> None:
        while True:
            largest, left, right = i, 2 * i + 1, 2 * i + 2
            if left < size:
                stats["comparisons"] += 1
                log("compare", f"Сравниваем a[{left}]={a[left]} и a[{largest}]={a[largest]}",
                    left, largest, size)
                if better(a[left], a[largest]):
                    largest = left
            if right < size:
                stats["comparisons"] += 1
                log("compare", f"Сравниваем a[{right}]={a[right]} и a[{largest}]={a[largest]}",
                    right, largest, size)
                if better(a[right], a[largest]):
                    largest = right
            if largest == i:
                return
            a[i], a[largest] = a[largest], a[i]
            stats["swaps"] += 1
            log("swap", f"Меняем местами a[{i}] и a[{largest}]", i, largest, size)
            i = largest

    log("init", f"Исходный массив, n = {n}")
    if n:
        log("build_start", f"Фаза 1: построение {root}-кучи")
    for i in range(n // 2 - 1, -1, -1):
        sift(i, n)
    if n:
        log("build_done", f"Куча построена, корень a[0]={a[0]}")
    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]
        stats["swaps"] += 1
        log("extract", f"Фаза 2: корень {a[end]} переносим в позицию {end}", 0, end, end)
        sift(0, end)
        log("sorted", f"Позиция {end} зафиксирована, размер кучи = {end}", -1, end, end)
    log("done", "Массив отсортирован", heap=0)
    return {
        "sorted": a,
        "steps": steps,
        "comparisons": stats["comparisons"],
        "swaps": stats["swaps"],
    }
