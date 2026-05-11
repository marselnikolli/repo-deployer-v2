#!/usr/bin/env bash
set -e

# ── Repo Deployer — Proxmox / server setup ─────────────────────────────────────
# Run this once on your Proxmox container to get everything running.
# Usage: bash setup-proxmox.sh [HOST_IP]
#   HOST_IP — the IP or hostname the app will be reachable at (default: auto-detect)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── Prerequisites ───────────────────────────────────────────────────────────────
command -v docker  >/dev/null 2>&1 || error "Docker is not installed. Install it first: https://docs.docker.com/engine/install/"
command -v git     >/dev/null 2>&1 || error "Git is not installed (apt install git)."

COMPOSE_CMD="docker compose"
$COMPOSE_CMD version >/dev/null 2>&1 || COMPOSE_CMD="docker-compose"
$COMPOSE_CMD version >/dev/null 2>&1 || error "Docker Compose is not available. Install the Docker Compose plugin."

# ── Determine host IP ───────────────────────────────────────────────────────────
HOST_IP="${1:-}"
if [[ -z "$HOST_IP" ]]; then
  HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  [[ -z "$HOST_IP" ]] && HOST_IP="localhost"
  info "Auto-detected IP: $HOST_IP  (pass a different IP as first argument if wrong)"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Repo Deployer — Proxmox Setup            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# ── Create .env if missing ──────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    info "Created .env from .env.example — edit it to add your GitHub token and OAuth credentials."
  else
    touch .env
    warn ".env.example not found; created empty .env."
  fi
else
  info ".env already exists — skipping copy."
fi

# ── Set backup path ─────────────────────────────────────────────────────────────
BACKUP_DIR="/opt/repo-deployer/backups"
mkdir -p "$BACKUP_DIR"

if grep -q "^BACKUP_HOST_PATH=" .env 2>/dev/null; then
  sed -i "s|^BACKUP_HOST_PATH=.*|BACKUP_HOST_PATH=${BACKUP_DIR}|" .env
else
  echo "BACKUP_HOST_PATH=${BACKUP_DIR}" >> .env
fi
success "Backup path set to $BACKUP_DIR"

# ── Update OAuth redirect URIs to the real host ─────────────────────────────────
FRONTEND_URL="http://${HOST_IP}:3000"
BACKEND_URL="http://${HOST_IP}:8001"

for key in GITHUB_OAUTH_REDIRECT_URI GOOGLE_OAUTH_REDIRECT_URI; do
  if grep -q "^${key}=" .env 2>/dev/null; then
    OLD_VAL=$(grep "^${key}=" .env | cut -d= -f2-)
    if echo "$OLD_VAL" | grep -q "localhost"; then
      NEW_VAL=$(echo "$OLD_VAL" | sed "s|http://localhost:3000|${FRONTEND_URL}|g")
      sed -i "s|^${key}=.*|${key}=${NEW_VAL}|" .env
      info "Updated $key: $NEW_VAL"
    fi
  fi
done

# Update FRONTEND_URL / BACKEND_URL in .env
for key in FRONTEND_URL; do
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${FRONTEND_URL}|" .env
  else
    echo "${key}=${FRONTEND_URL}" >> .env
  fi
done
for key in BACKEND_URL; do
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${BACKEND_URL}|" .env
  else
    echo "${key}=${BACKEND_URL}" >> .env
  fi
done
success "App URLs set to $FRONTEND_URL"

# ── Pull / build and start ──────────────────────────────────────────────────────
info "Building and starting containers (this may take a few minutes on first run)…"
$COMPOSE_CMD -f docker-compose.yml -f docker-compose.proxmox.yml up -d --build

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Repo Deployer is running!                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Frontend : ${CYAN}${FRONTEND_URL}${NC}"
echo -e "  Backend  : ${CYAN}${BACKEND_URL}${NC}"
echo ""
echo -e "  ${YELLOW}Browser extension setup:${NC}"
echo -e "  Open the extension sidebar → scroll to \"Server URL\""
echo -e "  Enter: ${CYAN}${FRONTEND_URL}${NC} and click Save"
echo ""
echo -e "  ${YELLOW}OAuth redirect URIs${NC} (if using GitHub/Google login):"
echo -e "  Update your OAuth app callback to: ${CYAN}${FRONTEND_URL}/auth/github/callback${NC}"
echo ""
info "To stop:   $COMPOSE_CMD -f docker-compose.yml -f docker-compose.proxmox.yml down"
info "To logs:   $COMPOSE_CMD logs -f"
