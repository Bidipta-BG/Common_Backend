# StartTambola — Backend API

Multi-tenant Tambola (Housie/Bingo) SaaS backend.  
Built with **Node.js + Express + Supabase + Razorpay**.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Fill in all values in .env (see Environment Variables below)

# 3. Run in development (auto-restart on changes)
npm run dev

# 4. Run in production
npm start
```

The server listens on `http://localhost:PORT` (default 3000).  
All Tambola API routes are under `/api/starttambola/`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default: 3000) | TCP port the server listens on |
| `TAMBO_SUPABASE_URL` | **Yes** | Supabase project URL (Settings → API) |
| `TAMBO_SUPABASE_SERVICE_KEY` | **Yes** | Service role key — bypasses RLS. **Never expose to browsers.** |
| `TAMBO_SUPABASE_ANON_KEY` | **Yes** | Public anon key — exported for completeness, not used by most server queries |
| `RAZORPAY_KEY_ID` | **Yes** | Razorpay API key ID — returned to frontend to initialise checkout.js |
| `RAZORPAY_KEY_SECRET` | **Yes** | Razorpay API key secret — used server-side for order creation |
| `RAZORPAY_WEBHOOK_SECRET` | **Yes** | Razorpay webhook signing secret — used to verify HMAC-SHA256 on incoming events |
| `SUPER_ADMIN_API_KEY` | **Yes** | Shared secret for `/internal/*` routes — only your team/CI should know this |

---

## Architecture

```
src/
  app.js                   ← Entry point: env validation, Express setup, boot sequence
  apps/
    starttambola/
      index.js             ← Sub-app router + scheduler bootstrap
      config/              ← Supabase clients, Razorpay SDK
      middleware/          ← Auth (requireAuth, requireRole, requireTenantMatch),
      │                      superAdmin (requireSuperAdminKey), errorHandler,
      │                      verifyRazorpay (HMAC webhook guard)
      services/            ← Business logic + DB queries (one file per resource)
      controllers/         ← Request handlers (thin — delegate to services)
      routes/              ← Express routers (one file per resource)
      jobs/                ← Scheduler (setInterval), subscription expiry,
      │                      booking request expiry, resume running games
      realtime/            ← Supabase Realtime HTTP broadcast helper
      utils/               ← AppError, validateBody (Zod), supabaseError,
                             dividendTypes, ticketGenerator, patternMatcher, plans
```

### Key design principles

- **Service role everywhere** — the backend acts as the trusted super-admin layer. All queries use `supabaseAdmin` (service role). RLS is enforced in application code via `requireTenantMatch`.
- **No per-game setInterval** — a single central 500ms tick loop drives all running games from an in-memory Map. Restart-resilient via `resumeRunningGames()` on boot.
- **Anon client never used for writes** — `supabaseAnon` is exported but not called anywhere in this backend. It exists in case a future route needs to respect RLS.

---

## Full Route Reference

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | Root health check (Express app) |
| GET | `/api/starttambola/health` | Public | Tambola sub-app health check |

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/starttambola/auth/me` | Bearer JWT | Returns the decoded token's userId, tenantId, role |

### Tenants (public)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/starttambola/tenants/by-domain/:domain` | Public | Look up a tenant by custom domain (used by Next.js middleware) |
| GET | `/api/starttambola/tenants/:tenantId` | Public | Full tenant details: branding, theme, whatsapp_number |
| GET | `/api/starttambola/tenants/:tenantId/games/current` | Public | Most relevant game: running → next scheduled → last completed |

### Tenants (internal — requires `X-Internal-Key`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/starttambola/internal/tenants` | X-Internal-Key | Create tenant + subscription + owner Supabase Auth user |
| POST | `/api/starttambola/internal/tenants/:id/activate` | X-Internal-Key | Activate tenant, set subscription dates via Postgres RPC |
| POST | `/api/starttambola/internal/tenants/:id/renew` | X-Internal-Key | Renew subscription, extend expiry |
| GET | `/api/starttambola/internal/tenants/:id/subscription-status` | X-Internal-Key | Check tenant subscription status |

### Subscriptions (internal)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/starttambola/tenants/:tenantId/subscription-status` | JWT (tenant_admin) | Subscription countdown: status, plan, expiryDate, daysRemaining, hoursRemaining |

### Webhooks

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/starttambola/webhooks/razorpay` | HMAC signature | Razorpay payment events — records payment row, never auto-activates |

### Checkout

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/starttambola/tenants/:tenantId/checkout-session` | JWT (tenant_admin) | Creates a Razorpay order for a subscription plan |

### Games

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/starttambola/tenants/:tenantId/games` | JWT (tenant_admin) | Create game + bulk-generate Tambola tickets |
| PATCH | `/api/starttambola/tenants/:tenantId/games/:gameId` | JWT (tenant_admin) | Update game fields; handles ticket count increase/decrease |
| GET | `/api/starttambola/tenants/:tenantId/games/:gameId` | JWT (tenant_admin) | Get game with dividends and ticket count summary |
| POST | `/api/starttambola/tenants/:tenantId/games/:gameId/reset-tickets` | JWT (tenant_admin) | Reset all tickets to available, delete pending booking requests |
| POST | `/api/starttambola/tenants/:tenantId/games/:gameId/reset-game` | JWT (tenant_admin) | Delete called_numbers + winners, reset game to scheduled |
| PUT | `/api/starttambola/tenants/:tenantId/games/:gameId/dividends` | JWT (tenant_admin) | Replace full dividend set for a game |

### Game Engine

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/starttambola/tenants/:tenantId/games/:gameId/run` | JWT (tenant_admin) | Start game — validates status + scheduled_at, begins server-side tick loop |
| POST | `/api/starttambola/tenants/:tenantId/games/:gameId/stop` | JWT (tenant_admin) | Manual stop — halts tick loop, marks game completed |
| GET | `/api/starttambola/tenants/:tenantId/games/:gameId/state` | Public | Live catch-up snapshot: status, calledNumbers, winners |

