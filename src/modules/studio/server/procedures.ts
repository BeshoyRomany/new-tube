import { db } from '@/db';
import { z } from 'zod';
import { comments, videoReactions, videos, videoViews } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/trpc/init';
import { eq, and, or, lt, desc, getTableColumns } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { DEFAULT_LIMIT } from '@/constants';

export const studioRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const { id } = input;
      const [video] = await db
        .select()
        .from(videos)
        .where(and(eq(videos.id, id), eq(videos.userId, userId)));
      if (!video) throw new TRPCError({ code: 'NOT_FOUND' });
      return video;
    }),
  getMany: protectedProcedure
    .input(
      z.object({
        cursor: z
          .object({ id: z.string(), updatedAt: z.coerce.date() })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    ) //Inversion of Control (IoC)
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;
      const { id: userId } = ctx.user;
      const data = await db
        .select({
          ...getTableColumns(videos),
          likeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, 'like')
            )
          ),
          viewCount: db.$count(videoViews, eq(videoViews.videoId, videos.id)),
          commentCount: db.$count(comments, eq(comments.videoId, videos.id)),
        })
        .from(videos)
        .where(
          and(
            eq(videos.userId, userId),
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
