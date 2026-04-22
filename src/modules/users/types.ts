import { inferRouterOutputs } from '@trpc/server';
import { AppRouter } from '@/trpc/routers/_app';

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type UserGetOneOutput = RouterOutputs['users']['getOne'];

export type VideoUpdatePayload = {
  type:
    | 'THUMBNAIL'
    | 'TITLE'
    | 'DESCRIPTION'
    | 'ASSET_READY'
    | 'TRACK_READY'
    | 'ASSET_ERRORED';
};
