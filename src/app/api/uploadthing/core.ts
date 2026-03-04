import { db } from '@/db';
import { users, videos } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError, UTApi } from 'uploadthing/server';
import z from 'zod';

const f = createUploadthing();
const utapi = new UTApi();
export const ourFileRouter = {
  thumbnailUploader: f({
    image: {
      maxFileSize: '4MB',
      maxFileCount: 1,
    },
  })
    .input(
      z.object({
        videoId: z.uuid(),
      })
    )
    .middleware(async ({ input }) => {
      const { userId: clerkUserId } = await auth();

      if (!clerkUserId) throw new UploadThingError('Unauthorized');
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkUserId));

      if (!user) throw new UploadThingError('Unauthorized');

      // Get the current thumbnail by key to REMOVE IT before upload new & clean the DB - to keep the storage empty
      const [existingVideo] = await db
        .select({
          thumbnailKey: videos.thumbnailKey,
        })
        .from(videos)
        .where(and(eq(videos.id, input.videoId), eq(videos.userId, user.id)));

      if (!existingVideo) throw new UploadThingError('Not found');

      if (existingVideo.thumbnailKey) {
        try {
          await utapi.deleteFiles(existingVideo.thumbnailKey);
        } catch (e) {
          console.error('Failed to delete old thumbnail', e);
        }
        await db
          .update(videos)
          .set({ thumbnailKey: null, thumbnailUrl: null })
          .where(and(eq(videos.id, input.videoId), eq(videos.userId, user.id)));
      }
      return { user, ...input };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db
        .update(videos)
        .set({
          thumbnailUrl: file.url,
          thumbnailKey: file.key,
        })
        .where(
          and(
            eq(videos.id, metadata.videoId),
            eq(videos.userId, metadata.user.id)
          )
        );
      return { uploadedBy: metadata.user.id };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