### Tickets

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/starttambola/tenants/:tenantId/games/:gameId/tickets` | Public | List all tickets (id, ticket_number, status, grid — no PII) |
| POST | `/api/starttambola/tenants/:tenantId/games/:gameId/tickets/book-bulk` | JWT (agent) | All-or-nothing multi-ticket booking for an agent |
| POST | `/api/starttambola/tenants/:tenantId/games/:gameId/tickets/:ticketId/book-request` | Public | Player self-service: reserves ticket + creates pending booking_request |
| POST | `/api/starttambola/tenants/:tenantId/games/:gameId/tickets/:ticketId/book-direct` | JWT (tenant_admin \| agent) | Admin/agent books directly on behalf of a player (auto-approved) |

### Booking Requests

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/starttambola/tenants/:tenantId/booking-requests` | JWT (tenant_admin) | List booking requests, filterable by `?status=` |
| POST | `/api/starttambola/tenants/:tenantId/booking-requests/:requestId/approve` | JWT (tenant_admin) | Approve: book ticket, copy player info, mark request approved |
| POST | `/api/starttambola/tenants/:tenantId/booking-requests/:requestId/reject` | JWT (tenant_admin) | Reject: release ticket back to available, mark request rejected |

### Agents

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/starttambola/tenants/:tenantId/agents/me/performance` | JWT (agent) | Agent's own performance from `agent_performance_self` view |
| POST | `/api/starttambola/tenants/:tenantId/agents` | JWT (tenant_admin) | Create agent: Supabase Auth phone user + agents row |
| GET | `/api/starttambola/tenants/:tenantId/agents` | JWT (tenant_admin) | List agents with performance data from `agent_performance_admin` view |
| PATCH | `/api/starttambola/tenants/:tenantId/agents/:agentId` | JWT (tenant_admin) | Update agent; disabling bans Supabase Auth user |

### Themes & Poster Templates

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/starttambola/themes` | Public | All active themes from shared library |
| PATCH | `/api/starttambola/tenants/:tenantId/theme` | JWT (tenant_admin) | Select a theme + set overrides for the tenant |
| GET | `/api/starttambola/poster-templates` | Public | All active poster templates (metadata only — rendering is client-side) |

### Internal Jobs (requires `X-Internal-Key`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/starttambola/internal/jobs/run-subscription-check` | X-Internal-Key | Manually trigger the subscription expiry sweep |
| POST | `/api/starttambola/internal/jobs/run-booking-expiry` | X-Internal-Key | Manually trigger the booking request expiry sweep |

---

## Background Jobs

| Job | Interval | What it does |
|---|---|---|
| Subscription expiry sweep | Every 15 minutes | Suspends tenants whose subscription has expired (skips if a game is running) |
| Booking request expiry | Every 5 minutes | Expires pending booking requests older than 15 minutes, releases reserved tickets |
| Game tick loop | 500ms poll | Drives all running games: calls numbers, checks dividends, broadcasts via Realtime |
| `resumeRunningGames` | Once at boot | Re-registers any `status='running'` games into the tick loop after a restart |

---

## Realtime (Supabase)

The backend broadcasts to these channels via HTTP POST to `/realtime/v1/api/broadcast`:

| Channel | Events |
|---|---|
| `game:<gameId>` | `game_started`, `number_called`, `winner`, `game_completed` |
| `tenant:<tenantId>` | `game_state_changed` |

**Client subscription example (Supabase JS v2):**
```javascript
const channel = supabase.channel(`game:${gameId}`);
channel
  .on('broadcast', { event: 'number_called' }, ({ payload }) => {
    console.log('Number called:', payload.number, 'Sequence:', payload.sequence);
  })
  .on('broadcast', { event: 'winner' }, ({ payload }) => {
    console.log('Winner!', payload);
  })
  .subscribe();
```

---

## Dividend Pattern Types

| `pattern_type` | Description |
|---|---|
| `top_line` | All 5 numbers in the top row called |
| `middle_line` | All 5 numbers in the middle row called |
| `bottom_line` | All 5 numbers in the bottom row called |
| `full_house_1` | All 15 numbers on the ticket called (1st to achieve) |
| `full_house_2` | All 15 numbers on the ticket called (2nd to achieve) |
| `full_house_3` | All 15 numbers on the ticket called (3rd to achieve) |
| `quick_five` | First ticket to have any 5 of its numbers called |
| `corners` | First + last filled cells of top row and bottom row (4 numbers) |
| `half_seat_bonus` | Any 8 of the ticket's 15 numbers called ⚠️ *confirm definition with product owner* |

---

## Security Notes

- All tenant-scoped routes apply `requireAuth → requireRole → requireTenantMatch` — the token's `tenant_id` claim must match the `:tenantId` URL param.
- Internal routes are behind `requireSuperAdminKey` (header `X-Internal-Key`).
- Razorpay webhook uses HMAC-SHA256 signature verification over the raw request body.
- The service role key never leaves the server. The anon key is exported but unused in this backend.
- Agent disabling uses Supabase Auth `ban_duration: '876600h'` (100 years) — effectively permanent until manually lifted.
