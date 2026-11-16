# Hotel_PMS

## Deploying the backend to Vercel

The backend is deployed from the `backend` directory, where `vercel.json` routes all
requests to the Express application in `server.js`. Set the Vercel project's Root
Directory to `backend`; the application does not need a separate `listen()` call in
Vercel's serverless runtime.

Configure these values in the Vercel project's Environment Variables instead of
committing or copying `backend/.env`:

- `MONGO_URI`: a MongoDB Atlas connection string for the production database.
- `JWT_SECRET`: the secret used to sign and verify authentication tokens.
- `FRONTEND_URL`: the deployed frontend's origin (scheme and hostname, without an
  API path). Add other allowed origins as a comma-separated `FRONTEND_ORIGINS`.

Do not set `DB_MODE=local`, `USE_IN_MEMORY_DB=true`, or `USE_LOCAL_DB=true` in Vercel.
Leave `DB_MODE` unset and keep `ALLOW_LOCAL_FALLBACK` unset or `false`. The backend
does not fall back to local or in-memory MongoDB in Vercel. MongoDB Atlas must also
allow network access from the Vercel deployment.

`GET /api/health` checks database readiness. A 503 response with
`Database service is temporarily unavailable` means the deployed function could not
connect to the configured database; check the Vercel function logs and the `MONGO_URI`
and Atlas network-access settings.