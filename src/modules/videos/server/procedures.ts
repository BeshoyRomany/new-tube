import { db } from '@/db';
import {
  subscriptions,
  users,
  videoReactions,
  videos,
  videoUpdateSchema,
  videoViews,
} from '@/db/schema';
import { mux } from '@/lib/mux';
import { UTApi } from 'uploadthing/server';
import {
  baseProcedure,
  createTRPCRouter,
  protectedProcedure,
} from '@/trpc/init';
import { TRPCError } from '@trpc/server';
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  lt,
  or,
} from 'drizzle-orm';
import z from 'zod';
import { workflow } from '@/lib/workflow';
import { DEFAULT_LIMIT } from '@/constants';

const utapi = new UTApi();
export const videosRouter = createTRPCRouter({
  getManySubscribed: protectedProcedure
    .input(
      z.object({
        cursor: z
          .object({ id: z.string(), updatedAt: z.coerce.date() })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    ) //Inversion of Control (IoC)
    .query(async ({ input, ctx }) => {
      const { cursor, limit } = input;
      const { id: userId } = ctx.user;

      /*
        Here im going to bring all the "subscriptions" for the "current viewer"
        through getting the all the "creators" that the viewer subscribed in there channels.
      */
      const viewerSubscriptions = db.$with('viewer_subscriptions').as(
        db
          .select({
            userId: subscriptions.creatorId,
          })
          .from(subscriptions)
          .where(eq(subscriptions.viewerId, userId))
      );

      const data = await db
        .with(viewerSubscriptions)
        .select({
          ...getTableColumns(videos),
          user: users,
          likeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, 'like')
            )
          ),
          dislikeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, 'dislike')
            )
          ),
          viewCount: db.$count(videoViews, eq(videoViews.videoId, videos.id)),
        })
        .from(videos)

        /*
          here when im trying to get all the users that they are uploaded the video
          because after i have all i will filter all of them down based on (if they are exist in my subscriptions list or not)
        */
        .innerJoin(users, eq(videos.userId, users.id))
        /* Here the main goal to get all the videos for the creators where the current viewer subscribed for their channels 
          and join it to the query
          so for example : the current user (viewer) subscribed for 
          [creator1, creator2, creator3] -> the current viewer is a column in the same row
          and now i have the creators. as a subscriptions that we gonna load all the videos from them (the creators videos)

          and because we have innerJoin also with the users table
          so we need to check and get the creator user if he exist already in the users table (mandatory to be exist)
          because if he is not exist it means that his videos also cascaded (Deleted)

          simply: this innerJoin like extra filter means. if this user not exist in my subscriptions list -> throw him out
        */
        .innerJoin(
          viewerSubscriptions,
          eq(viewerSubscriptions.userId, users.id)
        )
        .where(
          and(
            eq(videos.visibility, 'public'),
            cursor
              ? or(
                  lt(videos.updatedAt, cursor.updatedAt),
                  and(
                    eq(videos.updatedAt, cursor.updatedAt),
                    lt(videos.id, cursor.id)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(videos.updatedAt), desc(videos.id))
        .limit(limit + 1);
      const hasMore = data.length > limit;
      // Remove the last item of there's more data
      const items = hasMore ? data.slice(0, -1) : data;
      //Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore
        ? { id: lastItem.id, updatedAt: lastItem.updatedAt }
        : null;

      return {
        items,
        nextCursor,
      };
    }),

  getTrending: baseProcedure
    .input(
      z.object({
        cursor: z.object({ id: z.string(), viewCount: z.number() }).nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    ) //Inversion of Control (IoC)
    .query(async ({ input }) => {
      const { cursor, limit } = input;

      /*
        Here we getting the viewCount as a subquery from the viewCount table for each video
        because we selecting from "videos"
        so each video we selecting -> we need to count the total views where the viewCount.videoId == current video.id
        
        then we need to tell the cursor to get the most highest videos has views
        so we will the cursor depend on the view count for each video

        then we need to show the most heights videos at the beginning so we will orderBy the most highest views
      */
      const viewCountSubquery = db.$count(
        videoViews,
        eq(videoViews.videoId, videos.id)
      );

      const data = await db
        .select({
          ...getTableColumns(videos),
          user: users,
          likeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, 'like')
            )
          ),
          dislikeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, 'dislike')
            )
          ),
          viewCount: viewCountSubquery,
        })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .where(
          and(
            eq(videos.visibility, 'public'),
            cursor
              ? or(
                  lt(viewCountSubquery, cursor.viewCount),
                  and(
                    eq(viewCountSubquery, cursor.viewCount),
                    lt(videos.id, cursor.id)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(viewCountSubquery), desc(videos.id))
        .limit(limit + 1);

      const hasMore = data.length > limit;
      // Remove the last item of there's more data
      const items = hasMore ? data.slice(0, -1) : data;
      //Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore
        ? { id: lastItem.id, viewCount: lastItem.viewCount }
        : null;

      return {
        items,
        nextCursor,
      };
    }),

  getMany: baseProcedure
    .input(
      z.object({
        categoryId: z.uuid().nullish(),
        userId: z.uuid().nullish(),
        cursor: z
          .object({ id: z.string(), updatedAt: z.coerce.date() })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    ) //Inversion of Control (IoC)
    .query(async ({ input }) => {
      const { cursor, limit, categoryId, userId } = input;

      const data = await db
        .select({
          ...getTableColumns(videos),
          user: users,
          likeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, 'like')
            )
          ),
          dislikeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, 'dislike')
            )
          ),
          viewCount: db.$count(videoViews, eq(videoViews.videoId, videos.id)),
        })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .where(
          and(
            userId ? eq(videos.userId, userId) : undefined,
            categoryId ? eq(videos.categoryId, categoryId) : undefined,
            eq(videos.visibility, 'public'),

            // this below code is for the case when the viewer is the owner of the video so he can see his private videos also
            // when the visibility is private we need to check if the viewer is the owner of the video or not if he is the owner he can see it even if it's private but if he is not the owner he can't see it because it's private

            // or(
            //   eq(videos.visibility, 'public'),
            //   viewer ? eq(videos.userId, viewer.id) : sql`false`
            // ),
            cursor
              ? or(
                  lt(videos.updatedAt, cursor.updatedAt),
                  and(
                    eq(videos.updatedAt, cursor.updatedAt),
                    lt(videos.id, cursor.id)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(videos.updatedAt), desc(videos.id))
        .limit(limit + 1);
      const hasMore = data.length > limit;
      // Remove the last item of there's more data
      const items = hasMore ? data.slice(0, -1) : data;
      //Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore
        ? { id: lastItem.id, updatedAt: lastItem.updatedAt }
        : null;

      return {
        items,
        nextCursor,
      };
    }),

  getOne: baseProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input, ctx }) => {
      const { clerkUserId } = ctx;
      let userId;

      const [user] = await db
        .select()
        .from(users)
        .where(inArray(users.clerkId, clerkUserId ? [clerkUserId] : []));

      if (user) {
        userId = user.id;
      }

      const viewerReactions = db.$with('viewer_reactions').as(
        db
          .select({
            videoId: videoReactions.videoId,
            type: videoReactions.type,
          })
          .from(videoReactions)
          .where(inArray(videoReactions.userId, userId ? [userId] : []))
      );
      const viewerSubscriptions = db.$with('viewer_subscriptions').as(
        db
          .select()
          .from(subscriptions)
          .where(inArray(subscriptions.viewerId, userId ? [userId] : []))
      );

      const [existingVideo] = await db
        .with(viewerReactions, viewerSubscriptions)
        .select({
          ...getTableColumns(videos),
          user: {
            ...getTableColumns(users),
            subscriberCount: db.$count(
              subscriptions,
              eq(subscriptions.creatorId, users.id)
            ),
            viewerSubscribed: isNotNull(viewerSubscriptions.viewerId).mapWith(
              Boolean
            ),
          },
          viewCount: db.$count(videoViews, eq(videoViews.videoId, videos.id)),
          likeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, 'like')
            )
          ),
          dislikeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, 'dislike')
            )
          ),
          viewerReaction: viewerReactions.type,
        })
        .from(videos)
        .innerJoin(users, eq(users.id, videos.userId))
        .leftJoin(viewerReactions, eq(viewerReactions.videoId, videos.id))
        .leftJoin(
          viewerSubscriptions,
          eq(viewerSubscriptions.creatorId, users.id)
        )
        .where(eq(videos.id, input.id));

      if (!existingVideo) throw new TRPCError({ code: 'NOT_FOUND' });
      return existingVideo;
    }),

  generateTitle: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const { workflowRunId } = await workflow.trigger({
        url: `${process.env.UPSTASH_WORKFLOW_URL}/api/videos/workflows/title`,
        body: { userId, videoId: input.id },
      });
      return workflowRunId;
    }),
  generateDescription: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const { workflowRunId } = await workflow.trigger({
        url: `${process.env.UPSTASH_WORKFLOW_URL}/api/videos/workflows/description`,
        body: { userId, videoId: input.id },
      });
      return workflowRunId;
    }),
  generateThumbnail: protectedProcedure
    .input(z.object({ id: z.uuid(), prompt: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const { workflowRunId } = await workflow.trigger({
        url: `${process.env.UPSTASH_WORKFLOW_URL}/api/videos/workflows/thumbnail`,
        body: { userId, videoId: input.id, prompt: input.prompt },
      });
      return workflowRunId;
    }),
  revalidate: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;

      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(and(eq(videos.id, input.id), eq(videos.userId, userId)));

      if (!existingVideo) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!existingVideo.muxUploadId)
        throw new TRPCError({ code: 'BAD_REQUEST' });

      /*
      using mux helpers to retrieve the video manually bu using muxUploadId then -> assetId and we relied on muxUploadId before assetId directly because maybe the webhook lagged to give us also the assetId in route.ts file for mux webhook
      in step "case 'video.asset.created'"
      */
      const upload = await mux.video.uploads.retrieve(
        existingVideo.muxUploadId
      );

      if (!upload || !upload.asset_id)
        throw new TRPCError({ code: 'BAD_REQUEST' });

      const asset = await mux.video.assets.retrieve(upload.asset_id);

      if (!asset) {
        throw new TRPCError({ code: 'BAD_REQUEST' });
      }

      const playbackId = asset.playback_ids?.[0].id;
      const duration = asset.duration ? Math.round(asset.duration) : 0;
      const videoTrack = asset.tracks?.find((t) => t.type === 'video');
      const audioTrack = asset.tracks?.find((t) => t.type === 'audio');
      const muxTrackId = videoTrack?.id;
      const muxTrackStatus = audioTrack?.status;

      const [updateVideo] = await db
        .update(videos)
        .set({
          muxStatus: asset.status,
          muxPlaybackId: playbackId,
          muxAssetId: asset.id,
          muxTrackId: muxTrackId,
          muxTrackStatus: muxTrackStatus,
          duration,
        })
        .where(and(eq(videos.userId, userId), eq(videos.id, input.id)))
        .returning();

      return updateVideo;
    }),
  restoreThumbnail: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(and(eq(videos.id, input.id), eq(videos.userId, userId)));

      if (!existingVideo) throw new TRPCError({ code: 'NOT_FOUND' });

      // REMOVE the current Thumbnail & clean the DB before upload new - to keep the storage empty
      if (existingVideo.thumbnailKey) {
        try {
          await utapi.deleteFiles(existingVideo.thumbnailKey);
        } catch (e) {
          console.error('Failed to delete old thumbnail', e);
        }
        await db
          .update(videos)
          .set({ thumbnailKey: null, thumbnailUrl: null })
          .where(and(eq(videos.id, input.id), eq(videos.userId, userId)));
      }

      if (!existingVideo.muxPlaybackId)
        throw new TRPCError({ code: 'BAD_REQUEST' });

      const tempThumbnailUrl = `https://image.mux.com/${existingVideo.muxPlaybackId}/thumbnail.jpg`;
      // Upload a copy from mux images into UploadThing Storage
      const uploadedThumbnail =
        await utapi.uploadFilesFromUrl(tempThumbnailUrl);

      if (!uploadedThumbnail.data)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const { key: thumbnailKey, url: thumbnailUrl } = uploadedThumbnail.data;

      const [updatedVideo] = await db
        .update(videos)
        .set({ thumbnailUrl, thumbnailKey })
        .where(and(eq(videos.id, input.id), eq(videos.userId, userId)))
        .returning();

      return updatedVideo;
    }),
  remove: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const { id: videoId } = input;

      const [removeVideo] = await db
        .delete(videos)
        .where(and(eq(videos.userId, userId), eq(videos.id, videoId)))
        .returning();

      if (!removeVideo) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return removeVideo;
    }),

  update: protectedProcedure
    .input(videoUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      if (!input.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing video ID',
        });
      }
      const [updatedVideo] = await db
        .update(videos)
        .set({
          title: input.title,
          description: input.description,
          categoryId: input.categoryId,
          visibility: input.visibility as 'private' | 'public',
          updatedAt: new Date(),
        })
        .where(and(eq(videos.id, input.id), eq(videos.userId, userId)))
        .returning();

      if (!updatedVideo) throw new TRPCError({ code: 'NOT_FOUND' });
      return updatedVideo;
    }),

  create: protectedProcedure.mutation(async ({ ctx }) => {
    const { id: userId } = ctx.user;
    const upload = await mux.video.uploads.create({
      new_asset_settings: {
        passthrough: userId,
        playback_policy: ['public'],
        video_quality: 'basic',
        input: [
          {
            generated_subtitles: [{ language_code: 'en', name: 'English' }],
          },
        ],
      },
      cors_origin: '*', //TODO: In production, set to your url
    });
    // throw new TRPCError({ code: "BAD_REQUEST" });
    const [video] = await db
      .insert(videos)
      .values({
        userId,
        title: 'Untitled',
        muxStatus: 'waiting',
        muxUploadId: upload.id,
      })
      .returning();
    return { video: video, url: upload.url };
  }),
});

