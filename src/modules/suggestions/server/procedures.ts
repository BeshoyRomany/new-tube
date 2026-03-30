import { db } from '@/db';
import { z } from 'zod';
import { users, videoReactions, videos, videoViews } from '@/db/schema';
import { baseProcedure, createTRPCRouter } from '@/trpc/init';
import {
  eq,
  and,
  or,
  lt,
  desc,
  getTableColumns,
  not,
  isNull,
} from 'drizzle-orm';
import { DEFAULT_LIMIT } from '@/constants';
import { TRPCError } from '@trpc/server';

export const suggestionsRouter = createTRPCRouter({
  getMany: baseProcedure
    .input(
      z.object({
        videoId: z.uuid(),
        cursor: z
          .object({
            id: z.string(),
            updatedAt: z.coerce.date(),
          })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    ) //Inversion of Control (IoC)
    .query(async ({ input }) => {
      const { videoId, cursor, limit } = input;

      //Get the existing video that based on it we will load the suggestions
      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(eq(videos.id, videoId));
      // if the video not exist throw an error
      if (!existingVideo) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

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
            //get videos under the same category but not the existingVideo
            not(eq(videos.id, existingVideo.id)),
            eq(videos.visibility, 'public'),
            existingVideo.categoryId
              ? eq(videos.categoryId, existingVideo.categoryId)
              : isNull(videos.categoryId),
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
});
