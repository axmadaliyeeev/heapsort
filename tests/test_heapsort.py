import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from heapsort import heap_sort, heap_sort_trace  # noqa: E402
from app import app  # noqa: E402
from algorithms import quick_sort, merge_sort  # noqa: E402
import benchmark  # noqa: E402


class HeapSortTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(heap_sort([]), [])

    def test_single(self):
        self.assertEqual(heap_sort([7]), [7])

    def test_sorted(self):
        self.assertEqual(heap_sort([1, 2, 3, 4]), [1, 2, 3, 4])

    def test_reversed(self):
        self.assertEqual(heap_sort([5, 4, 3, 2, 1]), [1, 2, 3, 4, 5])

    def test_duplicates(self):
        self.assertEqual(heap_sort([3, 1, 3, 1, 2, 2]), [1, 1, 2, 2, 3, 3])

    def test_negative_and_float(self):
        self.assertEqual(heap_sort([0, -5, 2.5, -1, 10]), [-5, -1, 0, 2.5, 10])

    def test_reverse_flag(self):
        self.assertEqual(heap_sort([2, 9, 4], reverse=True), [9, 4, 2])

    def test_input_not_mutated(self):
        src = [3, 1, 2]
        heap_sort(src)
        self.assertEqual(src, [3, 1, 2])

    def test_key(self):
        self.assertEqual(heap_sort(["ccc", "a", "bb"], key=len), ["a", "bb", "ccc"])

    def test_random_against_sorted(self):
        rnd = random.Random(1)
        for _ in range(300):
            a = [rnd.randint(-100, 100) for _ in range(rnd.randint(0, 60))]
            self.assertEqual(heap_sort(a), sorted(a))

    def test_trace_example(self):
        res = heap_sort_trace([4, 10, 3, 5, 1])
        self.assertEqual(res["sorted"], [1, 3, 4, 5, 10])
        self.assertEqual(res["steps"][0]["type"], "init")
        self.assertEqual(res["steps"][-1]["type"], "done")
        self.assertGreater(res["comparisons"], 0)

    def test_trace_matches_heap_sort(self):
        rnd = random.Random(2)
        for _ in range(100):
            a = [rnd.randint(0, 50) for _ in range(rnd.randint(0, 30))]
            self.assertEqual(heap_sort_trace(a)["sorted"], sorted(a))

    def test_comparisons_bound(self):
        n = 64
        a = list(range(n, 0, -1))
        res = heap_sort_trace(a)
        # не более 2 сравнений на каждый шаг просеивания, глубина ≤ log2 n
        self.assertLessEqual(res["comparisons"], 2 * n * 7)

    def test_trace_reverse(self):
        rnd = random.Random(3)
        for _ in range(100):
            a = [rnd.randint(0, 50) for _ in range(rnd.randint(0, 30))]
            self.assertEqual(heap_sort_trace(a, reverse=True)["sorted"], sorted(a, reverse=True))


