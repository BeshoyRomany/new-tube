📺 NewTube - Full-Stack Video Streaming Platform
NewTube is a high-performance video-sharing platform built with the modern web stack. It replicates the core experience of YouTube, featuring seamless video processing, AI-powered subtitles, and a robust creator studio.

🚀 Tech Stack
Framework: Next.js 15 (App Router)

Styling: Tailwind CSS & Shadcn UI

Database: PostgreSQL with Drizzle ORM

Video Infrastructure: Mux (Encoding, Streaming, and Webhooks)

API Layer: tRPC (End-to-end typesafety)

Authentication: Clerk

Deployment: Vercel

✨ Key Features
✅ Seamless Video Uploads: Integrated with Mux for high-quality encoding and delivery.

✅ Real-time Status Tracking: Uses Webhooks to update video processing states (Preparing, Ready, Errored).

✅ AI-Generated Subtitles: Automatic caption generation in multiple languages (English & German) using Mux AI.

✅ Smart Hover Previews: Dynamic video/GIF previews on hover for better user engagement.

✅ Creator Studio: A dedicated dashboard for managing uploads, visibility, and metadata.

✅ Infinite Scrolling: Optimized data fetching for video feeds using tRPC infinite queries.

✅ Type-Safe Webhooks: Robust handling of Mux events with custom TypeScript intersection types.

🛠️ Getting Started
1. Prerequisites
Ensure you have Node.js 20+ and a PostgreSQL instance running.

2. Environment Variables
Create a .env.local file in the root directory and add the following:

Code snippet
# Database
DATABASE_URL=your_postgresql_url

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Mux Video
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
MUX_WEBHOOK_SECRET=
3. Installation & Setup
Bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start the development server
npm run dev
Open http://localhost:3000 to see your app in action.

🏗️ Project Architecture
Plaintext
src/
├── app/            # Next.js App Router (Routes & API)
├── components/     # Reusable UI components
├── db/             # Database schema and Drizzle client
├── lib/            # External service clients (Mux, etc.)
├── modules/        # Feature-based modules (Videos, Studio, Auth)
│   └── ui/         # Module-specific components
└── trpc/           # tRPC procedures and routers
📝 License
This project is licensed under the MIT License.

📫 Contact
If you have any questions or suggestions, feel free to open an issue or reach out!
