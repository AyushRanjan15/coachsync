# CoachSync MVP — Implementation Plan

## Objective

A simple platform where an **athlete** records and uploads training videos
from their iPhone, and a **coach** reviews them and leaves comments per video.

## Scale & constraints

- ~2 users to start (1 athlete + 1 coach), headroom for ~10 total
- 10 videos/week, ~2.5 min each (~150 MB HEVC from iPhone)
- AWS, IaC via **CDK (Python)**
- Backend Lambda in **Python**
- Frontend must run on iPhone day 1 with no App Store
- Monolith is acceptable for MVP

---

## Architecture overview

```
┌────────────────────┐                 ┌────────────────────┐
│  iPhone (Expo Go)  │                 │  iPhone (Expo Go)  │
│      athlete       │                 │       coach        │
└─────────┬──────────┘                 └─────────┬──────────┘
          │ HTTPS                                │ HTTPS
          │ (JWT in Authorization header)        │
          ▼                                      ▼
       ┌─────────────────────────────────────────────┐
       │            API Gateway (HTTP API)           │
       │     JWT authorizer → Cognito User Pool      │
       └────────────────────┬────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   Lambda (Python)     │
                │   monolith handler    │
                │   routes /videos/*    │
                │          /comments/*  │
                └─────┬──────────┬──────┘
                      │          │
                      ▼          ▼
            ┌──────────────┐  ┌──────────────────┐
            │  DynamoDB    │  │       S3         │
            │  Videos      │  │   videos bucket  │◄─── direct
            │  Comments    │  │   (presigned     │      upload
            └──────────────┘  │    PUT URLs)     │      from app
                              └────────┬─────────┘
                                       │ event notification
                                       ▼
                              ┌──────────────────┐
                              │  Lambda          │
                              │  (mark uploaded) │
                              └──────────────────┘

                              ┌──────────────────┐
                              │   CloudFront     │◄─── playback
                              │ (signed URLs)    │      from app
                              └────────┬─────────┘
                                       │ origin
                                       ▼
                              videos S3 bucket
```

---

## AWS infrastructure (CDK Python)

All constructs live in `cdk/coachsync_infra/coachsync_infra_stack.py`.
We may split into multiple files (`auth.py`, `storage.py`, `api.py`) once it
grows past ~300 lines, but starting flat is fine.

### Constructs

| Logical ID                | Construct                          | Purpose                                                              |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `UserPool`                | `cognito.UserPool`                 | Email/password auth, self-signup off (admin-creates users for MVP)   |
| `UserPoolClient`          | `cognito.UserPoolClient`           | Public client for the Expo app, no client secret                     |
| `AthleteGroup`            | `cognito.CfnUserPoolGroup`         | Cognito group `athletes`                                             |
| `CoachGroup`              | `cognito.CfnUserPoolGroup`         | Cognito group `coaches`                                              |
| `VideosBucket`            | `s3.Bucket`                        | Private, versioned, CORS for app origin, lifecycle to Glacier IT 90d |
| `VideosTable`             | `dynamodb.Table`                   | PK `userId`, SK `videoId`; GSI `byDate` on `uploadedAt`              |
| `CommentsTable`           | `dynamodb.Table`                   | PK `videoId`, SK `commentId`                                         |
| `ApiFunction`             | `lambda.Function` (Python 3.12)    | Monolith handler for all `/videos/*` and `/comments/*` routes        |
| `UploadCompleteFunction`  | `lambda.Function` (Python 3.12)    | Triggered by S3 `ObjectCreated`; flips `uploaded=true` in DynamoDB   |
| `HttpApi`                 | `apigatewayv2.HttpApi`             | Public HTTP API with CORS                                            |
| `JwtAuthorizer`           | `apigatewayv2_authorizers.HttpJwtAuthorizer` | Validates Cognito JWTs                                     |
| `CloudFrontDistribution`  | `cloudfront.Distribution`          | OAC to `VideosBucket`, signed URLs for playback                      |
| `SignerKeyPair`           | `cloudfront.PublicKey` + `KeyGroup`| For signing playback URLs in Lambda                                  |

### Stack outputs (`CfnOutput`)

- `UserPoolId`
- `UserPoolClientId`
- `Region`
- `ApiBaseUrl`
- `CloudFrontDomain`
- `VideosBucketName`

These are read by the Expo app via a config script that generates a
`frontend/lib/config.ts` from `cdk synth` outputs.

### CORS

