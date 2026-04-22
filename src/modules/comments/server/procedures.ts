import { db } from '@/db';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from 'drizzle-orm';
import z, { uuid } from 'zod';
import {
  commentInsertSchema,
  commentReactions,
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
      commentInsertSchema
        .pick({
          parentId: true,
          videoId: true,
          value: true,
        })
        .extend({
          parentId: commentInsertSchema.shape.parentId.nullish(),
        })
    )
    .mutation(async ({ input, ctx }) => {
      const { parentId, videoId, value } = input; //video id always from the queryParam videoId
      const { id: userId } = ctx.user; // user who will create the comment "the current logged in"

      /*
      This kinda like "Edge case" if the user want to replay -> first we need to make sure that his parent still exist 
      which means that his parenId exist as a comment.id in the DB
      Because if the comment.id this got deleted it means that the new (reply) we cannot ad it in the air
      the role: (each replay should has a parentId as a comment.id)
      */
      const [existingComment] = await db
        .select()
        .from(comments)
        .where(inArray(comments.id, parentId ? [parentId] : []));

      if (!existingComment && parentId) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      /* Prevent Nested Replies (Level 2+): 
        Check if the user is attempting to reply (parentId exists) to a comment 
        that is already a reply (existingComment.parentId exists).
        This ensures we only allow one level of nesting (Parent -> Reply).
      */
      if (existingComment?.parentId && parentId) {
        throw new TRPCError({ code: 'BAD_REQUEST' });
      }
      const [createdComment] = await db
        .insert(comments)
        .values({ userId, parentId, videoId, value })
        .returning();

      return createdComment;
    }),
  getMany: baseProcedure
    .input(
      //this is a different way to use "pick" with "zod extend() method"
      commentSelectSchema.pick({ videoId: true, parentId: true }).extend({
        parentId: commentSelectSchema.shape.parentId.nullish(),
        cursor: z
          .object({
            id: commentSelectSchema.shape.id,
            updatedAt: z.coerce.date(),
          })
          .nullish(),
        limit: z.number().min(1).max(100).default(DEFAULT_LIMIT),
      })
    )
    .query(async ({ input, ctx }) => {
      const { clerkUserId } = ctx;
      const { parentId, videoId, cursor, limit } = input;

      let userId;
      const [user] = await db
        .select()
        .from(users)
        .where(inArray(users.clerkId, clerkUserId ? [clerkUserId] : []));

      if (user) userId = user.id;

      //CTE Common Table Expression to select all the current user comment reactions
      //To get his filter his reaction on the comment through the following ->
      //.leftJoin(viewerReactions, eq(viewerReactions.commentId, comments.id))
      const viewerReactions = db.$with('viewer_reactions').as(
        db
          .select({
            commentId: commentReactions.commentId,
            type: commentReactions.type,
          })
          .from(commentReactions)
          .where(inArray(commentReactions.userId, userId ? [userId] : []))
      );

      /* Define a CTE (Common Table Expression) to count replies for each parent comment.
        - groupBy(parentId): Groups all reply rows under their respective parent.
        - count(id): Counts the total number of reply IDs within each group.
        This allows us to efficiently join and display reply counts for top-level comments.
      */
      const replies = db.$with('replies').as(
        db
          .select({
            parentId: comments.parentId, // the replies under the original comment which has parentId == Null
            count: count(comments.id).as('count'), // if i got for example 2 comments has the same parentId it will be 2 comments
          })
          .from(comments)
          .where(isNotNull(comments.parentId))
          .groupBy(comments.parentId) //to help the count to count how many comment ids take the same parentId
      );
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
          .with(viewerReactions, replies)
          .select({
            ...getTableColumns(comments),
            user: users,
            viewerReactions: viewerReactions.type,
            // here we will select the comment.id that has replies carrying the comment.id as a parentId
            // So it will go through the rows to find the related replies to the current comment.id for each row
            replyCount: replies.count,
            likeCount: db.$count(
              commentReactions,
              and(
                eq(commentReactions.type, 'like'),
                eq(commentReactions.commentId, comments.id)
              )
            ),
            dislikeCount: db.$count(
              commentReactions,
              and(
                eq(commentReactions.type, 'dislike'),
                eq(commentReactions.commentId, comments.id)
              )
            ),
          })
          .from(comments)
          .where(
            and(
              eq(comments.videoId, videoId),

              // to load the replies check if we passed the parentId from the frontEnd
              // else get the main comments as usual
              parentId
                ? eq(comments.parentId, parentId)
                : isNull(comments.parentId),
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
          .leftJoin(viewerReactions, eq(viewerReactions.commentId, comments.id))
          // join the result of replies when it's parentId = current id
          // So we will get the (count) of how many comments shared the same parentId
          .leftJoin(replies, eq(replies.parentId, comments.id))
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
