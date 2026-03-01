# FioTec Project Guidelines

> See .github/copilot-instructions.md for AI Team Agent roles and full operational protocols.

## General Rules

* Mobile-first responsive design: base, sm, md, lg, xl breakpoints
* Use flexbox/grid layouts, avoid absolute positioning
* Keep files focused and small, extract helpers into separate files
* Use 2-space indentation, single quotes, Tailwind class ordering
* Run npm run build after every change

## Protected Files

* supabase/functions/server/kv_store.tsx
* src/app/components/figma/ImageWithFallback.tsx
* utils/supabase/info.tsx

## Design System

* UI Library: shadcn/ui components in src/app/components/ui/
* Icons: lucide-react
* Animation: motion library, import from "motion/react"
* Toast: sonner, use toast.success() and toast.error()
* CSS: Tailwind CSS v4, config in CSS files, no tailwind.config.js
* Theme: CSS custom properties in src/styles/theme.css, dark mode supported

## Responsive Patterns

* Icon containers: always add shrink-0
* Page padding: p-4 sm:p-6
* Grids: grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
* Flex rows: always include flex-wrap
* Long text: min-w-0 on flex children plus truncate
* Tab/filter bars: overflow-x-auto

## Component Patterns

* Cards: Card from shadcn/ui
* Dialogs: Dialog from shadcn/ui, controlled via open prop
* Tables: Table from shadcn/ui with responsive wrapper
* Forms: react-hook-form plus zod for validation
* Routing: react-router v7, use useNavigate and Link

## Backend Rules

* Auth: requireAuth(c) pattern, check instanceof Response
* KV store: Use cachedKvGet and cachedKvSet only
* API calls: Always through api methods in src/app/utils/api.ts
* Headers: Authorization Bearer anon_key plus x-user-token user_jwt

## Deployment Checklist

1. npm run build must pass
2. Frontend: npx vercel --prod
3. Backend: copy server files to make-server-4916a0b9, then deploy via supabase CLI
4. Update AI_TEAM_HANDOFF.md with new phase
