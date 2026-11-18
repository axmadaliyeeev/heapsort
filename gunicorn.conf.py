"""Конфигурация gunicorn для Railway (и любого другого PaaS): порт и воркеры берутся из переменных окружения."""
import os

chdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))
timeout = 120                      # тяжёлые замеры /api/benchmark
graceful_timeout = 30
keepalive = 5
accesslog = "-"
errorlog = "-"
forwarded_allow_ips = "*"          # за прокси Railway: корректные X-Forwarded-* (https, IP клиента)