- `VideosBucket`: `PUT` from the app's origin (Expo Go uses
  `exp://` schemes in dev — for S3 we allow `*` origin on `PUT` since the
  presigned URL is the security boundary).
- `HttpApi`: allow the Expo dev URL and any prod domain.

---

## Backend (Python Lambda monolith)

Single Lambda function, routed internally based on
`event["routeKey"]` from API Gateway HTTP API. No web framework — for ~10
routes a plain dispatch dict is simpler than FastAPI/Mangum.

### Project layout

```
backend/
  api/
    handler.py        ← Lambda entrypoint, route dispatch
    auth.py           ← JWT claim extraction, role checks
    videos.py         ← video endpoint handlers
    comments.py       ← comment endpoint handlers
    storage.py        ← S3 presign + CloudFront signing helpers
    db.py             ← DynamoDB access (boto3 Resource)
  upload_complete/
    handler.py        ← S3 event → mark video uploaded
  requirements.txt    ← boto3 is built-in; cryptography for CF signing
```

The Lambda code is packaged with `aws_cdk.aws_lambda_python_alpha.PythonFunction`
which bundles dependencies via Docker. Alternative: plain `Code.from_asset`
with a manual `pip install -t .` if we want to avoid Docker.

### API surface

All routes require a valid Cognito JWT. Role checks happen in `auth.py`.

| Method | Path                                    | Who    | Purpose                                                |
| ------ | --------------------------------------- | ------ | ------------------------------------------------------ |
| POST   | `/videos`                               | athlete| Create video record, return presigned PUT URL          |
| GET    | `/videos`                               | both   | List videos (own if athlete, all if coach)             |
| GET    | `/videos/{id}`                          | both   | Get one video + signed playback URL                    |
| PATCH  | `/videos/{id}`                          | athlete| Update exercise/notes (own only)                       |
| DELETE | `/videos/{id}`                          | athlete| Delete (own only); also deletes S3 object + comments   |
| GET    | `/videos/{id}/comments`                 | both   | List comments for a video                              |
| POST   | `/videos/{id}/comments`                 | coach  | Add a comment                                          |
| DELETE | `/videos/{id}/comments/{commentId}`     | coach  | Delete own comment                                     |
| GET    | `/me`                                   | both   | Return role + display name from JWT claims             |

### Response shapes

```jsonc
// POST /videos response
{
  "videoId": "v_01HX...",
  "uploadUrl": "https://...s3...?X-Amz-Signature=...",
  "uploadFields": {},   // for POST policy if we switch to multipart later
  "expiresIn": 900
}

// GET /videos response
{
  "items": [
    {
      "videoId": "v_01HX...",
      "userId": "u_abc",
      "exercise": "squat",
      "notes": "felt heavy",
      "sessionDate": "2026-05-23",
      "uploadedAt": "2026-05-23T18:42:11Z",
      "uploaded": true,
      "durationSec": 142,
      "thumbnailUrl": null,        // future
      "playbackUrl": "https://d...cloudfront.net/...?Signature=...",
      "commentCount": 2
    }
  ],
  "nextCursor": null
}
```

---

## Data model (DynamoDB)

Single-table design is overkill for this scope. Two tables:

### `Videos`

| Attribute     | Type   | Notes                                              |
| ------------- | ------ | -------------------------------------------------- |
| `userId`      | S (PK) | Cognito `sub` of the owning athlete                |
| `videoId`     | S (SK) | ULID, generated server-side                        |
| `exercise`    | S      | e.g. "squat"                                       |
| `notes`       | S      | optional, default ""                               |
| `sessionDate` | S      | ISO date, default = today                          |
| `uploadedAt`  | S      | ISO timestamp, set on row create                   |
| `uploaded`    | BOOL   | flipped true by `UploadCompleteFunction`           |
| `durationSec` | N      | set by `UploadCompleteFunction` via S3 metadata    |
| `s3Key`       | S      | `videos/{userId}/{videoId}.mov`                    |
| `contentType` | S      | usually `video/quicktime` or `video/mp4`           |

**GSI `byDate`**: PK = static `"all"`, SK = `uploadedAt`. Used by coach view
to list all videos chronologically. The static PK is a known anti-pattern at
scale but at <100 videos/year it's fine and trivial.

### `Comments`

| Attribute   | Type   | Notes                                            |
| ----------- | ------ | ------------------------------------------------ |
| `videoId`   | S (PK) | links to Videos                                  |
| `commentId` | S (SK) | ULID — naturally sortable by creation time       |
| `coachId`   | S      | Cognito `sub`                                    |
| `text`      | S      | comment body                                     |
| `createdAt` | S      | ISO timestamp                                    |

