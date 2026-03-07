//http://localhost:3001/api/videos/workflows/thumbnail
import { serve } from '@upstash/workflow/nextjs';
import { db } from '@/db';
import { videos } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { UTApi } from 'uploadthing/server';
import { pusherServer } from '@/lib/pusher';

interface InputType {
  userId: string;
  videoId: string;
  prompt: string;
}

export const { POST } = serve<InputType>(async (context) => {
  const utapi = new UTApi();
  const input = context.requestPayload;
  const { videoId, userId, prompt } = input;

  const video = await context.run('get-video', async () => {
    const [existingVideo] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)));

    if (!existingVideo) {
      throw new Error('Not found');
    }
    return existingVideo;
  });

  const { body } = await context.call<{ data: { url: string }[] }>(
    'generate-thumbnail',
    {
      url: 'https://api.openai.com/v1/images/generations',
      method: 'POST',
      body: {
        prompt,
        n: 1,
        model: 'dall-e-3',
        size: '1792x1024',
      },
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    }
  );
  const tempThumbnailUrl = body.data[0].url;
  if (!tempThumbnailUrl) throw new Error('Bad request');

  // Clean up the old thumbnail from the storage before upload
  await context.run('clean-up', async () => {
    if (video.thumbnailKey) {
      await utapi.deleteFiles(video.thumbnailKey);
      await db
        .update(videos)
        .set({
          thumbnailKey: null,
          thumbnailUrl: null,
        })
        .where(and(eq(videos.id, videoId), eq(videos.userId, userId)));
    }
  });

  // Upload Thumbnail to uploadThing
  const uploadedThumbnail = await context.run('upload-thumbnail', async () => {
    console.log('temp urlllll', tempThumbnailUrl);
    const { data } = await utapi.uploadFilesFromUrl(tempThumbnailUrl);
    console.log(data);
    if (!data) throw new Error('Bad request');
    return data;
  });

  //Update
  await context.run('update-video', async () => {
    await db
      .update(videos)
      .set({
        thumbnailKey: uploadedThumbnail.key,
        thumbnailUrl: uploadedThumbnail.url,
      })
      .where(and(eq(videos.id, video.id), eq(videos.userId, video.userId)));
  });

  //Inform the front-end to update the layout
  await context.run('trigger-pusher', async () => {
    await pusherServer.trigger(`video-${videoId}`, 'video-updated', {
      type: 'THUMBNAIL',
    });
  });
});
