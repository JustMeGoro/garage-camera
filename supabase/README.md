# Server side (Supabase)

Everything the project needs on the server: the database, the private photo bucket, and three small edge functions.
The free Supabase tier is enough.

```
supabase/
  config.toml                  function settings (verify_jwt off, see below)
  bootstrap-first-invite.sql   creates the very first invite code
  migrations/                  database schema, in order
  functions/
    camera-upload/             what the camera phone talks to (photos, heartbeat, alerts, live video)
    camera-test-notify/        the "Send test notification" button
    push-key/                  hands out the public Web Push key
    _shared/push.ts            Web Push helpers shared by the functions
```

## What the server stores

| Thing | Purpose |
|---|---|
| `profiles` | Which login is a `viewer`. Only viewers can read anything |
| `invites` | One-time codes that give a new login the viewer role (valid 7 days) |
| `cameras` | One row per camera: a hash of its secret code, its settings, its status, and the live-video offer and answer |
| `events` | The photo list (when, which camera, which file) |
| `push_subscriptions` | Devices that turned notifications on |
| `push_config` | The server's Web Push signing keys. Readable by the edge functions only |
| Storage bucket `garage-photos` | The photos. Private, JPEG only, 2 MB per file |

Access is enforced with row-level security. A login without the viewer role reads nothing.
The camera has no login at all: it sends its secret code to `camera-upload`, which compares a hash and stores the photo.

## Set it up

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) and a free Supabase project.

1. **Create the project** at supabase.com and note its *project ref* (the part in its URL).
2. **Link and create the database:**
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Deploy the functions:**
   ```bash
   supabase functions deploy camera-upload camera-test-notify push-key
   ```
   `config.toml` turns off the platform's JWT check for these three, because they do their own checking.
4. **Create the first invite.** Paste `bootstrap-first-invite.sql` into the Supabase SQL editor and run it. It prints one code.
5. **Point the pages at your project.** In `demo/config.js` set `url` to your project URL and `key` to its publishable (anon) key. Both are public by design.
6. **Point the functions at your pages.** Replace `justmegoro.github.io/garage-camera` with your own GitHub Pages address in `VIEWER_URL` (in `camera-upload` and `camera-test-notify`) and in `SUBJECT` (in `_shared/push.ts`), then deploy again.
7. **Turn on GitHub Pages** for the repository and open `/demo/viewer.html`.
8. **Create your account** on the viewer page and enter the first invite code. After that, add a camera and invite family from the viewer itself.

In the Supabase dashboard, under Authentication, make sure email sign-ups are enabled. Turning off "Confirm email" makes sign-up instant, because the free built-in mail service only sends a few emails per hour.

## Things to know

- **Free projects pause after about a week without activity.** A running camera sends a heartbeat every 8 seconds, which keeps the project awake. If the project did pause, restore it from the dashboard.
- **The optional ntfy topic** (per camera, in the viewer) is an extra alert route. ntfy's free tier limits messages per day, so Web Push is the main route.
- **The migrations are the project's real history,** including steps that later replaced earlier ones (for example the camera code was first 24 characters, then 12). Apply them in order; do not edit old ones.
- **Photos use storage quota.** The free tier has 1 GB. The viewer has a "Delete all photos" button.
