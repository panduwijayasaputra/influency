import { type LoginErrorCode, LOGIN_ERROR_CODES } from '@influency/shared';

const MESSAGES: Record<LoginErrorCode, string> = {
  login_cancelled: 'Login dibatalkan. Silakan coba lagi bila ingin masuk.',
  login_failed: 'Login gagal. Silakan coba lagi.',
};

/** Friendly message for a `/login?error=` code from the API; unknown values render nothing. */
export function LoginErrorMessage({ error }: { error: string | string[] | undefined }) {
  const code = LOGIN_ERROR_CODES.find((c) => c === error);
  if (!code) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {MESSAGES[code]}
    </p>
  );
}
