import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModerationActions } from './moderation-actions';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const USER_ID = '0190a000-0000-7000-8000-000000000002';
const base = {
  postId: POST_ID,
  creatorUserId: USER_ID,
  postStatus: 'PUBLISHED',
  creatorStatus: 'ACTIVE',
} as const;
const buttons = () => screen.getAllByRole('button').map((b) => b.textContent);

function stubFetch(res: Response) {
  const fetchMock = vi.fn(() => Promise.resolve(res));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ModerationActions', () => {
  beforeEach(() => refresh.mockClear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the actions valid for each status', () => {
    const { rerender } = render(<ModerationActions {...base} />);
    expect(buttons()).toEqual(['Abaikan', 'Sembunyikan', 'Hapus', 'Tangguhkan kreator']);
    rerender(<ModerationActions {...base} postStatus="PENDING_REVIEW" creatorStatus="SUSPENDED" />);
    expect(buttons()).toEqual(['Abaikan', 'Tampilkan lagi', 'Hapus', 'Pulihkan akun']);
    rerender(<ModerationActions {...base} postStatus="REMOVED" />);
    expect(buttons()).toEqual(['Abaikan', 'Tangguhkan kreator']);
  });

  it('posts the action with the note and refreshes', async () => {
    const fetchMock = stubFetch(Response.json({}));
    render(<ModerationActions {...base} />);
    fireEvent.change(screen.getByLabelText('Catatan (internal, opsional)'), {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/admin/moderation/posts/${POST_ID}/hide`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'spam' }),
    });
  });

  it('asks before removing or suspending, and sends nothing when cancelled', () => {
    const fetchMock = stubFetch(Response.json({}));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ModerationActions {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tangguhkan kreator' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('suspends the creator after confirmation', async () => {
    const fetchMock = stubFetch(Response.json({}));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ModerationActions {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tangguhkan kreator' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/admin/users/${USER_ID}/suspend`,
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('shows the API error message', async () => {
    stubFetch(
      Response.json(
        {
          error: {
            code: 'POST_STATUS_CONFLICT',
            message: 'Status post tidak memungkinkan tindakan ini.',
            requestId: 'req_1',
            details: null,
          },
        },
        { status: 409 },
      ),
    );
    render(<ModerationActions {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Status post tidak memungkinkan tindakan ini.',
    );
  });
});
