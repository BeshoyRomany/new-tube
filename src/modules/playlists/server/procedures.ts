import { DEFAULT_LIMIT } from '@/constants';
import { db } from '@/db';
import {
  playlists,
  playlistVideos,
  users,
  videoReactions,
  videos,
  videoViews,
} from '@/db/schema';
import {
  baseProcedure,
  createTRPCRouter,
  protectedProcedure,
} from '@/trpc/init';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, getTableColumns, lt, or, sql } from 'drizzle-orm';
import z from 'zod';

export const PlaylistsRouter = createTRPCRouter({
  remove: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { id } = input;
      const { id: userId } = ctx.user;

      const [deletedPlaylist] = await db
        .delete(playlists)
        .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
        .returning();

      if (!deletedPlaylist) throw new TRPCError({ code: 'NOT_FOUND' });

      return deletedPlaylist;
    }),
  //Get the playlist by id
  getOne: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input, ctx }) => {
      const { id } = input;
      const { id: userId } = ctx.user;

      const [existingPlaylist] = await db
        .select()
        .from(playlists)
        .where(and(eq(playlists.id, id), eq(playlists.userId, userId)));

      if (!existingPlaylist) throw new TRPCError({ code: 'NOT_FOUND' });

      return existingPlaylist;
    }),
  //Load the playlists videos
  getVideos: protectedProcedure
    .input(
      z.object({
        playlistId: z.uuid(),
        cursor: z
          .object({ id: z.uuid(), updatedAt: z.coerce.date() })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    )
    .query(async ({ input, ctx }) => {
      const { id: userId } = ctx.user;
      const { cursor, limit, playlistId } = input;

      const [existingPlaylist] = await db
        .select()
        .from(playlists)
        .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)));
      if (!existingPlaylist) throw new TRPCError({ code: 'NOT_FOUND' });

      //Here i got all the playlistVideos for the (current playlist)
      const videosFromPlayList = db.$with('playlist_videos').as(
        db
          .select({
            videoId: playlistVideos.videoId,
          })
          .from(playlistVideos)
          .where(eq(playlistVideos.playlistId, playlistId))
      );

      const data = await db
        .with(videosFromPlayList)
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
        //Join the owners of the videos -> when im querying "videos"
        .innerJoin(users, eq(videos.userId, users.id))
        //Join the videoIds from  "videosFromPlayList" only the rows that has the same videoId ->  when im querying "videos"
        //Because we need to "get only" the videos that has the same id from the videos table
        //videosFromPlayList CTE means -> get the videos only that inside specific playlist as we did in the CTE UP
        .innerJoin(
          videosFromPlayList,
          eq(videosFromPlayList.videoId, videos.id)
        )
        .where(
          and(
            eq(videos.visibility, 'public'),
            /*
              Here the cursor should filter based on the (viewedAt) after we joined the viewerVideoViews as CTE with videos table
              because this is now connected with (updatedAt)
              because we updated the the property (updatedAt) each time we visited the video with date.now()
            */
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
  deleteVideo: protectedProcedure
    .input(z.object({ playlistId: z.uuid(), videoId: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { playlistId, videoId } = input;
      const { id: userId } = ctx.user;

      const [existingPlaylist] = await db
        .select()
        .from(playlists)
        .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)));

      if (!existingPlaylist) throw new TRPCError({ code: 'NOT_FOUND' });

      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(
          and(
            eq(videos.id, videoId),
            or(eq(videos.visibility, 'public'), eq(videos.userId, userId))
          )
        );

      if (!existingVideo) throw new TRPCError({ code: 'NOT_FOUND' });

      const [existingPlaylistVideo] = await db
        .select()
        .from(playlistVideos)
        .where(
          and(
            eq(playlistVideos.videoId, videoId),
            eq(playlistVideos.playlistId, playlistId)
          )
        );

      if (!existingPlaylistVideo)
        throw new TRPCError({
          code: 'NOT_FOUND',
        });

      const [deletedPlaylistVideo] = await db
        .delete(playlistVideos)
        .where(
          and(
            eq(playlistVideos.videoId, videoId),
            eq(playlistVideos.playlistId, playlistId)
          )
        )
        .returning();

      if (!deletedPlaylistVideo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
        });
      }
      return {
        id: deletedPlaylistVideo.playlistId,
        videoId: deletedPlaylistVideo.videoId,
        playlistName: existingPlaylist.name,
      };
    }),
  addVideo: protectedProcedure
    .input(z.object({ playlistId: z.uuid(), videoId: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { playlistId, videoId } = input;
      const { id: userId } = ctx.user;

      const [existingPlaylist] = await db
        .select()
        .from(playlists)
        .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)));

      if (!existingPlaylist) throw new TRPCError({ code: 'NOT_FOUND' });

      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(
          and(
            eq(videos.id, videoId),
            or(eq(videos.visibility, 'public'), eq(videos.userId, userId))
          )
        );

      if (!existingVideo) throw new TRPCError({ code: 'NOT_FOUND' });

      const [existingPlaylistVideo] = await db
        .select()
        .from(playlistVideos)
        .where(
          and(
            eq(playlistVideos.videoId, videoId),
            eq(playlistVideos.playlistId, playlistId)
          )
        );
      if (existingPlaylistVideo) {
        throw new TRPCError({
          code: 'CONFLICT',
        });
      }

      const [createdPlaylistVideo] = await db
        .insert(playlistVideos)
        .values({ playlistId, videoId })
        .returning();

      return {
        id: createdPlaylistVideo.playlistId,
        playlistName: existingPlaylist.name,
      };
    }),
  getManyForVideo: protectedProcedure
    .input(
      z.object({
        videoId: z.uuid(),
        cursor: z
          .object({ id: z.string(), updatedAt: z.coerce.date() })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    )
    .query(async ({ input, ctx }) => {
      const { id: userId } = ctx.user;
      const { videoId, cursor, limit } = input;

      const data = await db
        .select({
          ...getTableColumns(playlists),
          videoCount: db.$count(
            playlistVideos,
            eq(playlistVideos.playlistId, playlists.id)
          ),
          user: users,
          /* select the playlist.id that equal in the "playlistVideos".playlistId
            if it's exist go inside the row -> make Correlated Subquery and select also the row from "playlistVideos" 
            if the videoId === "playlistVideos".videoId

            why: because we need to know if the current video exist in the playlist
            so because we connected the the "playlistVideos" with playlist with the (id)
            so the video iteration signature will have (containsVideo = true)

            and if the current playlist.id === "playlistVideos".playlistId which it can be true and we found the row
            but: !! the current videoId not exist in the same row in "playlistVideos" it will return false 
            in the signature so the playlists will appear and the (checkbox) will be false

          */

          containsVideo: videoId
            ? sql<boolean>`(SELECT EXISTS (
              SELECT 1 
              FROM ${playlistVideos} pv
              WHERE pv.playlist_id = ${playlists.id} 
              AND pv.video_id = ${videoId}
            ))`
            : sql<boolean>`false`,
        })
        .from(playlists)
        .innerJoin(users, eq(users.id, playlists.userId))
        .where(
          and(
            eq(playlists.userId, userId),
            cursor
              ? or(
                  lt(playlists.updatedAt, cursor.updatedAt),
                  and(
                    eq(playlists.updatedAt, cursor.updatedAt),
                    lt(playlists.id, cursor.id)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(playlists.updatedAt), desc(playlists.id))
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
  getMany: protectedProcedure
    .input(
      z.object({
        cursor: z
          .object({ id: z.string(), updatedAt: z.coerce.date() })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    )
    .query(async ({ input, ctx }) => {
      const { id: userId } = ctx.user;
      const { cursor, limit } = input;

      const data = await db
        .select({
          ...getTableColumns(playlists),
          videoCount: db.$count(
            playlistVideos,
            eq(playlistVideos.playlistId, playlists.id)
          ),
          thumbnailUrl: sql<string | null>`(
          SELECT v.thumbnail_url 
          FROM ${playlistVideos} pv
          JOIN ${videos} v ON v.id = pv.video_id
          WHERE  pv.playlist_id = ${playlists.id}
          ORDER BY pv.updated_at DESC
          LIMIT 1)
          `,
          user: users,
        })
        .from(playlists)
        .innerJoin(users, eq(users.id, playlists.userId))
        .where(
          and(
            eq(playlists.userId, userId),
            cursor
              ? or(
                  lt(playlists.updatedAt, cursor.updatedAt),
                  and(
                    eq(playlists.updatedAt, cursor.updatedAt),
                    lt(playlists.id, cursor.id)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(playlists.updatedAt), desc(playlists.id))
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
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const { name } = input;
      const { id: userId } = ctx.user;

      const [createdPlaylist] = await db
        .insert(playlists)
        .values({
          userId,
          name,
        })
        .returning();

      if (!createdPlaylist) throw new TRPCError({ code: 'BAD_REQUEST' });

      return createdPlaylist;
    }),
  getLiked: protectedProcedure
    .input(
      z.object({
        cursor: z
          .object({ id: z.string(), likedAt: z.coerce.date() })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    )
    .query(async ({ input, ctx }) => {
      const { id: userId } = ctx.user;
      const { cursor, limit } = input;

      //Here i got all the videos reactions for the (current user) likes
      const viewerVideoReactions = db.$with('viewer_video_reactions').as(
        db
          .select({
            videoId: videoReactions.videoId,
            likedAt: videoReactions.updatedAt,
          })
          .from(videoReactions)
          .where(
            and(
              eq(videoReactions.userId, userId),
              eq(videoReactions.type, 'like')
            )
          )
      );

      const data = await db
        .with(viewerVideoReactions)
        .select({
          ...getTableColumns(videos),
          user: users,
          likedAt: viewerVideoReactions.likedAt,
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
        .innerJoin(
          viewerVideoReactions,
          eq(viewerVideoReactions.videoId, videos.id)
        )
        .where(
          and(
            eq(videos.visibility, 'public'),
            /*
              Here the cursor should filter based on the (viewedAt) after we joined the viewerVideoViews as CTE with videos table
              because this is now connected with (updatedAt)
              because we updated the the property (updatedAt) each time we visited the video with date.now()
            */
            cursor
              ? or(
                  lt(viewerVideoReactions.likedAt, cursor.likedAt),
                  and(
                    eq(viewerVideoReactions.likedAt, cursor.likedAt),
                    lt(videos.id, cursor.id)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(viewerVideoReactions.likedAt), desc(videos.id))
        .limit(limit + 1);
      const hasMore = data.length > limit;
      // Remove the last item of there's more data
      const items = hasMore ? data.slice(0, -1) : data;
      //Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore
        ? { id: lastItem.id, likedAt: lastItem.likedAt }
        : null;

      return {
        items,
        nextCursor,
      };
    }),
  getHistory: protectedProcedure
    .input(
      z.object({
        cursor: z
          .object({ id: z.string(), viewedAt: z.coerce.date() })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    )
    .query(async ({ input, ctx }) => {
      const { id: userId } = ctx.user;
      const { cursor, limit } = input;

      //Here i got all the views for the (current user)
      const viewerVideoViews = db.$with('viewer_video_views').as(
        db
          .select({
            viewedAt: videoViews.updatedAt,
            /*i connected the viewedAt with videoViews.updatedAt at because im updating the date in each view*/
            videoId: videoViews.videoId,
          })
          .from(videoViews)
          .where(eq(videoViews.userId, userId))
      );

      const data = await db
        .with(viewerVideoViews)
        .select({
          ...getTableColumns(videos),
          user: users,
          viewedAt: viewerVideoViews.viewedAt,
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
        .innerJoin(viewerVideoViews, eq(viewerVideoViews.videoId, videos.id))
        .where(
          and(
            eq(videos.visibility, 'public'),
            /*
              Here the cursor should filter based on the (viewedAt) after we joined the viewerVideoViews as CTE with videos table
              because this is now connected with (updatedAt)
              because we updated the the property (updatedAt) each time we visited the video with date.now()
            */
            cursor
              ? or(
                  lt(viewerVideoViews.viewedAt, cursor.viewedAt),
                  and(
                    eq(viewerVideoViews.viewedAt, cursor.viewedAt),
                    lt(videos.id, cursor.id)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(viewerVideoViews.viewedAt), desc(videos.id))
        .limit(limit + 1);
      const hasMore = data.length > limit;
      // Remove the last item of there's more data
      const items = hasMore ? data.slice(0, -1) : data;
      //Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore
        ? { id: lastItem.id, viewedAt: lastItem.viewedAt }
        : null;

      return {
        items,
        nextCursor,
      };
    }),
});
