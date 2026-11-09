import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { loginHref } from '@/lib/login-href';
import { ReportPostButton } from './report-post-button';

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const PATH = `/ana/posts/${POST_ID}`;
const VIEWER = {
  liked: false,
  saved: false,
  canLike: true,
  canReport: true,
  canTip: false,
  subscribed: false,
};

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function openForm() {
  render(<ReportPostButton postId={POST_ID} path={PATH} viewer={VIEWER} />, { wrapper: Toaster });
  fireEvent.click(screen.getByRole('button', { name: 'Laporkan' }));
  return screen.getByRole('dialog', { name: 'Laporkan postingan ini' });
}

describe('ReportPostButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logged out: links to login returning to the post', () => {
    render(<ReportPostButton postId={POST_ID} path={PATH} viewer={null} />, { wrapper: Toaster });
    expect(screen.getByRole('link', { name: 'Laporkan' })).toHaveAttribute('href', loginHref(PATH));
  });

  it('renders nothing when the viewer cannot report', () => {
    render(
      <ReportPostButton
        postId={POST_ID}
        path={PATH}
        viewer={{ ...VIEWER, canReport: false, canTip: false, subscribed: false }}
      />,
      { wrapper: Toaster },
    );
    expect(screen.queryByRole('button', { name: 'Laporkan' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Laporkan' })).toBeNull();
  });

  it('needs a reason, and a note for Lainnya', () => {
    openForm();
    const submit = screen.getByRole('button', { name: 'Kirim laporan' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Lainnya' }));
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Keterangan'), { target: { value: 'alasan' } });
    expect(submit).toBeEnabled();
  });

  it('sends the report, closes the sheet and thanks the user with a toast', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({ reported: true })));
    openForm();
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Terima kasih, laporan Anda akan ditinjau.',
    );
    expect(screen.queryByRole('button', { name: 'Laporkan' })).toBeNull();
    await waitFor(() => expect(screen.getByText('Laporan terkirim.')).toHaveFocus());
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/posts/${POST_ID}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'SPAM' }),
    });
  });

  it('shows the API error message inside the sheet', async () => {
    stubFetch(() =>
      Promise.resolve(
        Response.json(
          {
            error: {
              code: 'RATE_LIMITED',
              message: 'Terlalu banyak permintaan. Coba lagi sebentar.',
              requestId: 'req_1',
              details: null,
            },
          },
          { status: 429 },
        ),
      ),
    );
    const sheet = openForm();
    fireEvent.click(screen.getByRole('radio', { name: 'Kekerasan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }));
    const alert = await screen.findByRole('alert');
    expect(sheet).toContainElement(alert);
    expect(alert).toHaveTextContent('Terlalu banyak permintaan. Coba lagi sebentar.');
    expect(screen.getByRole('button', { name: 'Kirim laporan' })).toBeEnabled();
  });

  it('closes the sheet on Batal and returns focus to Laporkan', async () => {
    openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Laporkan' })).toHaveFocus());
  });
});