//CTE Common Table Expression

//Join Explanation
//.from(videos)                        // Step 1: videos table
//.innerJoin(users, ...)               // Step 2: videos + users
//.leftJoin(viewerReactions, ...)      // Step 3: videos + users + reactions
//.leftJoin(viewerSubscriptions, ...)  // Step 4: videos + users + reactions + subscriptions

/*
Step 1: from(videos)
─────────────────────────────────────────────────────────────
┌─────────┬──────────┬─────────┐
│   id    │  title   │ userId  │
├─────────┼──────────┼─────────┤
│ video-1 │ "Hello"  │ user-2  │
└─────────┴──────────┴─────────┘

Step 2: .innerJoin(users)
─────────────────────────────────────────────────────────────
┌─────────┬──────────┬─────────┬─────────┬─────────┐
│   id    │  title   │ userId  │ users.id│  name   │
├─────────┼──────────┼─────────┼─────────┼─────────┤
│ video-1 │ "Hello"  │ user-2  │ user-2  │  Sara   │
└─────────┴──────────┴─────────┴─────────┴─────────┘
                                   ↑
                          users.id now exist

Step 3: .leftJoin(viewerSubscriptions, creatorId = users.id)
─────────────────────────────────────────────────────────────
┌─────────┬──────────┬─────────┬─────────┬────────┬────────────┐
│   id    │  title   │ userId  │ users.id│  name  │subscription│
├─────────┼──────────┼─────────┼─────────┼────────┼────────────┤
│ video-1 │ "Hello"  │ user-2  │ user-2  │ Sara   │   ✅       │
└─────────┴──────────┴─────────┴─────────┴────────┴────────────┘
                                     ↑
                        Use user.id from the last step
*/

