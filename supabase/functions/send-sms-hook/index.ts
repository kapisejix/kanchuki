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

  const res = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: msg91AuthKey,
    },
    body: JSON.stringify({
      template_id: msg91TemplateId,
      mobile: user.phone.replace('+', ''), // MSG91 wants no leading +
      otp: sms.otp,
    }),
  });

  if (!res.ok) return new Response('send failed', { status: 500 });
  return new Response(JSON.stringify({}), { status: 200 });
});
