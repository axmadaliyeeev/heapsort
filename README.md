# Heap Sort — пирамидальная сортировка (backend + frontend)

Интерактивный визуализатор, песочница кучи, сортировка собственных данных и сравнение скорости алгоритмов.
Дизайн — в стиле shoyadbek.uz (тёмная/светлая тема, лаймовый акцент).

## Возможности
- **Визуализация** — пошаговая сортировка (по возрастанию/убыванию), столбцы + дерево кучи, псевдокод с подсветкой,
  фазы алгоритма, пропуск сравнений, свайпы на телефоне, мини-плеер, ссылка на массив («Поделиться»).
- **Песочница кучи** — вставка (sift-up), извлечение корня (sift-down), построение кучи по Флойду, max/min-куча, «извлечь всё».
- **Сортировка данных** — числа (до 200 000) и слова (до 50 000), загрузка из .txt/.csv/.json, статистика
  (min/max/среднее/медиана/сумма), копирование и скачивание результата.
- **Сравнение скорости** — Heap / Quick / Merge / Timsort на разных типах данных, оценка показателя роста nᵏ, экспорт CSV.
- **PWA** — устанавливается на телефон, визуализатор и песочница работают офлайн.

## Локальный запуск
```bash
python -m pip install -r requirements.txt
python backend/app.py            # http://127.0.0.1:5000
python -m unittest discover -s tests -v
```
(на Linux/macOS продакшн-режим: `gunicorn -c gunicorn.conf.py app:app`; gunicorn на Windows не работает — используйте `python backend/app.py`)

## Деплой на Railway
1. Загрузите проект в GitHub-репозиторий (корень репозитория = эта папка: `Procfile`, `railway.json`, `requirements.txt`, `backend/`, `frontend/`).
2. Railway → **New Project → Deploy from GitHub repo** → выберите репозиторий. Сборка автоматическая
   (Python 3.12 из `.python-version`, зависимости из `requirements.txt`).
3. Запуск: `gunicorn -c gunicorn.conf.py app:app` (из `railway.json`/`Procfile`), проверка здоровья — `/api/health`.
4. **Settings → Networking → Generate Domain** — получите публичный адрес `*.up.railway.app`.

Через CLI: `npm i -g @railway/cli && railway login && railway init && railway up`.

### Переменные окружения (необязательные)
| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | задаёт Railway | порт приложения |
| `WEB_CONCURRENCY` | 2 | число воркеров gunicorn |
| `GUNICORN_THREADS` | 4 | потоков на воркер |
| `MAX_SORT_SIZE` | 200000 | максимум элементов в `/api/sort` |
| `MAX_BENCH_SIZE` / `MAX_BENCH_WORK` | 100000 / 1500000 | пределы замера |
| `BENCH_PER_MIN` / `SORT_PER_MIN` | 8 / 120 | лимит запросов с одного IP в минуту |
| `LOG_LEVEL` | INFO | уровень логов |

Замеры — CPU-нагрузка: на бесплатном/малом тарифе оставьте `WEB_CONCURRENCY=1–2`, чтобы цифры были стабильными.
Лимиты запросов хранятся в памяти процесса (на каждый воркер отдельно).

## API
`POST /api/sort {"array":[..],"reverse":false,"mode":"number|text"}` · `POST /api/trace {"array":[..],"reverse":false}` ·
`GET /api/random?n=10&kind=random|sorted|reversed|nearly|few_unique` ·
`GET /api/benchmark?sizes=1000,5000&kind=random&algos=heap,quick,merge,python&repeats=2` · `GET /api/health`

## Структура
`backend/` (Flask, алгоритмы, замеры) · `frontend/` (SPA на чистом JS, service worker) · `tests/` · `docs/` (блок-схемы, отчёт) ·
`Procfile`, `railway.json`, `gunicorn.conf.py`, `requirements.txt`, `.python-version`.
