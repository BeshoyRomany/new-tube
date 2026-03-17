import { db } from '@/db';
import { subscriptions } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/trpc/init';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import z from 'zod';

export const subscriptionsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ userId: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { userId } = input;

      //if the current logged in user tried to subscribe himself will throw error
      if (userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST' });
      }

      //Then let's save one create in the db in the subscription table for the subscriber
      const [createdSubscription] = await db
        .insert(subscriptions)
        //the "ctx.user.id" -> the current logged in user --> so this the (subscriber)
        //the "userId" -> the userId was assigned on the video --> so this the (the creator)
        .values({ viewerId: ctx.user.id, creatorId: userId })
        .returning();
      return createdSubscription;
    }),
  remove: protectedProcedure
    .input(z.object({ userId: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { userId } = input;

      //if the current logged in user tried to unsubscribe himself will throw error
      if (userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST' });
      }

      //Then let's unsubscribe
      const [deletedSubscription] = await db
        .delete(subscriptions)
        .where(
          //here we will delete but we need to make two checks
          // 1- make sure that the viewerId is the current logged in user
          // 2- make sure that the creatorId is the userId came from input (the current userId from the video owner)
          and(
            eq(subscriptions.viewerId, ctx.user.id),
            eq(subscriptions.creatorId, userId)
          )
        )
        .returning();
      return deletedSubscription;
    }),
});
