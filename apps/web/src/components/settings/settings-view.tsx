'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import type {
  MeResponse,
  NotificationPreferences,
  UpdateNotificationPreferencesInput,
} from '@influency/shared';
import { LegalSheet } from '@/components/legal-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useLogout } from '@/components/use-logout';
import {
  connectTelegram,
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from '@/lib/api/notification-preferences';
import { setAutoplayEnabled, useAutoplayEnabled } from '@/lib/autoplay-preference';
import { PRIVACY, TERMS } from '@/lib/legal-placeholder';
import { cn } from '@/lib/utils';
import { SettingsToggle } from './settings-toggle';

const CONFIRM_PILL =
  'self-start rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary-ink';
const ROW =
  'flex min-h-13 w-full items-center gap-3 py-2 text-left text-[15px] font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

type ToggleKey = Exclude<keyof NotificationPreferences, 'telegram'>;

/** Pengaturan (US-068): account, notification toggles, device preferences, help/legal, Keluar, Hapus akun. */
export function SettingsView({ user, version }: { user: MeResponse; version: string }) {
  const isCreator = user.creatorSlug !== null;
  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <Group title="Akun">
        <LinkRow
          href={isCreator ? '/studio/profile' : '/me'}
          label="Edit Profil"
          hint="Nama, bio, foto profil dan sampul"
        />
        <div className="flex min-h-13 items-center gap-3 py-2">
          <span className="flex-1 text-[15px] font-semibold">Telegram</span>
          <span className="text-sm text-muted-foreground">
            {user.username ? `@${user.username} · Terhubung` : 'Terhubung'}
          </span>
        </div>
        {isCreator && <LinkRow href="/studio/payout-accounts" label="Rekening Pencairan" />}
      </Group>

      <NotificationGroup isCreator={isCreator} />

      <Group title="Preferensi">
        <AutoplayToggle />
      </Group>

      <Group title="Privasi dan keamanan">
        <PlaceholderRow label="Akun diblokir" />
        <PlaceholderRow label="Laporkan masalah" />
      </Group>

      <Group title="Bantuan dan legal">
        <PlaceholderRow label="Pusat bantuan" />
        <LegalSheet doc={TERMS} trigger={<RowButton label="Syarat Layanan" />} />
        <LegalSheet doc={PRIVACY} trigger={<RowButton label="Kebijakan Privasi" />} />
      </Group>

      <LogoutRow />
      <DeleteAccount isCreator={isCreator} />

      <p className="text-center text-xs text-muted-foreground">Influency · versi {version}</p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="mb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="flex flex-col divide-y rounded-2xl border bg-card px-4">{children}</div>
    </section>
  );
}

function LinkRow({ href, label, hint }: { href: string; label: string; hint?: string }) {
  return (
    <Link href={href} className={ROW}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
    </Link>
  );
}

// A BottomSheet trigger (Radix Slot) forwards props/ref to its child, so this must spread them onto the button.
function RowButton({ label, ...props }: { label: string } & ComponentProps<'button'>) {
  return (
    <button type="button" className={ROW} {...props}>
      <span className="flex-1">{label}</span>
      <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
    </button>
  );
}

function PlaceholderRow({ label }: { label: string }) {
  return (
    <BottomSheet
      title={label}
      eyebrow={<span className={CONFIRM_PILL}>Perlu konfirmasi</span>}
      trigger={<RowButton label={label} />}
    >
      <p className="pb-2 text-sm text-muted-foreground">
        Fitur ini belum tersedia. Alurnya masih perlu dikonfirmasi.
      </p>
    </BottomSheet>
  );
}

