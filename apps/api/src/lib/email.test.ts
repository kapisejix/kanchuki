import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml, sendTeamMemberWelcomeEmail } from './email.js';

describe('email HTML escaping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('escapeHtml neutralises markup and quotes', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;',
    );
  });

  it('a hostile team-member name never reaches the HTML body raw', async () => {
    vi.stubEnv('RESEND_API_KEY', 'k');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: '1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendTeamMemberWelcomeEmail({
      name: '<script>alert(1)</script>',
      email: 'a@b.co',
      role: 'SUPPORT_AGENT',
      phone: '"><a href=//evil>',
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(body.html).not.toContain('<script>alert(1)</script>');
    expect(body.html).not.toContain('"><a href=//evil>');
    expect(body.html).toContain('&lt;script&gt;');
  });
});
