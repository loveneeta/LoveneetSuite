# Loveneet Suite — Multi-tenant authentication setup

## What is included
- Super Admin first-run bootstrap; no default or hard-coded administrator credentials.
- Company registration with a separate company administrator.
- Company/team accounts, with a configurable total account cap. A plan with 6 accounts means one company admin plus five additional team members.
- Role-based access: Super Admin, Company Admin and Member.
- Company tool entitlements and individual PDF tool entitlements.
- Subscription plans with price/currency, validity days, user limits and included tools. Expiry is enforced at login and API authorization.
- Tool display-name management.
- Server-side watermark policy for PDF, image, text, DOCX, PPTX and XLSX outputs, including files inside generated ZIPs. Browser-generated downloads must pass through `/api/output/watermark`; the supplied UI download helpers do this.
- Audit events, password change, administrator-issued temporary password resets, and optional SMTP password-reset email.
- HTTP-only signed session cookie, PBKDF2 password hashing and login throttling.

## First-run server configuration
Set these environment variables on the machine hosting the FastAPI backend before starting it:

- `SUPERADMIN_SETUP_KEY`: one-time secret used only to create the first Super Admin. Use a long random value and remove/rotate it after initial setup.
- `LOVENEET_AUTH_SECRET`: optional persistent signing secret, at least 32 characters. Strongly recommended in production. If omitted, the backend creates and persists `backend/data/.session-secret`.
- `LOVENEET_AUTH_DB`: optional absolute path for the authentication SQLite database. Default: `backend/data/auth.db`. Back up this database and its session secret.
- `AUTH_COOKIE_SECURE=true`: required when the app is served over HTTPS. Keep false only for trusted localhost HTTP development.
- `AUTH_COOKIE_SAMESITE=Lax`: default browser cookie policy. For a deliberately cross-site frontend/API deployment use `None` with HTTPS and Secure cookies; prefer a same-origin reverse proxy.
- `CORS_ORIGINS`: comma-separated trusted frontend origins, such as `https://suite.example.com`.
- `ALLOW_ALL_CORS=false`: recommended for production. When true, the backend reflects request origins using an origin regex to support credentialed CORS; do not use this on a public production service.

Example Windows PowerShell (set values in the service environment, not in source code):
```powershell
$env:SUPERADMIN_SETUP_KEY = "replace-with-a-long-random-one-time-secret"
$env:LOVENEET_AUTH_SECRET = "replace-with-a-different-random-secret-at-least-32-characters"
$env:LOVENEET_AUTH_DB = "D:\LoveneetSuiteData\auth.db"
$env:AUTH_COOKIE_SECURE = "false" # localhost HTTP only
$env:ALLOW_ALL_CORS = "false"
$env:CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
```

Start the backend, open the Loveneet Suite web app, and complete the first-run Super Admin setup form. The setup endpoint refuses further Super Admin creation after the first owner exists. Remove `SUPERADMIN_SETUP_KEY` from the server environment after bootstrap.

## Password reset email (optional)
Configure all of the following to enable self-service email reset:
- `SMTP_HOST`
- `SMTP_PORT` (default 587)
- `SMTP_FROM`
- `SMTP_USER` and `SMTP_PASSWORD` when authentication is required
- `SMTP_STARTTLS=true` (default)
- `PUBLIC_APP_URL` (the public base URL of the frontend)

Without SMTP configuration, users can still change their own passwords and administrators can issue a temporary password reset. Temporary passwords are displayed once in the administrator UI and must be shared securely.

## Watermark policy
The Super Admin configures the global mandatory policy. Text supports:
- `{company}`
- `{user}`
- `{date}`

The output middleware blocks downloads if watermark processing fails. ZIP files are opened and their supported documents/images are watermarked before the ZIP is returned. Client-side generators use the authenticated watermark endpoint rather than releasing their raw Blob directly. Validate output before external distribution.

## Tenant safety boundaries
- Company account records, plan entitlements, member management and audit records are scoped by company ID.
- Companies cannot administer another company's users or settings.
- Business System ERP and File Collector remain Super Admin-only because the current ERP runs as a separate service on port 8080 and the collector can access server-side folders. Do not grant these to tenant companies until those services enforce tenant identity and server-side data boundaries.
- Existing Business System ERP data is not migrated into tenant-specific databases by this authentication change.
- Plans are assigned and managed by Super Admin; payment collection and automated billing are not included.

## Deployment requirements
Use HTTPS for internet-facing deployment. Persist the authentication database and signing secret across restarts and backups. Do not publish the setup key or signing secret in frontend environment variables, source control, logs or screenshots.