function NotificationGroup({ isCreator }: { isCreator: boolean }) {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let live = true;
    fetchNotificationPreferences().then(
      (p) => live && setPrefs(p),
      () => live && setFailed(true),
    );
    // Back from Telegram after pressing Start: show the new connection state.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      fetchNotificationPreferences().then(
        (p) => live && setPrefs(p),
        () => {},
      );
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  async function connect() {
    setLinking(true);
    try {
      setLinkUrl((await connectTelegram()).url);
    } catch {
      toast('Telegram belum bisa dihubungkan. Coba lagi nanti.');
    } finally {
      setLinking(false);
    }
  }

  async function save(
    patch: UpdateNotificationPreferencesInput,
    optimistic: NotificationPreferences,
  ) {
    const before = prefs;
    setPrefs(optimistic);
    setPending(true);
    try {
      setPrefs(await updateNotificationPreferences(patch));
    } catch {
      setPrefs(before);
      toast('Gagal menyimpan pengaturan.');
    } finally {
      setPending(false);
    }
  }

  const toggle = (key: ToggleKey, label: string, hint?: string) =>
    prefs && (
      <SettingsToggle
        label={label}
        hint={hint}
        checked={prefs[key] === true}
        disabled={pending}
        onChange={(next) => void save({ [key]: next }, { ...prefs, [key]: next })}
      />
    );

  return (
    <Group title="Notifikasi">
      {failed ? (
        <p role="alert" className="py-3 text-sm text-muted-foreground">
          Pengaturan notifikasi belum bisa dimuat.
        </p>
      ) : !prefs ? (
        <p role="status" className="py-3 text-sm text-muted-foreground">
          Memuat…
        </p>
      ) : (
        <>
          {toggle('newPost', 'Postingan baru', 'Dari creator yang kamu ikuti')}
          {toggle('commentReply', 'Balasan komentar')}
          {toggle('commentLike', 'Suka pada komentarmu')}
          {toggle(
            'subscriptionReminder',
            'Pengingat langganan',
            'Sebelum periode langganan berakhir',
          )}
          {isCreator &&
            prefs.earnings !== null &&
            toggle('earnings', 'Aktivitas penghasilan', 'Subscriber baru, unlock dan tip')}
          {prefs.telegram.status === 'connected' ? (
            <SettingsToggle
              label="Pesan Telegram"
              hint="Ringkasan notifikasi dari bot resmi Influency"
              checked={prefs.telegram.allowed}
              disabled={pending}
              onChange={(next) =>
                void save(
                  { telegramAllowed: next },
                  { ...prefs, telegram: { ...prefs.telegram, allowed: next } },
                )
              }
            />
          ) : (
            <div className="flex min-h-13 items-center gap-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold">Pesan Telegram</span>
                <span className="text-xs text-muted-foreground">
                  {prefs.telegram.status === 'unavailable'
                    ? 'Segera hadir'
                    : 'Hubungkan bot resmi Influency'}
                </span>
              </span>
              {linkUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                    Buka Telegram
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={prefs.telegram.status === 'unavailable' || linking}
                  onClick={() => void connect()}
                >
                  Hubungkan
                </Button>
              )}
            </div>
          )}
          {linkUrl && prefs.telegram.status !== 'connected' && (
            <p role="status" className="pb-3 text-xs text-muted-foreground">
              Tekan Start di Telegram, lalu kembali ke sini. Tautan berlaku 15 menit.
            </p>
          )}
        </>
      )}
    </Group>
  );
}

function AutoplayToggle() {
  const on = useAutoplayEnabled();
  return (
    <SettingsToggle
      label="Putar video otomatis"
      hint="Tanpa suara, hanya saat terlihat"
      checked={on}
      onChange={setAutoplayEnabled}
    />
  );
}

function LogoutRow() {
  const { logout, pending, failed } = useLogout();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void logout()}
        disabled={pending}
        className={cn(ROW, 'rounded-2xl border bg-card px-4 text-destructive')}
      >
        Keluar
      </button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Gagal keluar. Coba lagi.
        </p>
      )}
    </div>
  );
}

function DeleteAccount({ isCreator }: { isCreator: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      title="Hapus akun?"
      eyebrow={<span className={CONFIRM_PILL}>Perlu konfirmasi</span>}
      description={
        isCreator
          ? 'Profil, postingan dan paket langganan akan dihapus. Penghasilan tertunda dan pembelian yang ada perlu diselesaikan dulu.'
          : 'Profil, daftar ikuti dan simpanan akan dihapus. Nasib Koin yang belum terpakai dan pembelian perlu dikonfirmasi.'
      }
      trigger={
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="border-destructive/40 text-destructive"
        >
          Hapus akun
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        Aturan penghapusan akun belum diputuskan, jadi akun belum bisa dihapus.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={() => setOpen(false)}
      >
        Batal
      </Button>
    </BottomSheet>
  );
}
