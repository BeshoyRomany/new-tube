import { and, eq, isNull } from 'drizzle-orm';
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
import { pusherServer } from '@/lib/pusher';

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

      // 1. Primary check (handles 99% of duplicate requests):
      // Read the DB first. If muxPlaybackId is ALREADY filled by a previous request,
      // exit immediately to prevent any unnecessary file uploads to UploadThing.
      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(eq(videos.muxUploadId, data.upload_id))
        .limit(1);

      if (!existingVideo || existingVideo.muxPlaybackId) {
        return new Response('Already processed or missing record', {
          status: 200,
        });
      }

      const duration = data.duration ? Math.round(data.duration) : 0;
      const tempThumbnailUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg`; //prepare mux url to upload on uploadThing
      const tempTPreviewUrl = `https://image.mux.com/${playbackId}/animated.gif`; //prepare mux url to upload on uploadThing

      // 2. Upload images to UploadThing (performed first to avoid keeping the DB connection open during long uploads).
      const utapi = new UTApi();
      const [uploadedThumbnail, uploadedPreview] =
        await utapi.uploadFilesFromUrl([tempThumbnailUrl, tempTPreviewUrl]);

      if (!uploadedThumbnail.data || !uploadedPreview.data)
        return new Response('Failed to upload', { status: 500 });

      const { key: thumbnailKey, url: thumbnailUrl } = uploadedThumbnail.data;
      const { key: previewKey, url: previewUrl } = uploadedPreview.data;

      // 3. Single Atomic Update:
      // Update the record ONLY IF muxPlaybackId is STILL NULL.
      // This guarantees that only ONE request wins and updates the database.
      // No request Edit before
      const [updatedVideo] = await db
        .update(videos)
        .set({
          muxStatus: data.status,
          muxPlaybackId: playbackId,
          muxAssetId: data.id,
          duration: duration,
          thumbnailUrl,
          thumbnailKey,
          previewUrl,
          previewKey,
        })
        .where(
          and(
            eq(videos.muxUploadId, data.upload_id),
            isNull(videos.muxPlaybackId)
          )
        )
        .returning();

      // 4. Fallback / Edge Case Handling (The 1% scenario):
      // If two requests bypassed Step 1 in the exact same millisecond, both uploaded files.
      // The losing request will get `updatedVideo = undefined` here because the winner already updated the DB.
      // In this rare edge case, we delete the duplicate files from UploadThing to keep storage clean.
      if (!updatedVideo) {
        await utapi.deleteFiles([thumbnailKey, previewKey]);
        return new Response('Duplicate request handled', { status: 200 });
      }

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
