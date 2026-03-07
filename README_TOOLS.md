# 🛠️ NewTube Development Tools Manual

This file contains all the necessary commands to manage the database and the secure tunnel (ngrok) during the development process.

---

## 🌐 1. ngrok (Webhook Tunneling)

Used to connect external services (like Clerk) to your local machine (Localhost).

| Command                                                                       | Function                                                                |
| :---------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| `./ngrok config add-authtoken <TOKEN>`                                        | **Auth Setup:** Run once to authenticate your ngrok account             |
| `./ngrok http 3000` == https://gaspingly-imaginative-scarlette.ngrok-free.dev | **Start Tunnel:** Forwards external traffic to port 3000 (Next.js port) |
| [http://localhost:4040](http://localhost:4040)                                | **Web Interface:** Monitor incoming Webhook requests in real-time       |

---

## 🐘 2. Neon & Drizzle (Database)

Managing the database schema and data using Drizzle ORM.

| Command                     | Function                                                               |
| :-------------------------- | :--------------------------------------------------------------------- |
| `bunx drizzle-kit push`     | **Schema Push:** Sync changes in `schema.ts` directly to Neon DB       |
| `bunx drizzle-kit studio`   | **Drizzle Studio:** Open a GUI in the browser to view/edit your data   |
| `bunx drizzle-kit generate` | **Generate Migration:** Create SQL migration files for version control |

---

## 🚀 3. Shortcuts (package.json)

For faster workflow, add these commands to your `package.json` under the `"scripts"` section:

```json
"scripts": {
  "dev": "next dev",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio",
  "tunnel": "./ngrok http 3000"
}
```

## yml file

C:\Users\beshoy.romany\AppData\Local/ngrok/ngrok.yml

## Notes

(1)-Pusher notification & websockets (done)
-Studio Module -> invalidate video status ready (webhook)
-Studio Module -> invalidate generate title & generate description and generate thumbnail (workflows)
|----------------------------------------------------------------------------|

# Dates & Deadlines

Start part 2 on Saturday 7/3/2026
