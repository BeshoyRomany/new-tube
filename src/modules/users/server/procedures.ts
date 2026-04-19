import { db } from '@/db';
import { subscriptions, users, videos } from '@/db/schema';
import { baseProcedure, createTRPCRouter } from '@/trpc/init';
import { TRPCError } from '@trpc/server';
import { eq, getTableColumns, inArray, isNotNull } from 'drizzle-orm';
import z, { boolean } from 'zod';

export const usersRouter = createTRPCRouter({
  getOne: baseProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input, ctx }) => {
      //check if we have a user in our browser saved by Clerk SDK
      const { clerkUserId } = ctx;

      let userId;

      const [user] = await db
        .select()
        .from(users)
        .where(inArray(users.clerkId, clerkUserId ? [clerkUserId] : []));

      //Based on the clerkUserId if we have it in the browser -> and we found a user assigned it to the "let"
      if (user) {
        userId = user.id;
      }

      //Get the current user subscriptions (logged in user) viewer
      const viewerSubscriptions = db.$with('viewer_subscriptions').as(
        db
          .select()
          .from(subscriptions)
          .where(inArray(subscriptions.viewerId, userId ? [userId] : []))
      );

      const [existingUser] = await db
        .with(viewerSubscriptions)
        .select({
          ...getTableColumns(users),
          viewerSubscribed: isNotNull(viewerSubscriptions.viewerId).mapWith(
            Boolean
          ),
          //here comparing with user.id because maybe the userId -> it doesn't need to be the creator profile page
          videoCount: db.$count(videos, eq(videos.userId, users.id)),
          /*
            here i need to check how many records saved inside the subscription table as a creator for the current user
            because this will be the actual numbers of the subscribers .. based on how many times the user was creatorId
            in the subscription table
           */
          subscriberCount: db.$count(
            subscriptions,
            eq(subscriptions.creatorId, users.id)
          ),
        })
        .from(users)
        /*  
            Check if --> the current user came from the "rows iteration" is one of the creators in the "current logged in user"
            subscriptions list
            
            if the current user exist as a creator -> do the join and it will be one row because the creatorId is unique

            now we have the row if it's exist
            and we need to return a property with boolean true or false
            viewerSubscribed: isNotNull(viewerSubscriptions.viewerId).mapWith(boolean)

            and see if the current logged in user exist as a viewerId inside the row
            viewerId should be the same "current logged in user" because we have built the CTE based on it
        */
        .leftJoin(
          viewerSubscriptions,
          eq(viewerSubscriptions.creatorId, users.id)
        )
        .where(eq(users.id, input.id));

      if (!existingUser) throw new TRPCError({ code: 'NOT_FOUND' });
      return existingUser;
    }),
});
