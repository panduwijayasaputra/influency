import { getPendingCreatorApplications } from '@/lib/api/admin-creator-applications';
import { CreatorApplicationActions } from './creator-application-actions';

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});

/** Pending creator applications, oldest first, each with approve / reject actions. */
export async function PendingApplications() {
  const applications = await getPendingCreatorApplications();
  if (applications.length === 0) {
    return <p className="text-muted-foreground">Tidak ada pengajuan yang menunggu.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {applications.map((a) => (
        <li key={a.id} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{a.displayName}</h2>
            <p className="text-sm">influency.com/{a.slug}</p>
            <p className="text-sm text-muted-foreground">
              Pemohon: {a.applicantName}
              {a.category && ` · ${a.category}`}
            </p>
            <p className="text-sm text-muted-foreground">
              Diajukan {dateFormat.format(new Date(a.submittedAt))}
            </p>
          </div>
          {a.bio && <p className="text-sm whitespace-pre-line">{a.bio}</p>}
          <CreatorApplicationActions id={a.id} />
        </li>
      ))}
    </ul>
  );
}
