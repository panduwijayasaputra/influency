import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorApplicationActions } from './creator-application-actions';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const apiError = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message, requestId: 'req_1', details: null } }, { status });

const reason = () => screen.getByLabelText('Alasan penolakan (terlihat oleh pemohon)');

describe('CreatorApplicationActions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('approves, disables the buttons while pending, then refreshes', async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = stubFetch(() => new Promise((r) => (resolve = r)));
    render(<CreatorApplicationActions id="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));

    expect(screen.getByRole('button', { name: 'Setujui' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/creators/p1/approve', {
      method: 'POST',
      credentials: 'include',
    });
    resolve(Response.json({ id: 'p1', status: 'APPROVED' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it('requires a reason before rejecting', () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response()));
    render(<CreatorApplicationActions id="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tolak' }));
    fireEvent.change(reason(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim penolakan' }));

    expect(screen.getByText('Alasan penolakan wajib diisi.')).toBeVisible();
    expect(reason()).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the trimmed reason', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(Response.json({ id: 'p1', status: 'REJECTED' })),
    );
    render(<CreatorApplicationActions id="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tolak' }));
    fireEvent.change(reason(), { target: { value: ' Foto tidak jelas ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim penolakan' }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/creators/p1/reject', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Foto tidak jelas' }),
    });
  });

  it('explains an already decided application and refreshes', async () => {
    stubFetch(() =>
      Promise.resolve(
        apiError(409, 'CREATOR_APPLICATION_NOT_PENDING', 'Pengajuan ini sudah diputuskan.'),
      ),
    );
    render(<CreatorApplicationActions id="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pengajuan ini sudah diputuskan.');
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Setujui' })).toBeEnabled();
  });
});