// the role : each join build on the last join

/**
 * ============================================================
 * GET ONE VIDEO PROCEDURE
 * ============================================================
 *
 * GOAL:
 * Get a single video with all its data, including:
 * - Video owner info (the user who uploaded the video)
 * - Video stats (views, likes, dislikes)
 * - Current viewer's reaction (like/dislike/null)
 * - Current viewer's subscription status (subscribed/not subscribed)
 *
 * KEY CONCEPTS:
 * ───────────────────────────────────────────────────────────
 * 🎬 OWNER  = The user who uploaded the video (videos.userId)
 *             - Comes from INNER JOIN users
 *             - Always exists (video must have an owner)
 *
 * 👁️ VIEWER = The currently logged-in user (ctx.clerkUserId)
 *             - May or may not exist (guest users)
 *             - Could be the same person as owner OR a different person
 *
 * 📌 EXAMPLE:
 *   - Ahmed (viewer) is watching a video uploaded by Sara (owner)
 *   - Ahmed is NOT the owner, he's just a viewer
 * ───────────────────────────────────────────────────────────
 *
 * STEPS:
 * 1️⃣ Get Current User (VIEWER)
 *    - Check if there's a logged-in user via Clerk
 *    - If yes → save userId (the VIEWER's id)
 *    - If no → userId = undefined (guest user)
 *
 * 2️⃣ Create CTEs (Temporary Tables for VIEWER's data only)
 *    - viewerReactions: All reactions made by VIEWER
 *    - viewerSubscriptions: All subscriptions made by VIEWER
 *    - If no logged-in user → CTEs are empty
 *
 *    Example: Ahmed (viewerId=1) subscribed to Sara (creatorId=2)
 *    ┌─────────────┬─────────────┐
 *    │  viewerId   │  creatorId  │
 *    ├─────────────┼─────────────┤
 *    │     1       │      2      │  ← Ahmed subscribed to Sara
 *    └─────────────┴─────────────┘
 *
 * 3️⃣ Build Main Query
 *    - FROM videos
 *    - INNER JOIN users → Get OWNER data (users.id = videos.userId)
 *    - LEFT JOIN viewerReactions → Get VIEWER's reaction on this video
 *    - LEFT JOIN viewerSubscriptions → Check if VIEWER subscribed to OWNER
 *      (viewerSubscriptions.creatorId = users.id where users.id = OWNER)
 *
 * 4️⃣ Filter
 *    - WHERE videos.id = input.id → Return only ONE video
 *
 * 5️⃣ Select Columns
 *    - All video columns
 *    - user: {
 *        ...All owner columns,
 *        subscriberCount: 150K subscriber (owner) creatorId == users.id
 *        viewerSubscribed: true/false  ← Is VIEWER subscribed to OWNER?
 *      }
 *    - viewCount, likeCount, dislikeCount (aggregations)
 *    - viewerReaction: VIEWER's reaction on this video
 *
 * RESULT:
 * {
 *   id: "video-1",
 *   title: "Hello World",
 *   user: {
 *     id: "user-2",           // ← OWNER's id (Sara)
 *     name: "Sara",           // ← OWNER's name
 *     imageUrl: "...",        // ← OWNER's image
 *     viewerSubscribed: true  // ← Is VIEWER (Ahmed) subscribed to OWNER (Sara)?
 *   },
 *   viewCount: 150,
 *   likeCount: 45,
 *   dislikeCount: 3,
 *   viewerReaction: "like"    // ← VIEWER's reaction (null if no reaction)
 * }
 * ============================================================
 */