Both tables: **on-demand billing**, point-in-time recovery on.

---

## Auth model

- Cognito User Pool, email as username, password policy = AWS default
- **Admin-creates-user mode** for MVP (`self_sign_up_enabled=False`).
  We add ourselves and the coach via the AWS console or CDK on first deploy.
- Two Cognito groups: `athletes`, `coaches`. Group membership lands in the
  JWT as `cognito:groups`.
- API Gateway HTTP API uses the built-in JWT authorizer pointed at the
  Cognito User Pool issuer + client ID. Invalid/missing tokens → 401.
- In Lambda, `event["requestContext"]["authorizer"]["jwt"]["claims"]` gives
  us `sub`, `email`, `cognito:groups`. `auth.py` exposes
  `current_user(event) -> User` and `require_role(user, "coach")`.

### Authorization rules

- Athletes can only see/edit/delete their own videos (filter on `userId == sub`).
- Coaches can see all videos. They can only delete their own comments.
- No coach-athlete mapping in MVP — every coach sees every athlete. Add a
  `CoachAthletes` table later if we need multi-tenant separation.

---

## Frontend (Expo / React Native)

### Stack

- **Expo SDK (latest)** with TypeScript
- **Expo Router** — file-based routing
- **expo-camera** — record (built-in video recording)
- **expo-video** — playback
- **expo-file-system** — `uploadAsync` for upload with progress events
- **aws-amplify** (just the auth slice) — Cognito sign-in / token refresh
- **@tanstack/react-query** — server-state caching (optional; defer if shaving scope)
- **No global state lib** — Context + useState is enough

### Project layout

```
frontend/
  app/
    _layout.tsx              ← root, auth gate
    sign-in.tsx
    (athlete)/
      _layout.tsx            ← tab nav (Library / Record / Settings)
      index.tsx              ← video library
      record.tsx             ← camera + metadata form
      video/[id].tsx         ← player + own metadata + coach comments
    (coach)/
      _layout.tsx            ← tab nav (Feed / Settings)
      index.tsx              ← all videos, sorted by date
      video/[id].tsx         ← player + athlete notes + add comment
  components/
    VideoPlayer.tsx
    VideoCard.tsx
    UploadProgress.tsx
  lib/
    config.ts                ← generated from CDK outputs
    auth.ts                  ← Amplify Auth wrapper
    api.ts                   ← fetch wrapper, adds JWT, parses errors
  app.json
  package.json
```

### Screens (MVP set — 7 screens total)

1. **Sign in** — email + password, error states
2. **Athlete library** — chronological list, pull-to-refresh, FAB to record
3. **Record** — camera preview, record button, metadata form (exercise, notes, date), upload progress
4. **Athlete video detail** — player, editable metadata, list of coach comments
5. **Coach feed** — all videos, grouped by athlete name then date
6. **Coach video detail** — player, read-only metadata + notes, add-comment input
7. **Settings** — display name, sign out

### Delivery on iPhone

Dev: `npx expo start` → scan QR with iPhone Camera → opens in Expo Go.
Sharing: send the Expo URL (or `npx expo publish` for a stable link).
TestFlight / App Store deferred until past MVP.

---

## Key flows

### Upload

1. Athlete taps **Record**, captures a clip with `expo-camera` (HEVC MP4)
2. Fills exercise + notes, taps **Upload**
3. App `POST /videos` with metadata → backend creates DynamoDB row
   (`uploaded=false`), generates presigned PUT URL for
   `s3://videos-bucket/videos/{userId}/{videoId}.mov`, returns it
4. App uses `FileSystem.uploadAsync(uploadUrl, fileUri, { httpMethod: 'PUT', uploadType: BINARY_CONTENT })`
   with `onProgress` callback driving a progress bar
5. On 200, S3 fires `ObjectCreated` event → `UploadCompleteFunction` reads
   the object's size and (eventually) duration via `ffprobe`, updates
   DynamoDB `uploaded=true`, `durationSec=...`
6. App polls `GET /videos/{id}` once to confirm `uploaded=true`, then shows
   success toast

### Playback

1. App calls `GET /videos/{id}`
2. Backend constructs a CloudFront signed URL valid for 1 hour (using the
   `SignerKeyPair` private key from Secrets Manager) and returns it
3. App passes URL to `expo-video`'s `VideoView`

