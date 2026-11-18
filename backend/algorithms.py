"""Алгоритмы для сравнения с heap sort: quick sort, merge sort, встроенная sorted (Timsort)."""
from __future__ import annotations

from typing import Callable, Dict, List

from heapsort import heap_sort


def quick_sort(data) -> List:
    """Итеративная быстрая сортировка (медиана из трёх, 3-way partition)."""
    a = list(data)
    stack = [(0, len(a) - 1)]
    while stack:
        lo, hi = stack.pop()
        while lo < hi:
            mid = (lo + hi) // 2
            x, y, z = a[lo], a[mid], a[hi]
            pivot = sorted((x, y, z))[1]
            lt, i, gt = lo, lo, hi
            while i <= gt:
                if a[i] < pivot:
                    a[lt], a[i] = a[i], a[lt]
                    lt += 1
                    i += 1
                elif a[i] > pivot:
                    a[gt], a[i] = a[i], a[gt]
                    gt -= 1
                else:
                    i += 1
            # меньшую часть — в цикл, большую — в стек (глубина стека O(log n))
            if lt - lo < hi - gt:
                stack.append((gt + 1, hi))
                hi = lt - 1
            else:
                stack.append((lo, lt - 1))
                lo = gt + 1
    return a


def merge_sort(data) -> List:
    """Сортировка слиянием (снизу вверх), устойчивая."""
    a = list(data)
    n = len(a)
    buf = a[:]
    width = 1
    while width < n:
        for lo in range(0, n, 2 * width):
            mid, hi = min(lo + width, n), min(lo + 2 * width, n)
            i, j, k = lo, mid, lo
            while i < mid and j < hi:
                if a[j] < a[i]:
                    buf[k] = a[j]; j += 1
                else:
                    buf[k] = a[i]; i += 1
                k += 1
            while i < mid:
                buf[k] = a[i]; i += 1; k += 1
            while j < hi:
                buf[k] = a[j]; j += 1; k += 1
        a, buf = buf, a
        width *= 2
    return a


ALGORITHMS: Dict[str, Callable] = {
    "heap": heap_sort,
    "quick": quick_sort,
    "merge": merge_sort,
    "python": sorted,
}

LABELS = {
    "heap": "Heap sort",
    "quick": "Quick sort",
    "merge": "Merge sort",
    "python": "Python sorted (Timsort)",
}
