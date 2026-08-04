# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NewTube — a YouTube-style video platform: Next.js 15 App Router, tRPC, Drizzle + Neon Postgres, Clerk auth, Mux video, UploadThing storage, Upstash (Redis/ratelimit/Workflow), Pusher realtime, shadcn/ui + Tailwind. Package manager is **bun**.

## Commands

```bash
bun run dev              # Next.js dev server on :3000
bun run dev:all          # ngrok tunnel + dev + drizzle studio + ssl proxy (:3001) — the normal dev entrypoint
bun run build            # production build (also the type-check gate; there is no separate tsc script)
bun run lint             # eslint (next/core-web-vitals + next/typescript)
bun run db:push          # push src/db/schema.ts to Neon (no migration files are generated in normal flow)
bun run db:studio        # drizzle-kit studio GUI
bun run db:seed-categories
```

There is **no test suite** in this repo — do not invent test commands. Verification is `bun run build` + `bun run lint`.

Webhooks (Mux, Clerk) need a public URL: `bun run dev:webhook` (ngrok → :3000) and register that URL in the provider dashboards. `dev:proxy` exists because `APP_URL` defaults to `https://localhost:3001` (see [src/constants.ts](src/constants.ts)) — server-side tRPC calls resolve against it. Env lives in `.env.local` (drizzle.config.ts loads it explicitly via dotenv).

## Architecture

### Module structure (the dominant convention)

Every feature lives in `src/modules/<feature>/` with a fixed internal shape. Follow it for new features rather than adding to `src/components` or `src/app`:

```
src/modules/<feature>/
  server/procedures.ts   # tRPC router for this feature
  types.ts               # types derived from router outputs (see below)
  ui/views/              # top-level composition, rendered by an app/ page
  ui/sections/           # 'use client' data-fetching units (Suspense + ErrorBoundary)
  ui/components/         # presentational pieces
  hooks/                 # feature-local hooks
```

`src/app/**/page.tsx` files stay thin: they resolve params, call `void trpc.<router>.<proc>.prefetch(...)` from [src/trpc/server.tsx](src/trpc/server.tsx), and render `<HydrateClient><SomeView /></HydrateClient>`. Most set `export const dynamic = 'force-dynamic'`.

Route groups: `(home)` public feed, `(studio)` creator dashboard, `(auth)` Clerk catch-all routes. Each group has its own layout with its own navbar/sidebar under the matching module.

### tRPC layer

- Routers are registered in [src/trpc/routers/_app.ts](src/trpc/routers/_app.ts); each entry imports from a module's `server/procedures.ts`.
- [src/trpc/init.ts](src/trpc/init.ts) defines `baseProcedure` (public) and `protectedProcedure`. `protectedProcedure` does three things in order: reject if no Clerk `userId` → Upstash sliding-window ratelimit (10 req / 10s per clerk id) → load the DB `users` row and put it on `ctx.user`. **Use `ctx.user.id` (the internal uuid) for DB work, never the clerk id.**
- Server components use the `trpc` caller from `@/trpc/server`; client components use the React hooks from `@/trpc/client`. Both use superjson.
- Feature types are derived, not hand-written: `inferRouterOutputs<AppRouter>['videos']['getOne']` — see [src/modules/videos/types.ts](src/modules/videos/types.ts).

### Section pattern

A "section" is the standard client data unit: an exported wrapper that renders `<Suspense fallback={<XSkeleton />}><ErrorBoundary fallback={...}><SuspenseX /></ErrorBoundary></Suspense>`, plus a `SuspenseX` that calls `useSuspenseQuery` / `useSuspenseInfiniteQuery`. Skeletons are written alongside and must mirror the real layout. See [src/modules/studio/ui/sections/videos-section.tsx](src/modules/studio/ui/sections/videos-section.tsx).

### Infinite scroll / cursor pagination

All `getMany` procedures use keyset pagination, not offset. The shape is consistent: input `{ cursor: { id, updatedAt } | null, limit }`, `.limit(limit + 1)`, then slice off the extra row to compute `hasMore` and `nextCursor`. Ordering is always the tuple `(updatedAt desc, id desc)` with a matching `or(lt(updatedAt, cursor.updatedAt), and(eq(...), lt(id, cursor.id)))` predicate — trending variants swap `updatedAt` for `viewCount`. Client side pairs `useSuspenseInfiniteQuery` with [src/components/infinite-scroll.tsx](src/components/infinite-scroll.tsx). Page size default is `DEFAULT_LIMIT` (8) from [src/constants.ts](src/constants.ts).

