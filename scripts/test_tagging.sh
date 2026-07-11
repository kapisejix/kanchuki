#!/bin/bash
# Full end-to-end AI tagging test
cd /e/Kanchuki

echo "=== STEP 1: Auth ==="
curl -s -o /dev/null -X POST http://localhost:3001/v1/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919999999999"}'

VERIFY=$(curl -s -X POST http://localhost:3001/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919999999999","otp":"123456"}')

TOKEN=$(echo "$VERIFY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('access_token',''))" 2>/dev/null)
RETAILER_ID=$(echo "$VERIFY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('retailer',{}).get('id',''))" 2>/dev/null)
echo "Auth OK: Retailer $RETAILER_ID"

echo ""
echo "=== STEP 2: Upload URL ==="
UPLOAD=$(curl -s -X POST http://localhost:3001/v1/products/upload-url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"filename":"test.jpg","content_type":"image/jpeg","size_bytes":30146}')

echo "$UPLOAD" | python3 -m json.tool 2>/dev/null

R2_KEY=$(echo "$UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('r2_key',''))" 2>/dev/null)
PUBLIC_URL=$(echo "$UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('public_url',''))" 2>/dev/null)
PRESIGNED=$(echo "$UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('upload_url',''))" 2>/dev/null)

echo ""
echo "=== STEP 3: Upload to R2 ==="
curl -s -o /dev/null -w 'HTTP %{http_code}\n' \
  -X PUT "$PRESIGNED" \
  -H "Content-Type: image/jpeg" \
  --data-binary @test-real-shirt.jpg

echo ""
echo "=== STEP 4: Verify R2 public access ==="
curl -s -o /dev/null -w 'Public URL: HTTP %{http_code}\n' "$PUBLIC_URL"

echo ""
echo "=== STEP 5: Create Product ==="
CREATE=$(curl -s -X POST http://localhost:3001/v1/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"photo_r2_key": "'"$R2_KEY"'","photo_url": "'"$PUBLIC_URL"'","price_min": 1499,"price_max": 2499}')

echo "$CREATE" | python3 -m json.tool 2>/dev/null

PID=$(echo "$CREATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id','FAILED'))" 2>/dev/null)
echo ""
echo "Product ID: $PID"

if [ "$PID" = "FAILED" ] || [ -z "$PID" ]; then
  echo "❌ Product creation failed!"
  exit 1
fi

echo ""
echo "=== STEP 6: Watch AI Tagging (polling 90s) ==="
for i in $(seq 1 30); do
  sleep 3
  P=$(curl -s -X GET "http://localhost:3001/v1/products/$PID" -H "Authorization: Bearer $TOKEN")
  TAGGED=$(echo "$P" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(d.get('ai_tagged','?'))" 2>/dev/null)
  ERR=$(echo "$P" | python3 -c "import sys,json; e=json.load(sys.stdin).get('data',{}).get('ai_tag_error',''); print(e[:80] if e else '-')" 2>/dev/null)
  CAT=$(echo "$P" | python3 -c "import sys,json; c=json.load(sys.stdin).get('data',{}).get('category',''); print(c[:30] if c else '-')" 2>/dev/null)
  echo "  [${i}x3s] tagged=$TAGGED  cat=$CAT  err=${ERR}"
  
  if [ "$TAGGED" = "True" ]; then
    echo ""
    echo "🎉🎉 AI TAGGING COMPLETE! 🎉🎉"
    echo "$P" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('data',{})
for k in ['category','product_type','primary_color','secondary_colors','fabric_estimate','pattern','embellishments','occasions','price_range_estimate','search_tags']:
    v=d.get(k)
    if v:
        print(f'  {k}: {v}')
" 2>/dev/null
    break
  fi
  if [ "$ERR" != "-" ] && [ -n "$ERR" ]; then
    echo ""
    echo "❌ ERROR: ${ERR}"
    echo "$P" | python3 -m json.tool 2>/dev/null | head -20
    break
  fi
done
