import subprocess, sys, os
sys.path.insert(0, "backend")
os.chdir("/home/claude/heapsort/docs")

COMMON = 'fontname="Times New Roman" fontsize=13 '
def fc(name, body):
    src = f'''digraph G {{ rankdir=TB; nodesep=0.5; ranksep=0.35; dpi=200;
node [{COMMON} style=filled fillcolor=white color="#222222"]; edge [fontname="Times New Roman" fontsize=12 arrowsize=0.7];
{body} }}'''
    open(name + ".dot", "w").write(src)
    subprocess.run(["dot", "-Tpng", name + ".dot", "-o", name + ".png"], check=True)

T = 'shape=box style="rounded,filled" fillcolor="#dbe4ff"'
IO = 'shape=parallelogram fillcolor="#e6fcf5"'
P = 'shape=box fillcolor="#fff9db"'
D = 'shape=diamond fillcolor="#ffe3e3"'

fc("flow_main", f'''
s [label="Начало: HeapSort" {T}];
inp [label="Ввод: массив a[0..n-1], n" {IO}];
b1 [label="i = n div 2 − 1" {P}];
c1 [label="i ≥ 0 ?" {D}];
s1 [label="SiftDown(a, i, n)" {P} peripheries=2];
b2 [label="i = i − 1" {P}];
e1 [label="end = n − 1" {P}];
c2 [label="end ≥ 1 ?" {D}];
sw [label="обмен a[0] ↔ a[end]" {P}];
s2 [label="SiftDown(a, 0, end)" {P} peripheries=2];
e2 [label="end = end − 1" {P}];
out [label="Вывод: отсортированный массив a" {IO}];
f [label="Конец" {T}];
s->inp->b1->c1; c1->s1 [label="да"]; s1->b2; b2->c1;
c1->e1 [label="нет"]; e1->c2; c2->sw [label="да"]; sw->s2->e2; e2->c2;
c2->out [label="нет"]; out->f;
''')

fc("flow_sift", f'''
s [label="Начало: SiftDown(a, i, size)" {T}];
l [label="largest = i\\nleft = 2·i + 1\\nright = 2·i + 2" {P}];
c1 [label="left < size\\nи a[left] > a[largest] ?" {D}];
a1 [label="largest = left" {P}];
c2 [label="right < size\\nи a[right] > a[largest] ?" {D}];
a2 [label="largest = right" {P}];
c3 [label="largest = i ?" {D}];
sw [label="обмен a[i] ↔ a[largest]\\ni = largest" {P}];
f [label="Конец (возврат)" {T}];
s->l->c1; c1->a1 [label="да"]; c1->c2 [label="нет"]; a1->c2;
c2->a2 [label="да"]; c2->c3 [label="нет"]; a2->c3;
c3->f [label="да"]; c3->sw [label="нет"]; sw->l [constraint=false];
''')
print("flowcharts ok")

# --- график бенчмарка ---
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, math
sys.path.insert(0, "../backend")
import benchmark
rows = benchmark.run([1000,2000,5000,10000,20000,50000,100000], repeats=3)
import json; json.dump(rows, open("bench.json","w"))
plt.rcParams["font.family"] = "DejaVu Serif"
n=[r["n"] for r in rows]; t=[r["seconds"] for r in rows]
c=t[-1]/(n[-1]*math.log2(n[-1]))
fig,ax=plt.subplots(figsize=(7,4),dpi=200)
ax.plot(n,t,"o-",color="#3b5bdb",lw=2,label="измеренное время")
ax.plot(n,[c*x*math.log2(x) for x in n],"--",color="#ff922b",lw=2,label="c·n·log₂n")
ax.set_xlabel("n, число элементов"); ax.set_ylabel("время, с"); ax.grid(alpha=.3); ax.legend()
fig.tight_layout(); fig.savefig("bench.png")
print(rows)
