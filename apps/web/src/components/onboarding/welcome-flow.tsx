'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PathChoice, type OnboardingPath } from './path-choice';
import { StepperFooter } from './stepper-footer';
import { UserPath } from './user-path';

export type WelcomeUser = { displayName: string; username: string | null; bio: string | null };

/** `/welcome`: path choice, then the user steps. The creator path lives on /become-creator. */
export function WelcomeFlow({ user, returnTo }: { user: WelcomeUser; returnTo: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState<OnboardingPath | null>(null);
  const [path, setPath] = useState<'user' | null>(null);
  const firstName = user.displayName.trim().split(/\s+/)[0] || 'kamu';

  if (path === 'user') {
    return <UserPath user={user} returnTo={returnTo} onExit={() => setPath(null)} />;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-4">
        <PathChoice firstName={firstName} value={choice} onChange={setChoice} />
      </div>
      <StepperFooter
        label="Lanjut"
        disabled={choice === null}
        onClick={() => {
          if (choice === 'user') setPath('user');
          else if (choice === 'creator') router.push('/become-creator?from=welcome');
        }}
      />
    </div>
  );
}
