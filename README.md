# Reel Score

**Movie night, minus the scrolling.** Browse Netflix and Prime Video movies by minimum IMDb score, genre, and region.

## Architecture

The React app is a static Vite site. Movie searches go to the same-origin `/api/movies` Cloudflare Pages Function, which calls TMDb and OMDb using server-only secrets. API keys are never shipped to the browser. Search results are cached at the edge for four hours to reduce API usage.

## Local frontend development

```bash
npm install
npm run dev
```

This runs the visual frontend only. Movie search requires the Cloudflare Pages Function and API secrets.

## Local full-stack development

1. Copy `.dev.vars.example` to `.dev.vars` and enter your own TMDb and OMDb keys.
2. Build the site:

   ```bash
   npm run build
   ```

3. Run the Pages project locally:

   ```bash
   npx wrangler pages dev dist
   ```

Never commit `.dev.vars` or paste keys into files under `src/`.

## Publish free with GitHub + Cloudflare Pages

1. Create a GitHub repository and push this project to `main`.
2. In Cloudflare: **Workers & Pages → Create application → Pages → Connect to Git**.
3. Select the repository and set:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. In **Settings → Variables and Secrets**, add these as encrypted secrets:
   - `TMDB_API_KEY`
   - `OMDB_API_KEY`
5. Deploy. Cloudflare automatically publishes every future push to `main`.

The free plan is suitable for a small public project, but OMDb still enforces its own quota. The function returns a clear service-limit message if that quota is reached.

## Project layout

```text
src/                 React interface
functions/api/       Cloudflare Pages server-side API
.dev.vars.example    local secret template
```
