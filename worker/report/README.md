# Pier report worker

Receives reports from the app and opens them as issues in `REPO`, so reporting doesn't require a GitHub account. Runs on the Cloudflare Workers free plan.

## Deploy

1. Create a fine-grained personal access token for the repository with only **Issues: Read and write**.
2. From this directory:

   ```sh
   npx wrangler deploy
   npx wrangler secret put GITHUB_TOKEN
   ```

3. Put the deployed URL in `REPORT_ENDPOINT` in `src-tauri/src/report.rs`.

## Request

`POST` JSON `{ "kind": "bug" | "enhancement", "title": string, "body": string }`. Replies `{ "url": string }` with the issue URL. Limited to 5 reports per minute per IP.
