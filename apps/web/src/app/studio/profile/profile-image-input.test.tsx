import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileImageInput } from './profile-image-input';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const fileOf = (name: string, type: string, size = 10) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};
const choose = (label: string, file: File) =>
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });

describe('ProfileImageInput', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects an unsupported type without calling the API', () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response()));
    render(<ProfileImageInput kind="avatar" label="Foto profil" url={null} />);
    choose('Foto profil', fileOf('a.gif', 'image/gif'));
    expect(screen.getByRole('alert')).toHaveTextContent('Format file tidak didukung.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an avatar over 2 MB without calling the API', () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response()));
    render(<ProfileImageInput kind="avatar" label="Foto profil" url={null} />);
    choose('Foto profil', fileOf('a.png', 'image/png', 2 * 1024 * 1024 + 1));
    expect(screen.getByRole('alert')).toHaveTextContent('Ukuran file maksimal 2 MB.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads the file with PUT and refreshes the page', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({})));
    render(<ProfileImageInput kind="banner" label="Banner" url={null} />);
    const file = fileOf('b.png', 'image/png', 3 * 1024 * 1024);
    choose('Banner', file);

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/creators/me/banner');
    expect(init).toMatchObject({
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'image/png' },
      body: file,
    });
  });

  it('shows the API error message', async () => {
    stubFetch(() =>
      Promise.resolve(
        Response.json(
          {
            error: {
              code: 'UNSUPPORTED_FILE_TYPE',
              message: 'Format file tidak didukung. Gunakan JPG, PNG, atau WebP.',
              requestId: 'req_1',
              details: null,
            },
          },
          { status: 415 },
        ),
      ),
    );
    render(<ProfileImageInput kind="avatar" label="Foto profil" url={null} />);
    choose('Foto profil', fileOf('a.png', 'image/png'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Format file tidak didukung.');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('disables the input while uploading', async () => {
    let resolve!: (res: Response) => void;
    stubFetch(() => new Promise((r) => (resolve = r)));
    render(<ProfileImageInput kind="avatar" label="Foto profil" url={null} />);
    choose('Foto profil', fileOf('a.png', 'image/png'));
    expect(screen.getByLabelText('Foto profil')).toBeDisabled();
    expect(screen.getByText('Mengunggah…')).toBeInTheDocument();
    resolve(Response.json({}));
    await waitFor(() => expect(screen.getByLabelText('Foto profil')).toBeEnabled());
  });

  it('shows the current image', () => {
    render(
      <ProfileImageInput kind="avatar" label="Foto profil" url="/api/v1/creators/ana/images/x" />,
    );
    expect(screen.getByRole('img', { name: 'Foto profil' })).toHaveAttribute(
      'src',
      '/api/v1/creators/ana/images/x',
    );
  });
});
