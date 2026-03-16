import { inferRouterOutputs } from '@trpc/server';
import { AppRouter } from '@/trpc/routers/_app';

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type VideoGetOneOutput = RouterOutputs['videos']['getOne'];
