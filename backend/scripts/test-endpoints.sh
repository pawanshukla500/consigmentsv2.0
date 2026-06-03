#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# End-to-end endpoint test against the live deployment (Postgres-backed).
# Usage:  bash test-endpoints.sh https://consignment.youthnic.shop
# ════════════════════════════════════════════════════════════════════════════
BASE="${1:-https://consignment.youthnic.shop}"
EMAIL="returnorders@vbexports.co.in"
PASS='XchangeC$'
PASS_FAIL=0

echo "Testing: $BASE"
echo "════════════════════════════════════════"

# Login
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')

if [ -z "$TOKEN" ]; then echo "❌ LOGIN FAILED — aborting"; exit 1; fi
echo "✅ Login OK"

check() {
  local label=$1 method=$2 path=$3 data=$4 expect=${5:-200}
  if [ -n "$data" ]; then
    code=$(curl -s -o /tmp/resp -w "%{http_code}" -X "$method" "$BASE$path" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data")
  else
    code=$(curl -s -o /tmp/resp -w "%{http_code}" -X "$method" "$BASE$path" -H "Authorization: Bearer $TOKEN")
  fi
  if [ "$code" = "$expect" ]; then echo "✅ $label ($code)"; else echo "❌ $label (got $code, want $expect)"; PASS_FAIL=1; fi
}

echo "── Reads ──"
check "GET /auth/me"            GET  "/api/auth/me"
check "GET /consignments"       GET  "/api/consignments"
check "GET /marketplaces"       GET  "/api/marketplaces"
check "GET /docket-companies"   GET  "/api/docket-companies"
check "GET /users"              GET  "/api/users"
check "GET /audit-logs"         GET  "/api/audit-logs"
check "GET /productivity"       GET  "/api/productivity"
check "GET /productivity/planning" GET "/api/productivity/planning"
check "GET /settings"           GET  "/api/settings"

echo "── Write flow (Postgres) ──"
check "POST create marketplace" POST "/api/marketplaces" '{"name":"PG Test MP","warehouses":["WH1"]}' 201
check "POST create consignment" POST "/api/consignments" '{"id":"PGTEST1","internalShipmentNo":"PG-IN-1","skus":[{"barcode":"BC1","marketplaceSku":"MP1","internalSku":"INT1","requiredQty":5}]}' 201
check "GET created consignment" GET  "/api/consignments/PGTEST1"

echo "── Packing flow (Postgres) ──"
check "POST packing/load"       POST "/api/packing/load" '{"consignment_id":"PGTEST1"}'
check "POST packing/increment"  POST "/api/packing/increment" '{"consignment_id":"PGTEST1","barcode":"BC1","box_no":"1","qty":2}'
check "POST packing/save-box"   POST "/api/packing/save-box" '{"consignment_id":"PGTEST1","box_no":"1"}'

# Verify data persisted & reconciles
DETAIL=$(curl -s "$BASE/api/consignments/PGTEST1" -H "Authorization: Bearer $TOKEN")
PACKED=$(echo "$DETAIL" | grep -o '"totalPackedQty":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "   → totalPackedQty in DB: ${PACKED:-?} (expect 2)"
[ "$PACKED" = "2" ] && echo "✅ Packed qty reconciles" || { echo "❌ Packed qty wrong"; PASS_FAIL=1; }

echo "── Cleanup ──"
check "DELETE consignment"      DELETE "/api/consignments/PGTEST1"

echo "════════════════════════════════════════"
[ "$PASS_FAIL" = "0" ] && echo "🎉 ALL TESTS PASSED — Postgres backend working" || echo "⚠️  SOME TESTS FAILED — check above"
