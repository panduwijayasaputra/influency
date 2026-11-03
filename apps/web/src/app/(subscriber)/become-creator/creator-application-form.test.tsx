import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorApplicationForm } from './creator-application-form';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const apiError = (status: number, code: string, message: string, details: unknown = null) =>
  Response.json({ error: { code, message, requestId: 'req_1', details } }, { status });

function fill({ slug = 'ana', agree = true } = {}) {
  fireEvent.change(screen.getByLabelText('Nama tampilan'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('Alamat halaman'), { target: { value: slug } });
  if (agree) fireEvent.click(screen.getByLabelText(/Saya menyetujui/));
}
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Ajukan' }));

describe('CreatorApplicationForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('previews the normalized page address', () => {
    render(<CreatorApplicationForm />);
    fireEvent.change(screen.getByLabelText('Alamat halaman'), { target: { value: ' MyName' } });
    expect(screen.getByText('influency.com/myname')).toBeInTheDocument();
  });

  it('rejects a reserved slug without calling the API', () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response()));
    render(<CreatorApplicationForm />);
    fill({ slug: 'Admin' });
    submit();
    expect(screen.getByText('Alamat ini dipakai oleh sistem. Pilih alamat lain.')).toBeVisible();
    expect(screen.getByLabelText('Alamat halaman')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires accepting the agreement', () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response()));
    render(<CreatorApplicationForm />);
    fill({ agree: false });
    submit();
    expect(
      screen.getByText('Anda harus menyetujui Perjanjian Kreator dan Kebijakan Konten.'),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits once, normalized, then refreshes the page', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(Response.json({ status: 'PENDING_REVIEW' }, { status: 201 })),
    );
    render(<CreatorApplicationForm />);
    fill({ slug: 'Ana' });
    submit();
    expect(screen.getByRole('button', { name: 'Mengirim…' })).toBeDisabled();

    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/creators/apply');
    expect(JSON.parse(init.body as string)).toEqual({
      displayName: 'Ana',
      slug: 'ana',
      bio: '',
      category: '',
      acceptAgreement: true,
    });
  });

  it('shows SLUG_TAKEN on the slug field', async () => {
    stubFetch(() =>
      Promise.resolve(apiError(409, 'SLUG_TAKEN', 'Alamat ini sudah dipakai. Pilih alamat lain.')),
    );
    render(<CreatorApplicationForm />);
    fill();
    submit();
    expect(await screen.findByText('Alamat ini sudah dipakai. Pilih alamat lain.')).toBeVisible();
    expect(screen.getByLabelText('Alamat halaman')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Ajukan' })).toBeEnabled();
  });

  it('maps VALIDATION_FAILED issues to their fields', async () => {
    stubFetch(() =>
      Promise.resolve(
        apiError(400, 'VALIDATION_FAILED', 'Data yang dikirim tidak valid.', {
          issues: [{ path: 'displayName', message: 'Nama tidak valid.' }],
        }),
      ),
    );
    render(<CreatorApplicationForm />);
    fill();
    submit();
    expect(await screen.findByText('Nama tidak valid.')).toBeVisible();
  });

  it('shows other API errors as a form message', async () => {
    stubFetch(() =>
      Promise.resolve(
        apiError(409, 'CREATOR_APPLICATION_EXISTS', 'Anda sudah memiliki pengajuan kreator.'),
      ),
    );
    render(<CreatorApplicationForm />);
    fill();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Anda sudah memiliki pengajuan kreator.',
    );
  });
});
