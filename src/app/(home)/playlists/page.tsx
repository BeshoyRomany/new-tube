import { DEFAULT_LIMIT } from '@/constants';
import { PlaylistView } from '@/modules/playlists/ui/views/playlist-view';
import { HydrateClient, trpc } from '@/trpc/server';

// This dynamic here because this page connected to trpc.utils invalidation
export const dynamic = 'force-dynamic';

const Page = async () => {
  void trpc.playlists.getMany.prefetchInfinite({ limit: DEFAULT_LIMIT });
  return (
    <HydrateClient>
      <PlaylistView />
    </HydrateClient>
  );
};

export default Page;
