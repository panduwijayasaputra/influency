import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { CreatorProfileForm } from './creator-profile-form';
import { ProfileImageInput } from './profile-image-input';

/** The approved creator's profile: page address (read-only), banner, avatar and text fields. */
export async function ProfileEditor() {
  // StudioGate already handled logged-out / unapproved; null here means the session just ended.
  const profile = await getMyCreatorProfile();
  if (!profile) return <p className="text-muted-foreground">Profil kreator tidak ditemukan.</p>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Alamat halaman</p>
        <p className="text-base">influency.com/{profile.slug}</p>
        <p className="text-sm text-muted-foreground">Alamat halaman belum dapat diubah.</p>
      </div>
      <ProfileImageInput kind="banner" label="Banner" url={profile.bannerUrl} />
      <ProfileImageInput kind="avatar" label="Foto profil" url={profile.avatarUrl} />
      <CreatorProfileForm profile={profile} />
    </div>
  );
}
