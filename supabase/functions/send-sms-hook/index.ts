import { serve } from 'https://deno.land/std/http/server.ts';
import { Webhook } from 'https://esm.sh/standardwebhooks';

const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET')!;
const msg91AuthKey = Deno.env.get('MSG91_AUTHKEY')!;
const msg91TemplateId = Deno.env.get('MSG91_TEMPLATE_ID')!;

serve(async (req) => {
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(hookSecret);

  let data: { user: { phone: string }; sms: { otp: string } };
  try {
    data = wh.verify(payload, headers) as typeof data;
  } catch {
    return new Response('invalid signature', { status: 401 });
  }

  const { user, sms } = data;

  // v5 SendOTP contract (docs.msg91.com/otp/sendotp): POST with params in the
  // QUERY STRING — authkey is not a header, params are not a JSON body, and
  // failures come back as HTTP 200 + {"type":"error",...}, so never trust the
  // status alone. Matches apps/api/src/lib/msg91-otp.ts.
  const params = new URLSearchParams({
    authkey: msg91AuthKey,
    template_id: msg91TemplateId,
    mobile: user.phone.replace('+', ''), // MSG91 wants no leading +
    otp: sms.otp,
  });
  const res = await fetch(
    `https://control.msg91.com/api/v5/otp?${params.toString()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  );

  if (res.ok) {
    try {
      const body = (await res.json()) as { type?: string };
      if (body.type === 'success') return new Response(JSON.stringify({}), { status: 200 });
    } catch {
      // fall through to the 500 below
    }
  }
  return new Response('send failed', { status: 500 });

  if (!res.ok) return new Response('send failed', { status: 500 });
  return new Response(JSON.stringify({}), { status: 200 });
});
