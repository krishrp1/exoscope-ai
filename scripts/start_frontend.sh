#!/usr/bin/env bash
# Build (if needed) and start the Next.js frontend on http://localhost:3001
set -euo pipefail
cd "$(dirname "$0")/../frontend"
[ -d node_modules ] || npm install
[ -f .env.local ] || echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > .env.local
[ -f .next/BUILD_ID ] || npm run build
exec npx next start -p "${FRONTEND_PORT:-3001}"
