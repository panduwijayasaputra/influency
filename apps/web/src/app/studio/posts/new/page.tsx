import type { Metadata } from 'next';
import { PostForm } from '../post-form';

export const metadata: Metadata = { title: 'Buat Post' };

export default function NewPostPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Buat Post</h1>
      <PostForm />
    </main>
  );
}
