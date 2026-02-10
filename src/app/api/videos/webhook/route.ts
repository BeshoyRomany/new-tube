import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import {
  VideoAssetCreatedWebhookEvent,
  VideoAssetDeletedWebhookEvent,
  VideoAssetReadyWebhookEvent,
  VideoAssetErroredWebhookEvent,
  VideoAssetTrackReadyWebhookEvent,
} from "@mux/mux-node/resources/webhooks";
import { mux } from "@/lib/mux";
import { db } from "@/db";
import { videos } from "@/db/schema";

type WebhookEvent =
  | VideoAssetCreatedWebhookEvent
  | VideoAssetDeletedWebhookEvent
  | VideoAssetReadyWebhookEvent
  | VideoAssetTrackReadyWebhookEvent
  | VideoAssetErroredWebhookEvent;

const SIGNING_SECRET = process.env.MUX_WEBHOOK_SECRET!;
export const POST = async (req: Request) => {
  if (!SIGNING_SECRET) throw new Error("MUX_WEBHOOK_SECRET is not set");
  //Get headers
  const headerPayload = await headers();
  const muxSignature = headerPayload.get("mux-signature");
  if (!muxSignature) return new Response("No signature found", { status: 401 });

  const payload = await req.json();
  const body = JSON.stringify(payload);

  mux.webhooks.verifySignature(
    body,
    { "mux-signature": muxSignature },
    SIGNING_SECRET,
  );

  switch (payload.type as WebhookEvent["type"]) {
    case "video.asset.created": {
      const data = payload.data as VideoAssetCreatedWebhookEvent["data"];
      if (!data.upload_id)
        return new Response("No upload ID found", { status: 400 });
      await db
        .update(videos)
        .set({
          muxAssetId: data.id,
          muxStatus: data.status,
        })
        .where(eq(videos.muxUploadId, data.upload_id));
      console.log("Video Created 📽️✅");
      break;
    }

    case "video.asset.ready": {
      const data = payload.data as VideoAssetReadyWebhookEvent["data"];
      const playbackId = data.playback_ids?.[0]?.id;
      if (!playbackId || !data.upload_id) {
        return new Response("Missing Required Data", { status: 400 });
      }
      const duration = data.duration ? Math.round(data.duration) : 0;
      const thumbnailUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=5&width=640`;
      const previewUrl = `https://image.mux.com/${playbackId}/animated.gif`;
      await db
        .update(videos)
        .set({
          muxStatus: data.status,
          muxPlaybackId: playbackId,
          muxAssetId: data.id,
          thumbnailUrl: thumbnailUrl,
          duration: duration,
          previewUrl: previewUrl,
        })
        .where(eq(videos.muxUploadId, data.upload_id));
      console.log("Video is ready 📽️✅");
      break;
    }
    case "video.asset.errored": {
      const data = payload.data as VideoAssetErroredWebhookEvent["data"];
      if (!data.upload_id) {
        return new Response("Missing Upload ID", { status: 400 });
      }

      await db
        .update(videos)
        .set({
          muxStatus: data.status,
        })
        .where(eq(videos.muxUploadId, data.upload_id));
      console.log("Something went wrong! ❌");
      break;
    }
    case "video.asset.deleted": {
      const data = payload.data as VideoAssetDeletedWebhookEvent["data"];
      if (!data.upload_id) {
        return new Response("Missing Upload ID", { status: 400 });
      }

      await db.delete(videos).where(eq(videos.muxUploadId, data.upload_id));
      console.log("Video Deleted 🗑️");
      break;
    }
    case "video.asset.track.ready": {
      interface AssetIdForTrack {
        asset_id: string;
      }
      const data = payload.data as VideoAssetTrackReadyWebhookEvent["data"] &
        AssetIdForTrack;
      // const data = payload.data as VideoAssetTrackReadyWebhookEvent["data"] & {
      //   asset_id: string;
      // };
      const assetId = data.asset_id;
      const trackId = data.id;
      const status = data.status;
      if (!assetId) {
        return new Response("Missing asset ID", { status: 400 });
      }
      await db
        .update(videos)
        .set({
          muxTrackId: trackId,
          muxTrackStatus: status,
        })
        .where(eq(videos.muxAssetId, assetId));
      console.log("Track is ready 🔊✅");
      break;
    }
  }
  return new Response("Webhook received", { status: 200 });
};
