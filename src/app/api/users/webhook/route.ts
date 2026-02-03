import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET!;

  if (!SIGNING_SECRET) {
    throw new Error(
      "Please add CLERK_WEBHOOK_SIGNING_SECRET from Clerk Dashboard to .env",
    );
  }

  //Create new Svix instance
  const wh = new Webhook(SIGNING_SECRET);

  //Get headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occurred -- no svix headers", { status: 400 });
  }

  //Get body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  let evt: WebhookEvent;

  //Verify payload with headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occurred", { status: 400 });
  }

  const eventType = evt.type;
  //User creation
  if (eventType === "user.created") {
    const { data } = evt;
    await db.insert(users).values({
      // add the clerk id (data.id) to our schema clerkId
      clerkId: data.id,
      name: `${data.first_name || ""} ${data.last_name || ""}`.trim() || "User",
      imageUrl: data.image_url,
    });
  }
  //User deletion
  if (eventType === "user.deleted") {
    const { data } = evt;
    if (!data.id) return new Response("Missing user id", { status: 400 });
    // Delete by using clerk id (data.id) if it's equal the schema clerkId that saved before when the user created
    await db.delete(users).where(eq(users.clerkId, data.id));
  }
  //User updating
  if (eventType === "user.updated") {
    const { data } = evt;
    await db
      .update(users)
      .set({
        name:
          `${data.first_name || ""} ${data.last_name || ""}`.trim() || "User",
        imageUrl: data.image_url,
      })
      .where(eq(users.clerkId, data.id));
  }
  return new Response("Webhook received", { status: 200 });
}
