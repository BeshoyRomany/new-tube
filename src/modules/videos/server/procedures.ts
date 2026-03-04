import { db } from '@/db';
import { videos, videoUpdateSchema } from '@/db/schema';
import { mux } from '@/lib/mux';
import { UploadThingError, UTApi } from 'uploadthing/server';
import { createTRPCRouter, protectedProcedure } from '@/trpc/init';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import z from 'zod';
import { workflow } from '@/lib/workflow';

const utapi = new UTApi();
export const videosRouter = createTRPCRouter({
  generateTitle: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const { workflowRunId } = await workflow.trigger({
        url: `${process.env.UPSTASH_WORKFLOW_URL}/api/videos/workflows/title`,
        body: { userId, videoId: input.id },
      });
      return workflowRunId;
    }),
  generateDescription: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const { workflowRunId } = await workflow.trigger({
        url: `${process.env.UPSTASH_WORKFLOW_URL}/api/videos/workflows/description`,
        body: { userId, videoId: input.id },
      });
      return workflowRunId;
    }),
  generateThumbnail: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const { workflowRunId } = await workflow.trigger({
        url: `${process.env.UPSTASH_WORKFLOW_URL}/api/videos/workflows/thumbnail`,
        body: { userId, videoId: input.id },
      });
      return workflowRunId;
    }),
  restoreThumbnail: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(and(eq(videos.id, input.id), eq(videos.userId, userId)));

      if (!existingVideo) throw new TRPCError({ code: 'NOT_FOUND' });

      // REMOVE the current Thumbnail & clean the DB before upload new - to keep the storage empty
      if (existingVideo.thumbnailKey) {
        try {
          await utapi.deleteFiles(existingVideo.thumbnailKey);
        } catch (e) {
          console.error('Failed to delete old thumbnail', e);
        }
        await db
          .update(videos)
          .set({ thumbnailKey: null, thumbnailUrl: null })
          .where(and(eq(videos.id, input.id), eq(videos.userId, userId)));
      }

      if (!existingVideo.muxPlaybackId)
        throw new TRPCError({ code: 'BAD_REQUEST' });

      const tempThumbnailUrl = `https://image.mux.com/${existingVideo.muxPlaybackId}/thumbnail.jpg`;
      // Upload a copy from mux images into UploadThing Storage
      const uploadedThumbnail =
        await utapi.uploadFilesFromUrl(tempThumbnailUrl);

      if (!uploadedThumbnail.data)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const { key: thumbnailKey, url: thumbnailUrl } = uploadedThumbnail.data;

      const [updatedVideo] = await db
        .update(videos)
        .set({ thumbnailUrl, thumbnailKey })
        .where(and(eq(videos.id, input.id), eq(videos.userId, userId)))
        .returning();

      return updatedVideo;
    }),
  remove: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      const { id: videoId } = input;

      const [removeVideo] = await db
        .delete(videos)
        .where(and(eq(videos.userId, userId), eq(videos.id, videoId)))
        .returning();

      if (!removeVideo) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return removeVideo;
    }),

  update: protectedProcedure
    .input(videoUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;
      if (!input.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing video ID',
        });
      }
      const [updatedVideo] = await db
        .update(videos)
        .set({
          title: input.title,
          description: input.description,
          categoryId: input.categoryId,
          visibility: input.visibility as 'private' | 'public',
          updatedAt: new Date(),
        })
        .where(and(eq(videos.id, input.id), eq(videos.userId, userId)))
        .returning();

      if (!updatedVideo) throw new TRPCError({ code: 'NOT_FOUND' });
      return updatedVideo;
    }),

  create: protectedProcedure.mutation(async ({ ctx }) => {
    const { id: userId } = ctx.user;
    const upload = await mux.video.uploads.create({
      new_asset_settings: {
        passthrough: userId,
        playback_policy: ['public'],
        video_quality: 'basic',
        input: [
          {
            generated_subtitles: [{ language_code: 'en', name: 'English' }],
          },
        ],
      },
      cors_origin: '*', //TODO: In production, set to your url
    });
    // throw new TRPCError({ code: "BAD_REQUEST" });
    const [video] = await db
      .insert(videos)
      .values({
        userId,
        title: 'Untitled',
        muxStatus: 'waiting',
        muxUploadId: upload.id,
      })
      .returning();
    return { video: video, url: upload.url };
  }),
});
