# Hyper Copilot

Hyper Copilot is an all-in-one multi-modal generative AI platform and automated content publishing engine inspired by Adobe Firefly. It unifies text-to-image, text-to-video, text-to-audio, virtual AI influencer creation, autonomous video generation agents, and automated multi-platform social media distribution (YouTube, Instagram, Facebook, and Threads).

---

## Key Features

### 1. Multi-Modal Generative AI Studio

- **Text to Image**: High-resolution image synthesis with custom aspect ratios, styles, and prompt refinement, featuring an Adobe Firefly-inspired creative canvas and prompt interface.
- **Text to Video & Motion**: Generate dynamic cinematic video clips from natural language prompts, complete with motion templates, camera control, and aspect ratio configuration.
- **Text to Audio & Speech**: High-clarity multi-speaker voice synthesis with customizable voice personas, genders, pitch, and speech rates.
- **Virtual Model / AI Influencer Studio**: Create and manage persistent virtual model identities with reproducible seeds, customizable attributes, and consistent portrait/headshot generation.
- **Autonomous Video Agent**: End-to-end automated pipeline transforming concepts and scripts into polished video assets.

### 2. Social Automation & Multi-Platform Publishing

- **Targeted Platform Distribution**:
  - **YouTube & YouTube Shorts**: Native upload support with category selection (Entertainment default) and automated hashtag insertion adhering to the strict 100-character title limit.
  - **Meta (Instagram & Facebook Reels)**: Narrative-driven hooks, automatic lead caption extraction, and 4–5 targeted high-reach hashtags.
  - **Threads**: Conversational narrative hooks paired with exactly 1 official topic tag, formatted to fit Threads' 500-character constraint.
- **Dynamic Title & Copywriting Engine**: Story-aware copy generation that analyzes narrative scripts and generates distinct, platform-optimized titles and hashtags without generic templates.
- **Automated Workflows & Scheduling**: Recurring schedule triggers, time slots, queue management, and automated cron execution for scheduled publishing.
- **Connected Accounts & OAuth Hub**: Secure OAuth integrations for Meta (Facebook & Instagram), Threads, and YouTube with token lifecycle tracking.

### 3. Unified Asset Library & Job Runner

- **Central Creative Library**: Filterable repository of generated images, videos, audio clips, and model headshots with direct downloading, re-prompting, and publishing actions.
- **Asynchronous Job Execution**: Distributed job processing engine with lease locking, retry logic, and real-time generation progress updates.

---

## Architecture & Technology Stack

- **Frontend**: React 18, Vite, TanStack Router, Tailwind CSS, Lucide React, Radix UI.
- **Backend & Server**: Node.js / Express with Vite middleware, TanStack Start, and server-side workflow runners.
- **Database & Storage**: Supabase (PostgreSQL), Supabase Storage buckets for media assets, and Row Level Security (RLS).
- **Edge Functions**:
  - `generate-image`, `generate-video`, `generate-audio`
  - `video-agent`
  - `handle-job-execution`, `update-record-handler`
  - `process-scheduled-cron`
  - `publish-to-meta`, `youtube-publish`, `sync-meta-secrets`
- **AI Models & Gateways**: Google Gemini models via `@google/genai` and Lovable AI Gateway.

---

## Project Structure

```
├── src/
│   ├── components/         # Reusable UI components, modals, and Firefly-inspired controls
│   ├── hooks/              # Custom React hooks (auth, toast, workflows)
│   ├── integrations/       # Supabase client, database types, and auth wrappers
│   ├── lib/                # Media helpers, title generators, social publish pipelines
│   └── routes/             # TanStack file-based application routes and API endpoints
├── supabase/
│   ├── functions/          # Deno-based Edge Functions for media generation & publishing
│   └── migrations/         # Supabase PostgreSQL schema migrations
└── public/                 # Static brand assets, logos, and icons
```

---

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/07516060-64e1-4678-87b3-ddd8cb70f053).

- **Ship faster**: Describe what you want to build and Lovable handles the code.
- **Stay in sync**: Every change made in Lovable is committed straight to this repository.
- **Full ownership**: This code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

---

## Local Development

To run Hyper Copilot locally:

```sh
# 1. Clone the repository
git clone <this-repository-url>
cd <repository-name>

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

The application will be served locally on `http://localhost:3000`.
