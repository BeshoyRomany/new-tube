import { db } from '@/db';
import { videoReactions } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/trpc/init';
import { and, eq } from 'drizzle-orm';
import z from 'zod';

export const videoReactionsRouter = createTRPCRouter({
  like: protectedProcedure
    .input(z.object({ videoId: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { videoId } = input;
      const { id: userId } = ctx.user;

      const [existingVideoReactionLike] = await db
        .select()
        .from(videoReactions)
        .where(
          and(
            eq(videoReactions.videoId, videoId),
            eq(videoReactions.userId, userId),
            eq(videoReactions.type, 'like')
          )
        );

      if (existingVideoReactionLike) {
        const [deletedViewerReaction] = await db
          .delete(videoReactions)
          .where(
            and(
              eq(videoReactions.videoId, videoId),
              eq(videoReactions.userId, userId)
            )
          )
          .returning();

        return deletedViewerReaction;
      }
      const [createdVideoReaction] = await db
        .insert(videoReactions)
        .values({
          userId,
          videoId,
          type: 'like',
        })
        // onConflict here will make "update" in case the row exists but dislike
        // because if it was 'like', it would have been deleted in the if block above
        // So we only reach here if: no reaction OR dislike
        // - No reaction → INSERT works
        // - Dislike → CONFLICT → UPDATE to 'like'
        .onConflictDoUpdate({
          target: [videoReactions.videoId, videoReactions.userId],
          set: {
            type: 'like',
          },
        })
        .returning();
      return createdVideoReaction;
    }),
  dislike: protectedProcedure
    .input(z.object({ videoId: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { videoId } = input;
      const { id: userId } = ctx.user;

      const [existingVideoReactionDislike] = await db
        .select()
        .from(videoReactions)
        .where(
          and(
            eq(videoReactions.videoId, videoId),
            eq(videoReactions.userId, userId),
            eq(videoReactions.type, 'dislike')
          )
        );

      if (existingVideoReactionDislike) {
        const [deletedViewerReaction] = await db
          .delete(videoReactions)
          .where(
            and(
              eq(videoReactions.videoId, videoId),
              eq(videoReactions.userId, userId)
            )
          )
          .returning();

        return deletedViewerReaction;
      }
      const [createdVideoReaction] = await db
        .insert(videoReactions)
        .values({
          userId,
          videoId,
          type: 'dislike',
        })
        // onConflict here will make "update" in case the row exists but like
        // because if it was 'like', it would have been deleted in the if block above
        // So we only reach here if: no reaction OR like
        // - No reaction → INSERT works
        // - like → CONFLICT → UPDATE to 'dislike'
        .onConflictDoUpdate({
          target: [videoReactions.videoId, videoReactions.userId],
          set: {
            type: 'dislike',
          },
        })
        .returning();
      return createdVideoReaction;
    }),
});
