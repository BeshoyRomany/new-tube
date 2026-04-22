import { DEFAULT_LIMIT } from '@/constants';
import { db } from '@/db';
import { subscriptions, users } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/trpc/init';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, getTableColumns, lt, or } from 'drizzle-orm';
import z from 'zod';

export const subscriptionsRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(
      z.object({
        cursor: z
          .object({ creatorId: z.string(), updatedAt: z.coerce.date() })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    ) //Inversion of Control (IoC)
    .query(async ({ input, ctx }) => {
      const { cursor, limit } = input;
      const { id: userId } = ctx.user;

      const data = await db
        .select({
          ...getTableColumns(subscriptions),
          user: {
            ...getTableColumns(users),
            //Get the subscriber count for each creator by counting the number of subscriptions where the creatorId matches the user's id from the users table after joining the subscriptions table with the users table.
            subscriberCount: db.$count(
              subscriptions,
              eq(subscriptions.creatorId, users.id)
            ),
          },
        })
        .from(subscriptions)
        //Join the users table to get the creator's information for each subscription where the viewerId is the current logged in user.
        .innerJoin(users, eq(users.id, subscriptions.creatorId))
        .where(
          and(
            //Make sure that the viewerId is the current logged in user because we want to get the subscriptions of the current logged in user
            eq(subscriptions.viewerId, userId),
            cursor
              ? or(
                  lt(subscriptions.updatedAt, cursor.updatedAt),
                  and(
                    eq(subscriptions.updatedAt, cursor.updatedAt),
                    lt(subscriptions.creatorId, cursor.creatorId)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(subscriptions.updatedAt), desc(subscriptions.creatorId))
        .limit(limit + 1);
      const hasMore = data.length > limit;
      // Remove the last item of there's more data
      const items = hasMore ? data.slice(0, -1) : data;
      //Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore
        ? { creatorId: lastItem.creatorId, updatedAt: lastItem.updatedAt }
        : null;

      return {
        items,
        nextCursor,
      };
    }),
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