### Comment

1. Coach opens video detail screen
2. Types comment, taps Send
3. `POST /videos/{id}/comments` → row in `Comments` table
4. Athlete sees it next time they open the video detail (or on pull-to-refresh)

No realtime/push notifications in MVP. Athlete sees new comments on app
open or manual refresh.

---

## Implementation phases

Each phase is independently deployable and demoable.

### Phase 0 — Foundations (no app code yet)
- Commit existing CDK scaffold
- Add CDK constructs: `UserPool`, `UserPoolClient`, groups, `VideosBucket`,
  both DynamoDB tables, `HttpApi`, no Lambdas yet (hello-world handler)
- `cdk deploy` against personal account, write Cognito IDs / API URL to a
  `frontend/lib/config.ts` template
- Manually create your user (athlete group) and coach user via console

### Phase 1 — Auth + empty app shell
- Bootstrap Expo app
- Sign-in screen wired to Cognito via `aws-amplify/auth`
- Role-based redirect (athlete tabs vs coach tabs)
- `GET /me` endpoint returning JWT claims, displayed on Settings screen
- Demo: log in as athlete, see athlete shell; log in as coach, see coach shell

### Phase 2 — Video upload (athlete)
- Record screen with `expo-camera`
- Metadata form
- `POST /videos` Lambda handler + presigned URL generation
- `UploadCompleteFunction` for S3 event
- Upload progress UI
- Demo: record a clip, upload, see it appear in S3 console

### Phase 3 — Video library (athlete)
- `GET /videos` for own videos
- Library screen with chronological list, thumbnails (use a placeholder for
  now — real thumbnails are a Phase 6 polish item)
- Video detail screen with `expo-video` playback via signed CloudFront URL
- `PATCH /videos/{id}` for metadata edits
- `DELETE /videos/{id}` (also deletes S3 object and comments)

### Phase 4 — Coach view
- `GET /videos` returns all videos when caller is in `coaches` group
- Coach feed screen, grouped by athlete name then sorted by date
- Coach can open any video, sees playback + athlete notes

### Phase 5 — Comments
- `Comments` table + endpoints
- Coach video detail: comment input + list
- Athlete video detail: read-only comments list
- Comment count on athlete library cards

### Phase 6 — Polish (post-MVP, optional)
- Server-side thumbnail generation (S3 trigger → small Lambda using
  `ffmpeg-lambda-layer`)
- Pull-to-refresh, optimistic comment UI
- Better error toasts
- Lifecycle rule to Glacier IT after 90 days

---

## Cost estimate

At ~10 videos/week × 150 MB:

- **Year 1**: $1–3/month total (storage growing from $0 → ~$2)
- **Year 2+**: $2–5/month at current usage
- All compute, auth, CDN, API costs effectively $0 (free tier covers it)
- Add ~$1.50/mo + $12/yr if we attach a custom domain

Biggest long-term cost lever is storage. Lifecycle to Glacier IT after 90d
cuts cold-storage cost ~6x.

---

## Open questions / decisions deferred

1. **Coach device** — assumed iPhone (also via Expo Go). If coach needs
   desktop web access, we add `npx expo start --web` and likely need
   MediaConvert to transcode HEVC → H.264 for non-Safari browsers
   (~$0.0075/min × ~1300 min/yr = ~$10/yr — cheap, just deferred work).
2. **Thumbnails** — punted to Phase 6. App shows a "video" icon placeholder
   in the library until then.
3. **Video duration extraction** — needs ffmpeg in the
   `UploadCompleteFunction` Lambda. Either ship a Lambda layer or skip and
   show duration only after playback starts. Decide in Phase 2.
4. **Coach-athlete linking** — MVP assumes every coach sees every athlete.
   Fine for ~2-10 users. Add a join table once we have multiple coaches.
5. **CloudFront private key storage** — Secrets Manager ($0.40/mo) or
   Parameter Store SecureString (free). Lean Parameter Store unless we need
   automatic rotation.
6. **Custom domain** — not in MVP. Default API Gateway and CloudFront URLs
   are ugly but functional.

---

## Out of scope for MVP

- Push notifications (new comment, etc.)
- Multi-athlete tenancy / coach assignments
- Video annotations (drawing on the video timeline)
- Side-by-side video comparison ("show me my squat from this week vs.
  last month")
- Web build of the Expo app
- App Store / TestFlight distribution
- Billing / subscription
- Admin UI (managing users is via Cognito console for MVP)
