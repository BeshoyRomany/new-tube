import { db } from '@/db';
import { and, desc, eq, getTableColumns } from 'drizzle-orm';
import z from 'zod';
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

export const commentsRouter = createTRPCRouter({
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
    .input(commentSelectSchema.pick({ videoId: true }))
    .query(async ({ input }) => {
      const { videoId } = input;
      const data = await db
        .select({
          ...getTableColumns(comments),
          user: users,
        })
        .from(comments)
        .where(eq(comments.videoId, videoId))
        .innerJoin(users, eq(users.id, comments.userId))
        .orderBy(desc(comments.createdAt));

      return data;
    }),
});
