# Question Generator API

This is the small API service used by the Question Generator project. It currently accepts raw file uploads (PDFs, binary streams) and provides basic health and root endpoints.

## What exists so far

- `GET /` — simple root route that returns "Question Generator API is running.".
- `GET /health` — returns a JSON health status: `{ status: "ok" }`.
- `POST /file-upload` — accepts raw binary uploads using `Content-Type: application/octet-stream` (or `application/pdf`). The endpoint reads the filename from the `x-filename` request header and the raw file from the request body (express.raw).

Notes:
- Express is configured with `express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '10mb' })` so the request body is a `Buffer` for matching content types.
- The code prints headers and buffer length for debugging during upload.
- A helper `helpers/fileUploader.js` exists which uses the Appwrite SDK (`node-appwrite`) to upload buffers to an Appwrite Storage bucket.

## Environment variables

The following environment variables are used (set these in a `.env` file or CI environment):

- `APPWRITE_ENDPOINT` — Appwrite endpoint, eg. `https://<something>.cloud.appwrite.io/v1` (region matters).
- `APPWRITE_PROJECT_ID` — Appwrite project ID.
- `APPWRITE_API_KEY` — API key with storage permissions.
- `APPWRITE_BUCKET_ID` — ID of the Appwrite storage bucket to use.

If you are not using Appwrite, the API can be adapted to write files to a local `uploads/` directory instead.

## How to run (local, PowerShell)

1. Install dependencies

```powershell
cd .\question-generator-api
npm install
```

2. Start the server

```powershell
# from question-generator-api folder
node .\index.js
```

3. Test uploading a binary file (PowerShell / curl)

```powershell
curl.exe -X POST `
  -H "Content-Type: application/octet-stream" `
  -H "x-filename: test.pdf" `
  --data-binary "@C:\path\to\test.pdf" `
  http://localhost:3000/file-upload
```

Or use Thunder Client / Postman: set the body to binary, `Content-Type: application/octet-stream`, add header `x-filename` with desired filename.

## Expected behavior

- The server will reject files larger than 10 MB (based on `content-length` and `express.raw` limit).
- When a buffer is received, it will either be forwarded to the `FileUploader` (Appwrite) helper or saved locally depending on implementation.

## Appwrite notes & common errors

- Import style: `node-appwrite` uses named exports. Use `import { Client, Storage, ID } from 'node-appwrite';` and `import { InputFile } from 'node-appwrite/file';`.
- Region/endpoint errors: "Project is not accessible in this region" indicates you're using the wrong endpoint (Appwrite cloud has regional hosts like `<something>.cloud.appwrite.io`). Set `APPWRITE_ENDPOINT` to the correct region.
- Network/`fetch failed` errors: verify network connectivity and that the Appwrite endpoint is reachable from your environment. Retry logic or connectivity checks can help.
- If raw body is empty: ensure `Content-Type` matches one of the types in `express.raw(...)` and that the client sends the body as raw binary (Thunder Client: "Binary" body, curl: `--data-binary`).

## Troubleshooting steps

- Confirm API key and project/bucket IDs are correct in the Appwrite console.
- Confirm endpoint region (use the same region URL shown in Appwrite console).
- Test Appwrite connectivity by calling the endpoint in a browser (e.g., `https://<region>.cloud.appwrite.io/v1/health`).
- Validate requests with curl to ensure the raw body is sent correctly.

## Next steps / Improvements

- Persist uploads locally (to `uploads/`) as a fallback when Appwrite is unavailable.
- Add proper unit tests for the `/file-upload` handler and for the Appwrite helper.
- Add request validation and stricter MIME-type checks.
- Add streaming uploads and chunked upload support for large files.
- Add an integration test that exercises Appwrite (could use a test project or mock Appwrite responses).

## Files of interest

- `index.js` — main server and routes.
- `helpers/fileUploader.js` — Appwrite upload helper.

---

If you'd like, I can also:
- Save binary uploads to a local `uploads/` folder and implement that fallback.
- Add a small `README` section with example Thunder Client configuration (exportable JSON).
- Add a `.env.example` showing the required environment variables.

Tell me which follow-up you'd prefer and I will implement it next.
