import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginHref } from '@/lib/login-href';
import { ReportPostButton } from './report-post-button';

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const PATH = `/ana/posts/${POST_ID}`;
const VIEWER = { liked: false, canLike: true, canReport: true };

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function openForm() {
  render(<ReportPostButton postId={POST_ID} path={PATH} viewer={VIEWER} />);
  fireEvent.click(screen.getByRole('button', { name: 'Laporkan' }));
}

describe('ReportPostButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logged out: links to login returning to the post', () => {
    render(<ReportPostButton postId={POST_ID} path={PATH} viewer={null} />);
    expect(screen.getByRole('link', { name: 'Laporkan' })).toHaveAttribute('href', loginHref(PATH));
  });

  it('renders nothing when the viewer cannot report', () => {
    const { container } = render(
      <ReportPostButton postId={POST_ID} path={PATH} viewer={{ ...VIEWER, canReport: false }} />,
    );
    expect(container).toBeEmptyDOMElement();
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

  it('sends the report and thanks the user', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({ reported: true })));
    openForm();
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Terima kasih, laporan Anda akan ditinjau.',
    );
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/posts/${POST_ID}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'SPAM' }),
    });
  });

  it('shows the API error message', async () => {
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
    openForm();
    fireEvent.click(screen.getByRole('radio', { name: 'Kekerasan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Terlalu banyak permintaan. Coba lagi sebentar.',
    );
    expect(screen.getByRole('button', { name: 'Kirim laporan' })).toBeEnabled();
  });

  it('closes the form on Batal', () => {
    openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(screen.getByRole('button', { name: 'Laporkan' })).toBeInTheDocument();
  });
});
