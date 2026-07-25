import { getSecret } from '@kanchuki/db';
import Anthropic from '@anthropic-ai/sdk';

const key = await getSecret('ANTHROPIC_API_KEY');
console.log('key resolved, length:', key?.length, 'prefix:', key?.slice(0, 12));

const claude = new Anthropic({ apiKey: key });
try {
  const res = await claude.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 5,
    messages: [{ role: 'user', content: 'say hi' }],
  });
  console.log('ANTHROPIC CALL SUCCESS:', res.content[0]);
} catch (e) {
  console.log('ANTHROPIC CALL ERROR:', e?.status, e?.name, e?.message);
}
process.exit(0);
