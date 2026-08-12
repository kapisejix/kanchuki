// Live validation for MSG91's widget Verify Access Token endpoint (2026-08-12).
//
// The REQUEST contract is confirmed (MSG91 dashboard curl): POST the authkey
// AND the widget JWT in the body, field name `access-token`. The RESPONSE
// shape is not formally documented — the lib (apps/api/src/lib/msg91-otp.ts,
// verifyMsg91WidgetToken) parses several candidate shapes defensively, but
// this script shows the RAW response from a real token so we can lock it down.
//
// Usage:
//   npx tsx scripts/verify-msg91-token.ts "<jwt_token_from_otp_widget>"
//
// Reads MSG91_AUTHKEY from the root .env. Get a real token by completing an
// OTP verification in the widget (mobile app / billing page) and capturing
// the access token the widget returns.
process.loadEnvFile();

const AUTHKEY = process.env.MSG91_AUTHKEY;
const token = process.argv[2];

if (!AUTHKEY) {
  console.error('MSG91_AUTHKEY is not set in .env — add it first.');
  process.exit(1);
}
if (!token) {
  console.error(
    'Pass the widget JWT as the first argument: npx tsx scripts/verify-msg91-token.ts "<jwt>"',
  );
  process.exit(1);
}

const url = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';
const body = JSON.stringify({ authkey: AUTHKEY, 'access-token': token });

console.log(`POST ${url}`);
console.log(`body: ${body.slice(0, 40)}…${body.slice(-24)}`);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await res.text();
  console.log(`\nHTTP ${res.status}`);
  console.log('RAW RESPONSE:');
  console.log(text);
} catch (err) {
  console.error('Request failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
