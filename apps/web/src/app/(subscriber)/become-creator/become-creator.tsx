import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreatorPath } from '@/components/onboarding/creator-path';
import { Button } from '@/components/ui/button';
import { getMyCreatorApplication } from '@/lib/api/creator-application';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

function Centered({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

/**
 * The creator stepper, or the state of the caller's existing application. The API enforces the rules.
 * `from=welcome` makes Back on the first step return to /welcome instead of /me.
 */
export async function BecomeCreator({ from }: { from?: string }) {
  const fromWelcome = from === 'welcome';
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(fromWelcome ? '/become-creator?from=welcome' : '/become-creator'));
  const application = await getMyCreatorApplication();

  if (application?.status === 'PENDING_REVIEW') {
    return (
      <Centered title="Pengajuanmu sedang ditinjau">
        <p className="text-sm text-muted-foreground">
          Alamat halaman: influency.com/{application.slug}
        </p>
        <Button asChild variant="outline">
          <Link href="/">Ke beranda</Link>
        </Button>
      </Centered>
    );
  }
  if (application?.status === 'APPROVED') {
    return (
      <Centered title="Kamu sudah menjadi creator">
        <Button asChild>
          <Link href="/studio">Buka Studio</Link>
        </Button>
      </Centered>
    );
  }
  return (
    <>
      {application?.status === 'REJECTED' && (
        <div className="mx-auto flex w-full max-w-md flex-col gap-1 px-4 pt-3 text-sm text-muted-foreground">
          <p>Pengajuan sebelumnya ditolak. Kamu dapat mengajukan kembali.</p>
          {application.rejectionReason && (
            <p className="whitespace-pre-line">Alasan: {application.rejectionReason}</p>
          )}
        </div>
      )}
      <CreatorPath initial={application ?? undefined} backHref={fromWelcome ? '/welcome' : '/me'} />
    </>
  );
}