Aggregates (like/dislike/view/comment counts) are computed inline with `db.$count(...)` correlated subqueries, and multi-step reads use CTEs via `db.$with(...)`. Prefer extending these patterns over adding denormalized columns.

### Video pipeline (Mux → UploadThing → DB → Pusher)

1. `videos.create` creates a Mux direct upload and a `videos` row holding `muxUploadId`.
2. [src/app/api/videos/webhook/route.ts](src/app/api/videos/webhook/route.ts) verifies the `mux-signature` and handles `video.asset.{created,ready,errored,track.ready,deleted}`.
3. On `asset.ready` the handler deliberately does **SELECT (lock-free) → upload thumbnail/preview to UploadThing → single conditional UPDATE guarded by `isNull(videos.muxPlaybackId)`**. Do not collapse this into an UPDATE-then-upload: holding a `RowExclusiveLock` across the long upload causes idle-in-transaction timeouts. The `!updatedVideo` branch deletes the orphaned UploadThing files — keep it when editing.
4. Every successful DB mutation triggers Pusher on channel `video-${videoId}`, event `video-updated`, with a `{ type }` discriminator (`ASSET_READY`, `TRACK_READY`, `TITLE`, …).
5. The client subscribes via `usePusher` ([src/hooks/user-pusher.ts](src/hooks/user-pusher.ts)) and responds by invalidating the relevant tRPC query (`utils.studio.getOne.invalidate({ id })`) — realtime is invalidation-driven, the payload is not merged into state.

Clerk user sync is a separate svix-verified webhook at [src/app/api/users/webhook/route.ts](src/app/api/users/webhook/route.ts) handling `user.created/updated/deleted`; the `users` table mirrors Clerk and is the source of internal uuids.

### AI background jobs

Title, description, and thumbnail generation are Upstash Workflow endpoints under [src/app/api/videos/workflows/](src/app/api/videos/workflows/), each `serve<InputType>()` with `{ userId, videoId }`. They fetch the Mux transcript (`https://stream.mux.com/{playbackId}/text/{trackId}.txt`), call OpenAI through `context.api.openai.call`, write to the DB, then trigger Pusher — every side effect wrapped in its own `context.run('step-name', …)` so steps are individually retryable. Procedures kick these off with `workflow.trigger({ url: \`${APP_URL}/api/videos/workflows/...\` })`.

### Auth

[src/middleware.ts](src/middleware.ts) protects `/studio(.*)`, `/subscriptions`, `/playlists(.*)` via `clerkMiddleware`. Route-level protection is not a substitute for `protectedProcedure` — mutations must still authorize by comparing `ctx.user.id` against row ownership (`and(eq(videos.id, id), eq(videos.userId, ctx.user.id))`).

### Database

Single schema file [src/db/schema.ts](src/db/schema.ts). Notes that matter when extending it:

- Join tables (`subscriptions`, `videoViews`, `videoReactions`, `commentReactions`, `playlistVideos`) use composite `primaryKey`, no surrogate id.
- `comments.parentId` is a self-referencing FK declared via the `foreignKey({...})` callback (not `.references()`), because the table references itself.
- `subscriptions` has two FKs to `users`, disambiguated by explicit `relationName` on both sides — copy that pattern for any second relation to the same table.
- Each table exports drizzle-zod `createSelectSchema`/`createInsertSchema`/`createUpdateSchema`; procedures reuse those with `.pick()`/`.omit()` instead of redeclaring zod objects.
- `db` is the Neon HTTP driver ([src/db/index.ts](src/db/index.ts)) — **no transactions available**; concurrency is handled with conditional UPDATE predicates as in the Mux webhook.

### Files/media

Uploads go through UploadThing ([src/app/api/uploadthing/core.ts](src/app/api/uploadthing/core.ts)). Both `bannerUploader` and `thumbnailUploader` delete the previous file by its stored `*Key` in the middleware before accepting a new one. Any code that replaces or deletes media must clear both the `*Url` and `*Key` columns and call `utapi.deleteFiles` — orphaned keys are otherwise unrecoverable. `next.config.ts` only whitelists `utfs.io/f/**` for `next/image`.

## Style

Prettier: single quotes, semicolons, 2-space, es5 trailing commas. Import alias `@/*` → `src/*`. Feature components are named exports (`export const X = () => …`), pages are default exports.

## Repo notes

`README_TOOLS.md` documents the ngrok/drizzle workflow. `LEARNING-PATTERNS.md` is the owner's personal study notes, not project documentation.
