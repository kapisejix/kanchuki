// Google Play AI-content policy: the report control opens inline, needs a real description,
// posts text only to the passport proxy, and a failed send never claims success.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportAiContent } from '../ReportAiContent';

function stubFetch(status = 201) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response('{}', { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('ReportAiContent', () => {
  it('sends feature, ref and description (text only) to the passport proxy', async () => {
    const f = stubFetch();
    render(<ReportAiContent feature="AI Stylist" contentRef="demo-store" />);
    fireEvent.click(screen.getByRole('button', { name: /report this ai content/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'It showed something offensive' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/passport/ai-report');
    expect(JSON.parse(String(init.body))).toEqual({
      feature: 'AI Stylist',
      content_ref: 'demo-store',
      description: 'It showed something offensive',
    });
  });

  it('keeps Send disabled until the description is 10 characters', () => {
    stubFetch();
    render(<ReportAiContent feature="Virtual try-on" />);
    fireEvent.click(screen.getByRole('button', { name: /report this ai content/i }));
    const send = screen.getByRole('button', { name: /send report/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'too short' } });
    expect(send.disabled).toBe(true);
  });

  it('shows an error and stays open when the server refuses', async () => {
    stubFetch(429);
    render(<ReportAiContent feature="My Style selfie analysis" />);
    fireEvent.click(screen.getByRole('button', { name: /report this ai content/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'This is clearly wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
