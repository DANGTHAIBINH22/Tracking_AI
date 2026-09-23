#!/usr/bin/env bash
# Khởi động toàn bộ hệ thống trên nền web: PostgreSQL -> FastAPI -> Next.js.
#
# Đây là đường chạy chính thức của dự án. Hai script run_webcam.py / run_video.py
# chỉ là công cụ debug pipeline bằng cửa sổ OpenCV, không thuộc luồng sản phẩm.
#
#   ./run_web.sh              # cổng mặc định 8000 (API) và 3000 (web)
#   API_PORT=8080 ./run_web.sh
set -euo pipefail

cd "$(dirname "$0")"

API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
# Nạp DATABASE_URL từ file .env nếu chưa được gán
if [ -f .env ]; then
  env_db_url="$(grep -E '^DATABASE_URL=' .env | cut -d '=' -f2- | tr -d '\"' | tr -d '\'')"
  if [ -n "$env_db_url" ]; then
    DATABASE_URL="${DATABASE_URL:-$env_db_url}"
  fi
fi
export DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/signage}"

say() { printf '\033[1;36m[web]\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m[web]\033[0m %s\n' "$1" >&2; exit 1; }

# ---- 1. PostgreSQL ----
if [[ "$DATABASE_URL" == *"localhost"* || "$DATABASE_URL" == *"127.0.0.1"* ]]; then
  command -v pg_isready >/dev/null 2>&1 || die "Chưa cài PostgreSQL client. Chạy: brew install postgresql@14 (hoặc docker compose up -d)"
  pg_isready -q || die "PostgreSQL chưa chạy. Chạy: brew services start postgresql@14 (hoặc docker compose up -d)"

  # Tách tên database ra khỏi DSN để tạo nếu chưa có. Bảng thì server tự tạo lúc
  # khởi động (server/db.py), nên chỉ cần lo đúng bước này.
  DB_NAME="$(printf '%s' "$DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"
  if ! psql -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
    say "Tạo database '$DB_NAME'..."
    createdb "$DB_NAME"
  fi
  say "PostgreSQL sẵn sàng ($DB_NAME)"
else
  say "Sử dụng Cloud / Remote PostgreSQL (Neon)"
fi

# ---- 2. Phụ thuộc ----
[ -d .venv ] || { say "Dựng môi trường Python..."; uv sync; }
[ -d web/node_modules ] || { say "Cài đặt frontend..."; (cd web && npm install); }

# web/.env.local phải trỏ đúng cổng API, nếu không trình duyệt sẽ gọi nhầm chỗ.
printf 'NEXT_PUBLIC_API_BASE=http://localhost:%s\n' "$API_PORT" > web/.env.local

# ---- 3. Chạy song song ----
# Một trap duy nhất: Ctrl-C phải tắt cả hai tiến trình, nếu không lần chạy sau sẽ
# vướng "address already in use".
pids=()
cleanup() {
  say "Đang dừng..."
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

say "API      -> http://localhost:$API_PORT/docs"
PYTHONPATH=. uv run uvicorn server.main:app --port "$API_PORT" --host 0.0.0.0 &
pids+=($!)

say "Dashboard -> http://localhost:$WEB_PORT"
(cd web && npm run dev -- --port "$WEB_PORT") &
pids+=($!)

wait