class OtherAlgoTests(unittest.TestCase):
    def test_against_sorted(self):
        rnd = random.Random(4)
        for kind in benchmark.KINDS:
            for n in (0, 1, 2, 17, 500):
                a = benchmark.generate(n, kind, rnd) if n else []
                self.assertEqual(quick_sort(a), sorted(a), (kind, n))
                self.assertEqual(merge_sort(a), sorted(a), (kind, n))

    def test_benchmark_rows(self):
        rows = benchmark.run(sizes=[50, 100], repeats=1, algos=["heap", "quick", "merge", "python"])
        self.assertEqual(len(rows), 2)
        self.assertEqual(set(rows[0]["times"]), {"heap", "quick", "merge", "python"})


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.c = app.test_client()

    def test_sort_ok(self):
        r = self.c.post("/api/sort", json={"array": [3, 1, 2]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["sorted"], [1, 2, 3])

    def test_sort_desc(self):
        r = self.c.post("/api/sort", json={"array": [3, 1, 2], "reverse": True})
        self.assertEqual(r.get_json()["sorted"], [3, 2, 1])

    def test_sort_bad_payload(self):
        self.assertEqual(self.c.post("/api/sort", json={"x": 1}).status_code, 400)
        self.assertEqual(self.c.post("/api/sort", json={"array": "abc"}).status_code, 400)
        self.assertEqual(self.c.post("/api/sort", json={"array": [1, "a"]}).status_code, 400)
        self.assertEqual(self.c.post("/api/sort", json={"array": [True]}).status_code, 400)

    def test_trace(self):
        r = self.c.post("/api/trace", json={"array": [4, 10, 3, 5, 1]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["sorted"], [1, 3, 4, 5, 10])

    def test_trace_limit(self):
        r = self.c.post("/api/trace", json={"array": list(range(100))})
        self.assertEqual(r.status_code, 400)

    def test_random(self):
        r = self.c.get("/api/random?n=8")
        self.assertEqual(len(r.get_json()["array"]), 8)

    def test_trace_desc(self):
        r = self.c.post("/api/trace", json={"array": [4, 10, 3, 5, 1], "reverse": True})
        self.assertEqual(r.get_json()["sorted"], [10, 5, 4, 3, 1])

    def test_sort_stats(self):
        d = self.c.post("/api/sort", json={"array": [3, 1, 2]}).get_json()
        self.assertTrue(d["verified"])
        self.assertIn("time_ms", d)

    def test_random_kinds(self):
        for k in benchmark.KINDS:
            r = self.c.get(f"/api/random?n=12&kind={k}")
            self.assertEqual(len(r.get_json()["array"]), 12)
        self.assertEqual(self.c.get("/api/random?kind=zzz").status_code, 400)
        self.assertEqual(len(self.c.get("/api/random?n=5000").get_json()["array"]), 5000)

    def test_benchmark_api(self):
        r = self.c.get("/api/benchmark?sizes=100,200&repeats=1&algos=heap,quick&kind=sorted")
        d = r.get_json()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(d["algos"], ["heap", "quick"])
        self.assertEqual(len(d["rows"]), 2)
        self.assertEqual(self.c.get("/api/benchmark?sizes=abc").status_code, 400)
        self.assertEqual(self.c.get("/api/benchmark?sizes=1").status_code, 400)

    def test_rejects_nan_inf_and_huge(self):
        for bad in ('{"array":[1,NaN]}', '{"array":[Infinity]}', '{"array":[1e400]}', '{"array":[1' + '0' * 30 + ']}'):
            r = self.c.post("/api/sort", data=bad, content_type="application/json")
            self.assertEqual(r.status_code, 400, bad)

    def test_api_json_errors(self):
        r = self.c.get("/api/nope")
        self.assertEqual(r.status_code, 404)
        self.assertIn("error", r.get_json())
        self.assertEqual(self.c.get("/api/sort").status_code, 404)

    def test_benchmark_too_heavy(self):
        r = self.c.get("/api/benchmark?sizes=100000,90000,80000,70000&repeats=5&algos=heap,quick,merge,python")
        self.assertEqual(r.status_code, 400)

    def test_sort_words(self):
        d = self.c.post("/api/sort", json={"array": ["banana", "Apple", "cherry", "apple"], "mode": "text"}).get_json()
        self.assertEqual([w.casefold() for w in d["sorted"]], ["apple", "apple", "banana", "cherry"])
        self.assertTrue(d["verified"])
        self.assertEqual(d["stats"]["unique"], 4)
        r = self.c.post("/api/sort", json={"array": ["a", 1], "mode": "text"})
        self.assertEqual(r.status_code, 400)
        r = self.c.post("/api/sort", json={"array": ["x" * 101], "mode": "text"})
        self.assertEqual(r.status_code, 400)

    def test_sort_numeric_stats(self):
        d = self.c.post("/api/sort", json={"array": [4, 1, 3, 2]}).get_json()
        self.assertEqual((d["stats"]["min"], d["stats"]["max"], d["stats"]["median"], d["stats"]["sum"]), (1, 4, 2.5, 10))

    def test_security_headers_and_cache(self):
        r = self.c.get("/")
        self.assertIn("script-src 'self'", r.headers["Content-Security-Policy"])
        self.assertEqual(r.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(self.c.get("/api/health").headers["Cache-Control"], "no-store")

    def test_pwa_files(self):
        for path in ("/manifest.webmanifest", "/sw.js", "/icon.svg", "/icon-192.png", "/theme-init.js", "/extras.js", "/robots.txt"):
            self.assertEqual(self.c.get(path).status_code, 200, path)
        self.assertIn("manifest+json", self.c.get("/manifest.webmanifest").content_type)

    def test_no_inline_script_in_index(self):
        import re
        html = self.c.get("/").get_data(as_text=True)
        for m in re.finditer(r"<script([^>]*)>(.*?)</script>", html, re.S):
            self.assertIn("src=", m.group(1), "inline-скрипт запрещён CSP")

    def test_too_large_body(self):
        r = self.c.post("/api/sort", data="[" + "1," * 3_000_000 + "1]", content_type="application/json")
        self.assertEqual(r.status_code, 413)

    def test_rate_limit_benchmark(self):
        import app as appmod
        appmod._hits.clear()
        codes = [self.c.get("/api/benchmark?sizes=10&repeats=1").status_code for _ in range(appmod.BENCH_PER_MIN + 2)]
        self.assertEqual(codes[0], 200)
        self.assertEqual(codes[-1], 429)
        appmod._hits.clear()

    def test_health_version(self):
        d = self.c.get("/api/health").get_json()
        self.assertTrue(d["ok"])
        self.assertIn("version", d)

    def test_index(self):
        self.assertEqual(self.c.get("/").status_code, 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
