import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorProfileForm } from './creator-profile-form';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const apiError = (status: number, code: string, message: string, details: unknown = null) =>
  Response.json({ error: { code, message, requestId: 'req_1', details } }, { status });

const profile = {
  slug: 'ana',
  displayName: 'Ana',
  bio: null,
  category: null,
  avatarUrl: null,
  bannerUrl: null,
};
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

describe('CreatorProfileForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('requires a display name without calling the API', () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response()));
    render(<CreatorProfileForm profile={profile} />);
    fireEvent.change(screen.getByLabelText('Nama tampilan'), { target: { value: '  ' } });
    save();
    expect(screen.getByText('Nama tampilan wajib diisi.')).toBeVisible();
    expect(screen.getByLabelText('Nama tampilan')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves with PATCH and refreshes the page', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json(profile)));
    render(<CreatorProfileForm profile={profile} />);
    fireEvent.change(screen.getByLabelText('Bio (opsional)'), { target: { value: 'Halo' } });
    save();

    expect(await screen.findByRole('status')).toHaveTextContent('Profil disimpan.');
    expect(router.refresh).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/creators/me');
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(JSON.parse(init.body as string)).toEqual({
      displayName: 'Ana',
      bio: 'Halo',
      category: '',
    });
  });

  it('maps API validation issues to fields', async () => {
    stubFetch(() =>
      Promise.resolve(
        apiError(400, 'VALIDATION_FAILED', 'Data yang dikirim tidak valid.', {
          issues: [{ path: 'category', message: 'Kategori maksimal 50 karakter.' }],
        }),
      ),
    );
    render(<CreatorProfileForm profile={profile} />);
    save();
    expect(await screen.findByText('Kategori maksimal 50 karakter.')).toBeVisible();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('shows other API errors as an alert', async () => {
    stubFetch(() =>
      Promise.resolve(apiError(403, 'CREATOR_NOT_APPROVED', 'Profil kreator belum disetujui.')),
    );
    render(<CreatorProfileForm profile={profile} />);
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent('Profil kreator belum disetujui.');
  });

  it('disables the button while saving', async () => {
    let resolve!: (res: Response) => void;
    stubFetch(() => new Promise((r) => (resolve = r)));
    render(<CreatorProfileForm profile={profile} />);
    save();
    expect(screen.getByRole('button', { name: 'Menyimpan…' })).toBeDisabled();
    resolve(Response.json(profile));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan' })).toBeEnabled());
  });
});
