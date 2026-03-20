import { db } from '@/db';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import z, { uuid } from 'zod';
import {
  commentInsertSchema,
  comments,
  commentSelectSchema,
  users,
} from '@/db/schema';
import {
  baseProcedure,
  createTRPCRouter,
  protectedProcedure,
} from '@/trpc/init';
import { DEFAULT_LIMIT } from '@/constants';
import { TRPCError } from '@trpc/server';

export const commentsRouter = createTRPCRouter({
  remove: protectedProcedure
    .input(z.object({ id: uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { id } = input; //video id always from the queryParam videoId
      const { id: userId } = ctx.user; // user who will create the comment "the current logged in"

      const [deletedComment] = await db
        .delete(comments)
        .where(and(eq(comments.id, id), eq(comments.userId, userId)))
        .returning();
      if (!deletedComment) throw new TRPCError({ code: 'NOT_FOUND' });
      return deletedComment;
    }),
  update: protectedProcedure
    .input(z.object({ id: uuid(), value: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { id, value } = input; //video id always from the queryParam videoId
      const { id: userId } = ctx.user; // user who will create the comment "the current logged in"

      const [updateComment] = await db
        .update(comments)
        .set({
          value,
        })
        .where(and(eq(comments.id, id), eq(comments.userId, userId)))
        .returning();
      if (!updateComment) throw new TRPCError({ code: 'NOT_FOUND' });
      return updateComment;
    }),
  create: protectedProcedure
    .input(
      commentInsertSchema.pick({
        videoId: true,
        value: true,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { videoId, value } = input; //video id always from the queryParam videoId
      const { id: userId } = ctx.user; // user who will create the comment "the current logged in"

      const [createdComment] = await db
        .insert(comments)
        .values({ userId, videoId, value })
        .returning();

      return createdComment;
    }),
  getMany: baseProcedure
    .input(
      //this is a different way to use "pick" with "zod extend() method"
      commentSelectSchema.pick({ videoId: true }).extend({
        cursor: z
          .object({
            id: commentSelectSchema.shape.id,
            updatedAt: z.coerce.date(),
          })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    )
    .query(async ({ input }) => {
      const { videoId, cursor, limit } = input;

      const [[totalCount], data] = await Promise.all([
        // Get the total count one time
        // Fetch total count only on the first page (!cursor) to optimize DB;
        // subsequent pages return 0 without overriding data.pages[0] in React Query.
        !cursor
          ? db
              .select({ count: count() })
              .from(comments)
              .where(eq(comments.videoId, videoId))
          : [{ count: 0 }],
        db
          .select({
            ...getTableColumns(comments),
            user: users,
          })
          .from(comments)
          .where(
            and(
              eq(comments.videoId, videoId),
              cursor
                ? or(
                    lt(comments.updatedAt, cursor.updatedAt),
                    and(
                      eq(comments.updatedAt, cursor.updatedAt),
                      lt(comments.id, cursor.id)
                    )
                  )
                : undefined
            )
          )
          .innerJoin(users, eq(users.id, comments.userId))
          .orderBy(desc(comments.updatedAt), desc(comments.id))
          .limit(limit + 1), // try get one more record to check if there's more data
      ]);

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
        totalCount: totalCount.count,
        nextCursor,
      };
    }),
});