/**
 * ============================================================
 * VIEWER SUBSCRIBED LOGIC
 * ============================================================
 *
 * WHY ONE RECORD ONLY?
 * ───────────────────────────────────────────────────────────
 * The subscriptions table has a Composite Primary Key:
 *
 * primaryKey({ columns: [viewerId, creatorId] })
 *
 * This means:
 * - One viewer can subscribe to one creator ONLY ONCE
 * - No duplicate subscriptions allowed
 * - Like YouTube: you can't subscribe to the same channel twice
 *
 * Example:
 * ┌─────────────┬─────────────┬─────────────────────────────┐
 * │  viewerId   │  creatorId  │          Status             │
 * ├─────────────┼─────────────┼─────────────────────────────┤
 * │  user-1     │  user-2     │  ✅ Allowed (first time)    │
 * │  user-1     │  user-5     │  ✅ Allowed (different creator)│
 * │  user-1     │  user-2     │  ❌ NOT Allowed (duplicate!) │
 * └─────────────┴─────────────┴─────────────────────────────┘
 *
 * WHY viewerId IS ALWAYS THE CURRENT USER?
 * ───────────────────────────────────────────────────────────
 * The CTE is already filtered by the current logged-in user:
 *
 * .where(inArray(subscriptions.viewerId, userId ? [userId] : []))
 *                ↑
 *          Only current user's subscriptions
 *
 * So ALL records in the CTE have viewerId = current logged-in user.
 * It's IMPOSSIBLE to have a different viewerId in the result.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ CTE contains ONLY current viewer's subscriptions       │
 * │ Every viewerId in CTE = current logged-in user         │
 * │ isNotNull(viewerId) → true means CURRENT user subscribed│
 * └─────────────────────────────────────────────────────────┘
 *
 * ALL POSSIBLE CASES:
 * ───────────────────────────────────────────────────────────
 * ┌─────────────────────────────────────────────────────────┐
 * │ CASE 1: Logged in + Subscribed to this owner            │
 * │   CTE has data, LEFT JOIN finds match                   │
 * │   viewerId = "user-1" → isNotNull = true                │
 * │   Result: viewerSubscribed = true ✅                     │
 * ├─────────────────────────────────────────────────────────┤
F     │
 * │   CTE has data, LEFT JOIN finds NO match                │
 * │   viewerId = null → isNotNull = false                   │
 * │   Result: viewerSubscribed = false ❌                    │
 * ├─────────────────────────────────────────────────────────┤
 * │ CASE 3: Guest (not logged in)                           │
 * │   CTE is empty (WHERE viewerId IN [] = nothing)         │
 * │   LEFT JOIN with empty CTE = null                       │
 * │   viewerId = null → isNotNull = false                   │
 * │   Result: viewerSubscribed = false ❌                    │
 * └─────────────────────────────────────────────────────────┘
 *
 * WHY USE isNotNull().mapWith(Boolean)?
 * ───────────────────────────────────────────────────────────
 *
 * ❌ WRONG APPROACH:
 * viewerSubscribed: viewerSubscriptions.viewerId
 *
 * This would return:
 * - "user-1" (string) if subscribed
 * - null if not subscribed
 *
 * Problems:
 * 1. Returns the actual ID (security concern)
 * 2. Mixed types: string | null (not clean)
 * 3. Not intuitive for frontend usage
 *
 * ✅ CORRECT APPROACH:
 * viewerSubscribed: isNotNull(viewerSubscriptions.viewerId).mapWith(Boolean)
 *
 * This returns:
 * - true (boolean) if subscribed
 * - false (boolean) if not subscribed
 *
 * Benefits:
 * ┌─────────────────────────────────────────────────────────┐
 * │ 1. Type Safety    → Always boolean, never string        │
 * │ 2. Security       → Doesn't expose the viewerId         │
 * │ 3. Frontend Ready → Simple true/false check             │
 * │ 4. Consistent     → Same pattern as viewerReaction      │
 * │    but returns boolean instead of the value itself      │
 * └─────────────────────────────────────────────────────────┘
 *
 * COMPARISON:
 * ┌─────────────────────┬───────────────────────────────────┐
 * │ viewerReaction      │ Returns the actual value:         │
 * │                     │ 'like' | 'dislike' | null         │
 * │                     │ We NEED to know WHICH reaction    │
 * ├─────────────────────┼───────────────────────────────────┤
 * │ viewerSubscribed    │ Returns boolean only:             │
 * │                     │ true | false                      │
 * │                     │ We ONLY need to know if subscribed│
 * └─────────────────────┴───────────────────────────────────┘
 *
 * FLOW:
 * ───────────────────────────────────────────────────────────
 * 1. viewerSubscriptions CTE = All CURRENT viewer's subscriptions
 *    (already filtered to current user only)
 *
 * 2. LEFT JOIN filters to ONE record:
 *    eq(viewerSubscriptions.creatorId, users.id)
 *    → finds where creatorId = OWNER
 *
 * 3. Result is always ONE record (or null):
 *    ┌─────────────────────────────────────────────────────┐
 *    │ Found record → viewerSubscribed = true             │
 *    │ Null record  → viewerSubscribed = false            │
 *    └─────────────────────────────────────────────────────┘
 *
 * ============================================================
 */
