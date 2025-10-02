#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Inputs
CN=${CN:-localhost}
DAYS=${DAYS:-3650}

# Files
BACKEND_KEY="dashboard.key"
BACKEND_CRT="dashboard.crt"
FRONTEND_KEY="vite.key"
FRONTEND_CRT="vite.crt"

openssl version >/dev/null 2>&1 || { echo "OpenSSL not found"; exit 1; }

make_cert() {
  local KEY=$1
  local CRT=$2
  local CN=$3
  local DAYS=$4
  local CONF=$(mktemp)
  cat > "$CONF" <<CONF
[ req ]
default_bits       = 2048
distinguished_name = req_distinguished_name
req_extensions     = v3_req
x509_extensions    = v3_req
prompt             = no

[ req_distinguished_name ]
C  = US
ST = Local
L  = Dev
O  = Dev
OU = Dev
CN = $CN

[ v3_req ]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[ alt_names ]
DNS.1 = $CN
DNS.2 = localhost
IP.1  = 127.0.0.1
CONF
  openssl req -x509 -nodes -newkey rsa:2048 -days "$DAYS" -keyout "$KEY" -out "$CRT" -config "$CONF" >/dev/null 2>&1
  rm -f "$CONF"
}

echo "Generating backend cert ($BACKEND_CRT) and key ($BACKEND_KEY) for CN=$CN..."
make_cert "$BACKEND_KEY" "$BACKEND_CRT" "$CN" "$DAYS"

echo "Generating frontend cert ($FRONTEND_CRT) and key ($FRONTEND_KEY) for CN=$CN..."
make_cert "$FRONTEND_KEY" "$FRONTEND_CRT" "$CN" "$DAYS"

echo "Done. Trust these certs in your OS keychain for a green lock, or proceed with warnings."
