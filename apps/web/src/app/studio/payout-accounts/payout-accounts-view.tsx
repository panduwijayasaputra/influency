'use client';

import { Landmark } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  PAYOUT_ACCOUNT_MAX,
  PAYOUT_BANKS,
  type PayoutAccount,
  payoutAccountInputSchema,
} from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { LabeledSelect } from '@/components/user-area/labeled-select';
import { ListError } from '@/components/user-area/list-states';
import { ApiError } from '@/lib/api/errors';
import {
  activatePayoutAccount,
  createPayoutAccount,
  deletePayoutAccount,
  fetchPayoutAccounts,
} from '@/lib/api/payout-accounts';
import { useLoaded } from '@/lib/use-loaded';
import { cn } from '@/lib/utils';

type FormValues = {
  bankCode: string;
  accountNumber: string;
  holderName: string;
  makeActive: boolean;
};
type FormErrors = Partial<Record<'bankCode' | 'accountNumber' | 'holderName', string>>;

const BANK_OPTIONS = PAYOUT_BANKS.map((b) => ({ value: b.code, label: b.name }));

/**
 * Rekening Pencairan (creator-studio US-057): up to 3 accounts, exactly one active, the active one cannot be deleted.
 * The API (US-062) enforces every rule; the UI only hides actions it would refuse. The full number is write-only:
 * after saving, only the bank and the last 4 digits are shown.
 */
export function PayoutAccountsView({ defaultHolderName }: { defaultHolderName: string }) {
  const toast = useToast();
  const { result, reload, retry } = useLoaded(fetchPayoutAccounts);
  const blank: FormValues = {
    bankCode: PAYOUT_BANKS[0].code,
    accountNumber: '',
    holderName: defaultHolderName,
    makeActive: false,
  };
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(blank);
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (result.status === 'error') return <ListError onRetry={retry} />;
  if (result.status === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label="Memuat rekening"
        className="h-40 animate-pulse rounded-2xl bg-muted"
      />
    );
  }

  const accounts = result.data;
  const empty = accounts.length === 0;
  const full = accounts.length >= PAYOUT_ACCOUNT_MAX;
  const showForm = (formOpen || empty) && !full;

  async function run(action: () => Promise<void>, success: string) {
    setPending(true);
    try {
      await action();
      toast(success);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Terjadi kesalahan. Coba lagi.');
      reload();
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = payoutAccountInputSchema.safeParse({
      ...form,
      makeActive: empty ? true : form.makeActive,
    });
    if (!parsed.success) {
      const next: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof FormErrors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    await run(
      async () => {
        await createPayoutAccount(parsed.data);
        setForm(blank);
        setFormOpen(false);
      },
      parsed.data.makeActive && !empty
        ? 'Rekening ditambahkan dan dijadikan aktif'
        : 'Rekening ditambahkan',
    );
  }

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {accounts.length} / {PAYOUT_ACCOUNT_MAX} rekening
      </p>

      {empty && <p className="text-sm text-muted-foreground">Belum ada rekening pencairan.</p>}

      <ul className="flex flex-col gap-3">
        {accounts.map((account: PayoutAccount) => (
          <li
            key={account.id}
            className={cn(
              'rounded-2xl bg-card p-4',
              account.active ? 'border-[1.5px] border-brand' : 'border',
            )}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full',
                  account.active ? 'bg-accent text-primary-ink' : 'bg-muted text-foreground',
                )}
              >
                <Landmark className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  {account.bankName} •••• {account.last4}
                </p>
                <p className="truncate text-xs text-muted-foreground">a.n. {account.holderName}</p>
              </div>
              {account.active && (
                <span className="shrink-0 rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[11px] font-bold text-[#1E6B3A]">
                  Aktif
                </span>
              )}
            </div>

            {account.active ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {accounts.length === 1
                  ? 'Rekening satu-satunya · tambah rekening lain sebelum menghapus.'
                  : 'Rekening aktif · jadikan rekening lain aktif untuk menghapus ini.'}
              </p>
            ) : confirming === account.id ? (
              <div className="mt-3 flex flex-col gap-2" role="group" aria-label="Konfirmasi hapus">
                <p className="text-sm font-semibold">Hapus rekening ini?</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={pending}
                    onClick={() => setConfirming(null)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        await deletePayoutAccount(account.id);
                        setConfirming(null);
                      }, 'Rekening dihapus')
                    }
                  >
                    Hapus
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={pending}
                  aria-label={`Jadikan ${account.bankName} •••• ${account.last4} aktif`}
                  onClick={() =>
                    void run(
                      () => activatePayoutAccount(account.id).then(() => undefined),
                      `${account.bankName} sekarang rekening pencairan aktif`,
                    )
                  }
                >
                  Jadikan aktif
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  aria-label={`Hapus ${account.bankName} •••• ${account.last4}`}
                  onClick={() => setConfirming(account.id)}
                >
                  Hapus
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {full && (
        <p className="text-sm text-muted-foreground">Maksimal {PAYOUT_ACCOUNT_MAX} rekening.</p>
      )}
      {!showForm && !full && (
        <Button type="button" size="lg" onClick={() => setFormOpen(true)}>
          Tambah rekening
        </Button>
      )}

      {showForm && (
        <form
          onSubmit={(e) => void submit(e)}
          noValidate
          aria-label="Tambah rekening"
          className="flex flex-col gap-4 rounded-2xl border bg-card p-4"
        >
          <h2 className="text-base font-extrabold">Tambah rekening</h2>
          <LabeledSelect
            label="Bank"
            value={form.bankCode}
            options={BANK_OPTIONS}
            onChange={(v) => set('bankCode', v)}
          />
          <p className="-mt-2 text-xs text-muted-foreground">Daftar bank: Perlu konfirmasi.</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="accountNumber">Nomor rekening</Label>
            <Input
              id="accountNumber"
              inputMode="numeric"
              autoComplete="off"
              value={form.accountNumber}
              onChange={(e) => set('accountNumber', e.target.value)}
              aria-invalid={errors.accountNumber ? true : undefined}
              aria-describedby={errors.accountNumber ? 'accountNumber-error' : undefined}
            />
            {errors.accountNumber && (
              <p id="accountNumber-error" className="text-sm text-destructive">
                {errors.accountNumber}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="holderName">Nama pemilik rekening</Label>
            <Input
              id="holderName"
              value={form.holderName}
              onChange={(e) => set('holderName', e.target.value)}
              aria-invalid={errors.holderName ? true : undefined}
              aria-describedby={errors.holderName ? 'holderName-error' : undefined}
            />
            {errors.holderName && (
              <p id="holderName-error" className="text-sm text-destructive">
                {errors.holderName}
              </p>
            )}
          </div>
          {!empty && (
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.makeActive}
                onChange={(e) => set('makeActive', e.target.checked)}
                className="size-5 accent-primary"
              />
              Jadikan rekening aktif
            </label>
          )}
          <div className="flex gap-2">
            {!empty && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={pending}
                onClick={() => {
                  setFormOpen(false);
                  setErrors({});
                }}
              >
                Batal
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={pending}>
              Simpan
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
