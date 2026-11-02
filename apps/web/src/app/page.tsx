import { APP_NAME } from '@influency/shared';

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{APP_NAME}</h1>
      <p className="text-base text-muted-foreground">Konten eksklusif dari creator favoritmu.</p>
    </main>
  );
}
