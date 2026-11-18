const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,ImageRun,Table,TableRow,TableCell,WidthType,AlignmentType,BorderStyle,ShadingType,PageBreak,Footer,PageNumber,HeadingLevel,LevelFormat}=require('docx');
const T=JSON.parse(fs.readFileSync('trace.json','utf8'));
const B=JSON.parse(fs.readFileSync('bench.json','utf8'));
const FONT="Times New Roman", SZ=28, LINE=360; // 14pt, 1.5
const run=(t,o={})=>new TextRun({text:t,font:FONT,size:SZ,...o});
const P=(t,o={})=>new Paragraph({spacing:{line:LINE,after:0},alignment:AlignmentType.JUSTIFIED,indent:{firstLine:709},children:Array.isArray(t)?t:[run(t)],...o});
const C=(t,o={})=>new Paragraph({spacing:{line:LINE,after:0},alignment:AlignmentType.CENTER,children:[run(t,o.r||{})],...(o.p||{})});
const H=(t)=>new Paragraph({heading:HeadingLevel.HEADING_1,spacing:{before:240,after:120,line:LINE},keepNext:true,alignment:AlignmentType.CENTER,children:[run(t,{bold:true})]});
const H2=(t)=>new Paragraph({heading:HeadingLevel.HEADING_2,spacing:{before:120,after:60,line:LINE},keepNext:true,children:[run(t,{bold:true})]});
const bul=(t)=>new Paragraph({numbering:{reference:"b",level:0},spacing:{line:LINE,after:0},children:[run(t)]});
const code=(src)=>src.split('\n').map(l=>new Paragraph({spacing:{line:276,after:0},shading:{type:ShadingType.CLEAR,fill:"F3F4F6"},children:[new TextRun({text:l||" ",font:"Courier New",size:21})]}));
const img=(f,w,h)=>new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:120,after:60},keepNext:true,children:[new ImageRun({type:"png",data:fs.readFileSync(f),transformation:{width:w,height:h}})]});
const cap=(t)=>C(t,{r:{italics:true}});
const bd={style:BorderStyle.SINGLE,size:4,color:"000000"}, borders={top:bd,bottom:bd,left:bd,right:bd};
function table(widths,head,rows){
  const total=widths.reduce((a,b)=>a+b,0);
  const cell=(t,w,h)=>new TableCell({borders,width:{size:w,type:WidthType.DXA},shading:h?{type:ShadingType.CLEAR,fill:"E7E9EE"}:undefined,margins:{top:40,bottom:40,left:80,right:80},
    children:[new Paragraph({spacing:{line:276},children:[new TextRun({text:String(t),font:FONT,size:24,bold:h})]})]});
  return new Table({width:{size:total,type:WidthType.DXA},columnWidths:widths,rows:[
    new TableRow({tableHeader:true,children:head.map((h,i)=>cell(h,widths[i],true))}),
    ...rows.map(r=>new TableRow({cantSplit:true,children:r.map((c,i)=>cell(c,widths[i],false))}))]});
}
const heapsrc=fs.readFileSync('../backend/heapsort.py','utf8');
const core=heapsrc.split('\n');
const s0=core.findIndex(l=>l.startsWith('def sift_down'));
const s1=core.findIndex(l=>l.startsWith('def heap_sort_trace'));
const coreCode=core.slice(s0,s1).join('\n').trimEnd();

// title page
const title=[
 C("МИНИСТЕРСТВО ВЫСШЕГО ОБРАЗОВАНИЯ, НАУКИ И ИННОВАЦИЙ РЕСПУБЛИКИ УЗБЕКИСТАН"),
 C("ФЕРГАНСКИЙ ГОСУДАРСТВЕННЫЙ ТЕХНИЧЕСКИЙ УНИВЕРСИТЕТ"),
 C("Кафедра «Программный инжиниринг и кибербезопасность»"),
 ...Array(5).fill(0).map(()=>C(" ")),
 C("ОТЧЁТ",{r:{bold:true}}),
 C("по практической работе по дисциплине «Алгоритмы»"),
 C("Тема: «Разработка алгоритма пирамидальной сортировки (Heap sort)»",{r:{bold:true}}),
 ...Array(6).fill(0).map(()=>C(" ")),
 new Paragraph({spacing:{line:LINE},indent:{left:4800},children:[run("Выполнил(а): ________________")]}),
 new Paragraph({spacing:{line:LINE},indent:{left:4800},children:[run("Группа: ____________")]}),
 new Paragraph({spacing:{line:LINE},indent:{left:4800},children:[run("Проверил(а): ________________")]}),
 ...Array(4).fill(0).map(()=>C(" ")),
 C("Фергана — 2026"),
 new Paragraph({children:[new PageBreak()]}),
];

