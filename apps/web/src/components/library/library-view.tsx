'use client';

import { useState } from 'react';
import type { LibraryPage } from '@influency/shared';
import { GridTile } from '@/components/post-grid/grid-tile';
import { PostCard } from '@/components/post-card/post-card';
import { LabeledSelect } from '@/components/user-area/labeled-select';
import { ListEmpty, ListError, ListSkeleton } from '@/components/user-area/list-states';
import { SegmentedControl } from '@/components/user-area/segmented-control';
import { type ListView, ViewToggle } from '@/components/user-area/view-toggle';
import { fetchLibraryPage } from '@/lib/api/library';
import { usePagedList } from '@/lib/use-paged-list';

type Relation = 'all' | 'saved' | 'purchased';
type Media = 'all' | 'image' | 'video';
type Sort = 'recent' | 'oldest';

const RELATIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'saved', label: 'Disimpan' },
  { value: 'purchased', label: 'Dibeli' },
] as const;
const MEDIA = [
  { value: 'all', label: 'Semua' },
  { value: 'image', label: 'Gambar' },
  { value: 'video', label: 'Video' },
] as const;
const SORTS = [
  { value: 'recent', label: 'Terbaru ditambahkan' },
  { value: 'oldest', label: 'Terlama' },
] as const;

/** Koleksi Saya: posts the user saved or bought, filtered on the server (see `fetchLibraryPage`). */
export function LibraryView() {
  const [relation, setRelation] = useState<Relation>('all');
  const [media, setMedia] = useState<Media>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [creator, setCreator] = useState('all');
  const [view, setView] = useState<ListView>('grid');
  // Kept across filter changes, or a selected creator would vanish from its own dropdown.
  const [creators, setCreators] = useState<LibraryPage['creators']>([]);

  const { items, status, loadingMore, retry, sentinelRef } = usePagedList(async (cursor) => {
    const page = await fetchLibraryPage({
      relation,
      media,
      sort,
      creator: creator === 'all' ? undefined : creator,
      cursor: cursor ?? undefined,
    });
    if (cursor === null) setCreators((prev) => (page.creators.length > 0 ? page.creators : prev));
    return page;
  }, [relation, media, sort, creator].join('|'));

  const filtered = relation !== 'all' || media !== 'all' || creator !== 'all';

  return (
    <main className="mx-auto w-full max-w-feed flex-1 pb-6">
      <div className="flex flex-col gap-3 border-b bg-card px-4 py-3">
        <LabeledSelect
          label="Filter creator"
          hideLabel
          value={creator}
          onChange={setCreator}
          options={[
            { value: 'all', label: 'Semua creator' },
            ...creators.map((c) => ({ value: c.slug, label: c.displayName })),
          ]}
        />
        <SegmentedControl
          label="Disimpan atau dibeli"
          value={relation}
          options={RELATIONS}
          onChange={setRelation}
        />
        <SegmentedControl label="Jenis media" value={media} options={MEDIA} onChange={setMedia} />
        <div className="flex items-center justify-between gap-2">
          <LabeledSelect
            label="Urutkan"
            value={sort}
            options={SORTS}
            onChange={(v) => setSort(v as Sort)}
          />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {status === 'loading' && (
        <ListSkeleton variant={view === 'grid' ? 'grid' : 'cards'} label="Memuat koleksi" />
      )}
      {status === 'error' && items.length === 0 && <ListError onRetry={retry} />}
      {status === 'done' && items.length === 0 && (
        <ListEmpty
          title={filtered ? 'Tidak ada hasil' : 'Belum ada apa-apa'}
          body={
            filtered
              ? 'Coba ubah filter.'
              : 'Simpan post dengan ikon penanda, atau buka post premium, dan semuanya muncul di sini.'
          }
        />
      )}

      {items.length > 0 && view === 'grid' && (
        <div className="grid grid-cols-3 gap-0.5 bg-card">
          {items.map((item) => (
            <GridTile
              key={item.id}
              post={item}
              href={`/${item.creator.slug}/posts/${item.id}`}
              creator={item.creator}
              tag={item.purchased ? 'Dibeli' : 'Disimpan'}
              aspect="portrait"
            />
          ))}
        </div>
      )}
      {items.length > 0 && view === 'list' && (
        <div className="flex flex-col gap-2 pt-2">
          {items.map((item) => (
            <PostCard key={item.id} post={item} creator={item.creator} linkCreator />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="px-4 py-3 text-center text-sm text-muted-foreground">
        {loadingMore && <p role="status">Memuat…</p>}
        {status === 'error' && items.length > 0 && <ListError onRetry={retry} />}
      </div>
      <p className="px-4 pb-2 text-xs leading-relaxed text-muted-foreground">
        Menyimpan post premium tidak membukanya. Post yang disimpan dan dibeli hanya tampil sekali.
      </p>
    </main>
  );
}
