import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorProfileResponse } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { refreshOwnPublicProfile } from './actions';
import { EditProfileForm, parsePlanPrice } from './edit-profile-form';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('./actions', () => ({ refreshOwnPublicProfile: vi.fn(() => Promise.resolve()) }));

const PROFILE: CreatorProfileResponse = {
  slug: 'nadia',
  displayName: 'Nadia Kirana',
  bio: 'Halo!',
  category: 'Lifestyle',
  avatarUrl: null,
  bannerUrl: null,
};
const PLAN = { priceCoins: 150, active: true };
const apiError = (status: number, code: string, message: string, details: unknown = null) =>
  Response.json({ error: { code, message, requestId: 'req_1', details } }, { status });

type Handler = (url: string, init?: RequestInit) => Response | undefined;
function stubFetch(...handlers: Handler[]) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        url,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      for (const handler of handlers) {
        const res = handler(url, init);
        if (res) return Promise.resolve(res);
      }
      return Promise.resolve(new Response('unexpected call', { status: 500 }));
    }),
  );
  return calls;
}
const patchOk =
  (over: Partial<CreatorProfileResponse> = {}): Handler =>
  (url, init) =>
    init?.method === 'PATCH' && url === '/api/v1/creators/me'
      ? Response.json({ ...PROFILE, ...over })
      : undefined;
const planOk: Handler = (url, init) =>
  init?.method === 'PUT' && url === '/api/v1/creators/me/subscription-plan'
    ? Response.json({ plan: null })
    : undefined;

const renderForm = (plan: typeof PLAN | null = PLAN) =>
  render(<EditProfileForm profile={PROFILE} plan={plan} />, { wrapper: Toaster });
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

describe('parsePlanPrice', () => {
  it.each([
    ['10', 10],
    ['5000', 5000],
    [' 150 ', 150],
  ])('accepts %j', (input, expected) => expect(parsePlanPrice(input)).toBe(expected));
  it.each(['9', '5001', '12.5', 'abc', '', '-10'])('rejects %j', (input) =>
    expect(parsePlanPrice(input)).toBeNull(),
  );
});

describe('EditProfileForm', () => {
  const writeText = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows the current values and a read-only address', () => {
    stubFetch();
    renderForm();
    expect(screen.getByLabelText('Nama tampilan')).toHaveValue('Nadia Kirana');
    expect(screen.getByLabelText(/Bio/)).toHaveValue('Halo!');
    expect(screen.getByLabelText(/Harga langganan/)).toHaveValue('150');
    expect(screen.getByText('influency.com/nadia')).toBeVisible();
    expect(screen.queryByLabelText(/Alamat profil/)).toBeNull();
    expect(screen.getByText('Alamat profil tidak bisa diubah.')).toBeVisible();
    expect(screen.getByText('5/500')).toBeVisible();
  });

  it('copies the address and confirms', async () => {
    stubFetch();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Salin tautan profil' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://influency.com/nadia'));
    expect(await screen.findByText('Tautan disalin')).toBeVisible();
  });

  it('shows the Rupiah helper for a valid price', () => {
    stubFetch();
    renderForm();
    expect(
      screen.getByText(
        '≈ Rp150.000 per 30 hari · kamu terima ≈ Rp127.500 setelah biaya platform 15%',
      ),
    ).toBeVisible();
  });

  it('disables Simpan until something changes', () => {
    stubFetch();
    renderForm();
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled();
    type('Nama tampilan', 'Nadia K');
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeEnabled();
  });

  it.each(['9', '5001', '12.5', 'abc', ''])('blocks saving the price %j', (value) => {
    const calls = stubFetch();
    renderForm();
    type(/Harga langganan/, value);
    save();
    expect(screen.getAllByText('Masukkan angka bulat 10–5.000 Koin.').length).toBeGreaterThan(0);
    expect(calls).toEqual([]);
  });

  it('sends only the changed profile field and not the plan', async () => {
    const calls = stubFetch(patchOk({ displayName: 'Nadia K' }));
    renderForm();
    type('Nama tampilan', 'Nadia K');
    save();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/nadia'));
    expect(calls).toEqual([
      { method: 'PATCH', url: '/api/v1/creators/me', body: { displayName: 'Nadia K' } },
    ]);
    expect(refreshOwnPublicProfile).toHaveBeenCalled();
    expect(await screen.findByText('Profil diperbarui')).toBeVisible();
  });

  it('sends only the plan when only the price changed, keeping the active flag', async () => {
    const calls = stubFetch(planOk);
    render(<EditProfileForm profile={PROFILE} plan={{ priceCoins: 150, active: false }} />, {
      wrapper: Toaster,
    });
    type(/Harga langganan/, '200');
    save();
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(calls).toEqual([
      {
        method: 'PUT',
        url: '/api/v1/creators/me/subscription-plan',
        body: { priceCoins: 200, active: false },
      },
    ]);
  });

  it('creates an active plan when there was none and a price is entered', async () => {
    const calls = stubFetch(planOk);
    renderForm(null);
    type(/Harga langganan/, '50');
    save();
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(calls[0]?.body).toEqual({ priceCoins: 50, active: true });
  });

  it('lets the price stay empty while there is no plan', () => {
    stubFetch();
    renderForm(null);
    type('Nama tampilan', 'Baru');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the price dirty when the plan fails after the profile saved, then retries only the plan', async () => {
    const calls = stubFetch(patchOk({ displayName: 'Nadia K' }), (_url, init) =>
      init?.method === 'PUT'
        ? apiError(409, 'PLAN_NOT_AVAILABLE', 'Paket tidak tersedia.')
        : undefined,
    );
    renderForm();
    type('Nama tampilan', 'Nadia K');
    type(/Harga langganan/, '200');
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent('Paket tidak tersedia.');
    expect(router.push).not.toHaveBeenCalled();
    // The retry only sends the plan: the name already saved.
    const retryCalls = stubFetch(planOk);
    save();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/nadia'));
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(retryCalls.map((c) => c.method)).toEqual(['PUT']);
  });

  it('maps API validation issues to their fields', async () => {
    stubFetch((_url, init) =>
      init?.method === 'PATCH'
        ? apiError(400, 'VALIDATION_FAILED', 'Data tidak valid.', {
            issues: [{ path: 'displayName', message: 'Nama tampilan wajib diisi.' }],
          })
        : undefined,
    );
    renderForm();
    type('Nama tampilan', ' ');
    save();
    expect(await screen.findByText('Nama tampilan wajib diisi.')).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('goes back at once when nothing changed, and asks first when something did', () => {
    stubFetch();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    type('Nama tampilan', 'Lain');
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Buang perubahan?')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Buang' }));
    expect(router.back).toHaveBeenCalledTimes(2);
  });

  it('warns before the tab closes only while there are unsaved changes', () => {
    stubFetch();
    renderForm();
    const event = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(event()).toBe(false);
    type('Nama tampilan', 'Lain');
    expect(event()).toBe(true);
  });
});
