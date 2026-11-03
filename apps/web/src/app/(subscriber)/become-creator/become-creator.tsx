import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getMyCreatorApplication } from '@/lib/api/creator-application';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';
import { CreatorApplicationForm } from './creator-application-form';

/** Shows the form, or the state of the caller's existing application. The API enforces the rules. */
export async function BecomeCreator() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref('/become-creator'));
  const application = await getMyCreatorApplication();

  if (application?.status === 'PENDING_REVIEW') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-base">Pengajuan Anda sedang ditinjau.</p>
        <p className="text-sm text-muted-foreground">
          Alamat halaman: influency.com/{application.slug}
        </p>
      </div>
    );
  }
  if (application?.status === 'APPROVED') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base">Anda sudah menjadi kreator.</p>
        <Button asChild className="self-start">
          <Link href="/studio">Buka Studio</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {application?.status === 'REJECTED' && (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>Pengajuan sebelumnya ditolak. Anda dapat mengajukan kembali.</p>
          {application.rejectionReason && (
            <p className="whitespace-pre-line">Alasan: {application.rejectionReason}</p>
          )}
        </div>
      )}
      <CreatorApplicationForm initial={application ?? undefined} />
    </div>
  );
}