const body=[
 H("1. Цель работы"),
 P("Изучить структуру данных «куча» (пирамида) и реализовать на её основе сортировку массива; разработать блок-схему алгоритма, выполнить его трассировку, реализовать программу на языке Python с клиент-серверным веб-интерфейсом, протестировать её и оценить временную и пространственную сложность."),
 H("2. Постановка задачи"),
 P("Требуется упорядочить заданный числовой массив по возрастанию (по запросу — по убыванию) методом пирамидальной сортировки."),
 H2("Входные данные"),
 bul("массив a[0..n−1] из n чисел (целых или вещественных), n ≥ 0;"),
 bul("необязательные параметры: признак обратного порядка (reverse) и функция ключа (key)."),
 H2("Выходные данные"),
 bul("новый массив, содержащий те же элементы в неубывающем порядке;"),
 bul("для визуализации: журнал шагов, число сравнений и число обменов."),
 H2("Ограничения"),
 P("Алгоритм работает на месте (дополнительная память O(1)), сортировка неустойчивая. Веб-сервис принимает до 200 000 элементов для сортировки и до 64 элементов для пошаговой трассировки."),
 H("3. Теоретические сведения"),
 P("Двоичная куча — почти полное двоичное дерево, хранимое в массиве. Для узла с индексом i (нумерация с нуля) левый потомок имеет индекс 2i+1, правый — 2i+2, родитель — ⌊(i−1)/2⌋. В max-куче значение каждого узла не меньше значений его потомков, поэтому максимум находится в корне a[0]."),
 P("Алгоритм состоит из двух фаз. Фаза 1 — построение кучи: для i от ⌊n/2⌋−1 до 0 выполняется просеивание вниз SiftDown(i); сложность O(n). Фаза 2 — сортировка: n−1 раз меняем корень с последним элементом кучи, уменьшаем размер кучи и просеиваем новый корень; сложность O(n log n)."),
 H("4. Блок-схема алгоритма"),
 P("Блок-схемы разработаны для среды Flowgorithm: основная программа и подпрограмма SiftDown (блок «Call» с двойными линиями)."),
 img('flow_main.png',380,333),
 cap("Рисунок 1 — Блок-схема основной программы HeapSort"),
 img('flow_sift.png',300,448),
 cap("Рисунок 2 — Блок-схема подпрограммы SiftDown"),
 H("5. Трассировка алгоритма"),
 P("Тестовые данные: a = [4, 10, 3, 5, 1], n = 5. Ниже показаны только шаги, изменяющие массив (сравнения опущены)."),
 table([700,4300,2800,1300],["№","Действие","Массив","Размер кучи"],T.rows.map(r=>[r[0],r[1],r[2],r[3]])),
 P(`Результат: [${T.sorted.join(", ")}]. Всего выполнено ${T.cmp} сравнений и ${T.swp} обменов. Результат совпал с ожидаемым, алгоритм корректен на тестовых данных.`,{spacing:{before:120,line:LINE}}),
 H("6. Программная реализация"),
 P("Проект состоит из backend на Python (Flask) и frontend на HTML/CSS/JavaScript:"),
 table([2900,6200],["Файл","Назначение"],[
  ["backend/heapsort.py","ядро: heap_sort, heap_sort_trace, sift_down"],
  ["backend/app.py","REST API: /api/sort, /api/trace, /api/random, /api/benchmark"],
  ["backend/benchmark.py","замер времени для оценки сложности"],
  ["frontend/","визуализатор: массив и дерево кучи, пошаговое воспроизведение"],
  ["tests/test_heapsort.py","20 автоматических тестов (unittest)"]]),
 P("Основной код алгоритма:",{spacing:{before:120,line:LINE}}),
 ...code(coreCode),
 H("7. Тестирование и отладка"),
 P("Для проверки использован модуль unittest. Результаты сортировки сравниваются со встроенной функцией sorted() на 300 случайных массивах, а также проверяются граничные и служебные случаи."),
 table([700,4400,2600,1400],["№","Тест","Вход","Результат"],[
  [1,"Пустой массив","[]","пройден"],[2,"Один элемент","[7]","пройден"],
  [3,"Уже отсортирован","[1, 2, 3, 4]","пройден"],[4,"Обратный порядок","[5, 4, 3, 2, 1]","пройден"],
  [5,"Дубликаты","[3, 1, 3, 1, 2, 2]","пройден"],[6,"Отрицательные и вещественные","[0, −5, 2.5, −1, 10]","пройден"],
  [7,"Порядок по убыванию","[2, 9, 4], reverse","пройден"],[8,"Исходный список не изменён","[3, 1, 2]","пройден"],
  [9,"Сортировка по ключу","[«ccc», «a», «bb»], key=len","пройден"],[10,"300 случайных массивов","random vs sorted()","пройден"],
  [11,"Верхняя граница сравнений","n = 64, обратный порядок","пройден"],[12,"API: ошибочные данные","не список, строки, bool","код 400"]]),
 P("Итог: все 20 тестов (13 алгоритмических и 7 тестов API, включая раздачу frontend) выполнены успешно.",{spacing:{before:120,line:LINE}}),
 H("8. Оценка сложности"),
 H2("Временная сложность"),
 P("Построение кучи — O(n). Каждое из n−1 извлечений требует просеивания по высоте дерева ⌊log₂n⌋, то есть O(log n). Итого O(n log n) в лучшем, среднем и худшем случаях."),
 H2("Пространственная сложность"),
 P("Сортировка выполняется на месте, глубина рекурсии отсутствует (просеивание итеративное): O(1) дополнительной памяти. (Функция heap_sort создаёт копию входа для сохранности исходных данных — это O(n) только на уровне интерфейса.)"),
 H2("Экспериментальная проверка"),
 table([1800,2300,2300,2700],["n","Время, с","n·log₂n","мкс на n·log₂n"],B.map(r=>[r.n,r.seconds,r.n_log_n,r.ratio])),
 img('bench.png',480,274),
 cap("Рисунок 3 — Время работы в зависимости от n"),
 P("Отношение времени к n·log₂n остаётся почти постоянным, что подтверждает оценку O(n log n)."),
 H("9. Руководство по запуску"),
 ...["pip install flask","python backend/app.py","открыть в браузере http://127.0.0.1:5000","python -m unittest discover -s tests"].map(bul),
 H("10. Выводы"),
 P("В ходе работы изучена структура данных «куча», разработана и проверена трассировкой блок-схема алгоритма, реализована пирамидальная сортировка на Python и веб-приложение для её пошаговой визуализации. Тестирование подтвердило корректность, эксперимент — сложность O(n log n) при O(1) дополнительной памяти. К недостаткам относятся неустойчивость и худшая локальность обращений к памяти по сравнению с быстрой сортировкой; преимущество — гарантированная оценка O(n log n) в худшем случае."),
 H("Список литературы"),
 ...["Кормен Т., Лейзерсон Ч., Ривест Р., Штайн К. Алгоритмы: построение и анализ. — М.: Вильямс.","Кнут Д. Искусство программирования, т. 3: Сортировка и поиск. — М.: Вильямс.","Седжвик Р. Алгоритмы на Java / C++. — М.: Вильямс.","Документация Python: https://docs.python.org/3/","Flowgorithm: http://www.flowgorithm.org/"].map((t,i)=>new Paragraph({numbering:{reference:"n",level:0},spacing:{line:LINE},children:[run(t)]})),
];
const doc=new Document({
 styles:{default:{document:{run:{font:FONT,size:SZ}}},paragraphStyles:[
  {id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,run:{font:FONT,size:SZ,bold:true},paragraph:{spacing:{before:240,after:120},keepNext:true,outlineLevel:0}},
  {id:"Heading2",name:"Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,run:{font:FONT,size:SZ,bold:true},paragraph:{spacing:{before:120,after:60},keepNext:true,outlineLevel:1}}]},
 numbering:{config:[
  {reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"–",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:1069,hanging:360}}}}]},
  {reference:"n",levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:1069,hanging:360}}}}]}]},
 sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1134,bottom:1134,left:1701,right:850}}},
  footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:[PageNumber.CURRENT],font:FONT,size:24})]})]})},
  children:[...title,...body]}]});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync('Heap_sort_report.docx',b);console.log('ok')});
