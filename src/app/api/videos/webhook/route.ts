import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import {
  VideoAssetCreatedWebhookEvent,
  VideoAssetDeletedWebhookEvent,
  VideoAssetReadyWebhookEvent,
  VideoAssetErroredWebhookEvent,
  VideoAssetTrackReadyWebhookEvent,
} from '@mux/mux-node/resources/webhooks';
import { mux } from '@/lib/mux';
import { db } from '@/db';
import { videos } from '@/db/schema';
import { UTApi } from 'uploadthing/server';
import { pusherServer } from '@/lib/pusher'; // تأكد من المسار

type WebhookEvent =
  | VideoAssetCreatedWebhookEvent
  | VideoAssetDeletedWebhookEvent
  | VideoAssetReadyWebhookEvent
  | VideoAssetTrackReadyWebhookEvent
  | VideoAssetErroredWebhookEvent;

const SIGNING_SECRET = process.env.MUX_WEBHOOK_SECRET!;

export const POST = async (req: Request) => {
  if (!SIGNING_SECRET) throw new Error('MUX_WEBHOOK_SECRET is not set');

  const headerPayload = await headers();
  const muxSignature = headerPayload.get('mux-signature');
  if (!muxSignature) return new Response('No signature found', { status: 401 });

  const payload = await req.json();
  const body = JSON.stringify(payload);

  try {
    mux.webhooks.verifySignature(
      body,
      { 'mux-signature': muxSignature },
      SIGNING_SECRET
    );
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  const eventType = payload.type as WebhookEvent['type'];

  switch (eventType) {
    case 'video.asset.created': {
      const data = payload.data as VideoAssetCreatedWebhookEvent['data'];
      if (!data.upload_id)
        return new Response('No upload ID found', { status: 400 });

      const [updatedVideo] = await db
        .update(videos)
        .set({
          muxAssetId: data.id,
          muxStatus: data.status,
        })
        .where(eq(videos.muxUploadId, data.upload_id))
        .returning();

      if (updatedVideo) {
        await pusherServer.trigger(
          `video-${updatedVideo.id}`,
          'video-updated',
          { type: 'ASSET_CREATED' }
        );
      }
      break;
    }

    case 'video.asset.ready': {
      const data = payload.data as VideoAssetReadyWebhookEvent['data'];
      const playbackId = data.playback_ids?.[0]?.id;
      if (!playbackId || !data.upload_id)
        return new Response('Missing Required Data', { status: 400 });

      const tempThumbnailUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg`;
      const tempTPreviewUrl = `https://image.mux.com/${playbackId}/animated.gif`;
      const duration = data.duration ? Math.round(data.duration) : 0;

      const utapi = new UTApi();
      const [uploadedThumbnail, uploadedPreview] =
        await utapi.uploadFilesFromUrl([tempThumbnailUrl, tempTPreviewUrl]);

      if (!uploadedThumbnail.data || !uploadedPreview.data)
        return new Response('Failed to upload', { status: 500 });

      const { key: thumbnailKey, url: thumbnailUrl } = uploadedThumbnail.data;
      const { key: previewKey, url: previewUrl } = uploadedPreview.data;

      const [updatedVideo] = await db
        .update(videos)
        .set({
          muxStatus: data.status,
          muxPlaybackId: playbackId,
          muxAssetId: data.id,
          thumbnailUrl,
          thumbnailKey,
          previewUrl,
          previewKey,
          duration: duration,
        })
        .where(eq(videos.muxUploadId, data.upload_id))
        .returning();

      if (updatedVideo) {
        await pusherServer.trigger(
          `video-${updatedVideo.id}`,
          'video-updated',
          { type: 'ASSET_READY' }
        );
      }
      break;
    }

    case 'video.asset.errored': {
      const data = payload.data as VideoAssetErroredWebhookEvent['data'];
      if (!data.upload_id)
        return new Response('Missing Upload ID', { status: 400 });

      const [updatedVideo] = await db
        .update(videos)
        .set({ muxStatus: data.status })
        .where(eq(videos.muxUploadId, data.upload_id))
        .returning();

      if (updatedVideo) {
        await pusherServer.trigger(
          `video-${updatedVideo.id}`,
          'video-updated',
          { type: 'ASSET_ERRORED' }
        );
      }
      break;
    }

    case 'video.asset.track.ready': {
      interface AssetIdForTrack {
        asset_id: string;
      }
      const data = payload.data as VideoAssetTrackReadyWebhookEvent['data'] &
        AssetIdForTrack;
      const assetId = data.asset_id;

      const [updatedVideo] = await db
        .update(videos)
        .set({
          muxTrackId: data.id,
          muxTrackStatus: data.status,
        })
        .where(eq(videos.muxAssetId, assetId))
        .returning();

      if (updatedVideo) {
        await pusherServer.trigger(
          `video-${updatedVideo.id}`,
          'video-updated',
          { type: 'TRACK_READY' }
        );
      }
      break;
    }

    case 'video.asset.deleted': {
      const data = payload.data as VideoAssetDeletedWebhookEvent['data'];
      if (!data.upload_id)
        return new Response('Missing Upload ID', { status: 400 });
      await db.delete(videos).where(eq(videos.muxUploadId, data.upload_id));
      break;
    }
  }

  return new Response('Webhook received', { status: 200 });
};
