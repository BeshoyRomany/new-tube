import { db } from '@/db';
import { commentReactions } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/trpc/init';
import { and, eq } from 'drizzle-orm';
import z from 'zod';

export const commentReactionsRouter = createTRPCRouter({
  like: protectedProcedure
    .input(z.object({ commentId: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { commentId } = input;
      const { id: userId } = ctx.user;

      const [existingCommentReactionLike] = await db
        .select()
        .from(commentReactions)
        .where(
          and(
            eq(commentReactions.commentId, commentId),
            eq(commentReactions.userId, userId),
            eq(commentReactions.type, 'like')
          )
        );

      // if "like" exist delete it and return deletedCommentReaction and stop the mutation
      if (existingCommentReactionLike) {
        const [deletedCommentReaction] = await db
          .delete(commentReactions)
          .where(
            and(
              eq(commentReactions.commentId, commentId),
              eq(commentReactions.userId, userId)
            )
          )
          .returning();

        return deletedCommentReaction;
      }
      // if no "like" exist so -> insert and stop the mutation
      const [createdCommentReaction] = await db
        .insert(commentReactions)
        .values({
          userId,
          commentId,
          type: 'like',
        })
        // onConflict here will make "update" in case the row exists but dislike
        // because if it was 'like', it would have been deleted in the if block above
        // So we only reach here if: no reaction OR dislike
        // - No reaction → INSERT works
        // - Dislike → CONFLICT → UPDATE to 'like'
        .onConflictDoUpdate({
          target: [commentReactions.commentId, commentReactions.userId],
          set: {
            type: 'like',
          },
        })
        .returning();
      return createdCommentReaction;
    }),
  dislike: protectedProcedure
    .input(z.object({ commentId: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { commentId } = input;
      const { id: userId } = ctx.user;

      const [existingCommentReactionDislike] = await db
        .select()
        .from(commentReactions)
        .where(
          and(
            eq(commentReactions.commentId, commentId),
            eq(commentReactions.userId, userId),
            eq(commentReactions.type, 'dislike')
          )
        );

      // if "dislike" exist delete it and return deletedCommentReaction and stop the mutation
      if (existingCommentReactionDislike) {
        const [deletedCommentReaction] = await db
          .delete(commentReactions)
          .where(
            and(
              eq(commentReactions.commentId, commentId),
              eq(commentReactions.userId, userId)
            )
          )
          .returning();

        return deletedCommentReaction;
      }

      // if no "dislike" exist so -> insert and stop the mutation
      const [createdCommentReaction] = await db
        .insert(commentReactions)
        .values({
          userId,
          commentId,
          type: 'dislike',
        })
        // onConflict here will make "update" in case the row exists but like
        // because if it was 'like', it would have been deleted in the if block above
        // So we only reach here if: no reaction OR like
        // - No reaction → INSERT works
        // - like → CONFLICT → UPDATE to 'dislike'
        .onConflictDoUpdate({
          target: [commentReactions.commentId, commentReactions.userId],
          set: {
            type: 'dislike',
          },
        })
        .returning();
      return createdCommentReaction;
    }),
});
