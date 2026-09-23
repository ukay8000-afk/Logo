# HD Logo Downloader

A static, no-backend logo downloader. 107 brands with pre-resolved SVG/PNG logo
sources baked into `data.js`, a category filter, search, single PNG/SVG saves,
a "download all as ZIP" button, and a custom-domain lookup box.

## Files

- `index.html` — page markup
- `style.css` — dark theme styling
- `data.js` — the baked brand + logo catalog (`window.BRANDS`)
- `script.js` — all app logic (render, search, download, zip, lookup)

No build step, no npm install, no server. It's plain HTML/CSS/JS.

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Opening via `file://` also works for browsing/searching; a local server is only
needed if your browser blocks `fetch()` on `file://` for the ZIP/SVG saves.)

## Deploy on GitHub Pages

1. Create a new repo on GitHub (or use an existing one) and push these four
   files to it:

   ```bash
   git init
   git add index.html style.css data.js script.js README.md
   git commit -m "HD logo downloader"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

2. On GitHub: go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Pick branch `main`, folder `/ (root)`, then **Save**.
5. After a minute your site is live at:
   `https://<your-username>.github.io/<repo-name>/`

That's it — no Actions/workflow file needed for a plain static site like this.

## How it differs from the original app

The project this was built from used a server (TanStack Start) to fetch logos
from Wikimedia Commons, a couple of logo APIs, and by scraping each brand's own
`<link rel="icon">` tags — all routed through a `/api/logo` proxy so the browser
never hit CORS restrictions.

This version has no server, so:

- The 107-brand catalog is **baked into `data.js`** at build time (already done —
  you don't need to regenerate anything to use it).
- Saving a **PNG** (single button or the ZIP) routes the image through
  [wsrv.nl](https://wsrv.nl) — a free public image proxy — before rasterizing it
  onto a clean 512×512 canvas. The proxy fetches the logo server-side and always
  serves it back with permissive CORS headers, so the canvas can read the pixels
  no matter what the *original* logo host allows. If the proxy is ever down or
  blocks a particular domain, it falls back to loading the raw URL directly,
  and only as a last resort opens the logo in a new tab so you can save it
  manually. This is what makes PNG downloads (including "Download all as ZIP")
  work reliably for essentially every brand in the catalog.
- Saving an **SVG** tries a direct `fetch()` first, then the same proxy as a
  fallback, then opens a new tab as a last resort.
- The **custom domain lookup** can no longer run the original multi-source
  resolver (Wikimedia search + API + site scraping), since that needed a server
  to dodge CORS. It now tries [Clearbit's logo API](https://clearbit.com/logo)
  and falls back to Google's favicon service — good enough for most sites, but
  lower quality than the baked catalog.

If you later want the full-quality resolver back, you'd need to host this on
something with server functions (Vercel, Netlify Functions, Cloudflare Workers,
etc.) and re-add an `/api/logo` style proxy endpoint — GitHub Pages only serves
static files.

## Updating the catalog

To add or edit brands, just edit the array in `data.js` — each entry looks like:

```js
{
  id: "amazon",
  file: "amazon.png",
  domain: "amazon.in",
  name: "Amazon",
  category: "Marketplaces",
  resolved: {
    vector: { url: "https://.../Amazon_logo.svg", mime: "image/svg+xml", width: 603, height: 182, source: "wikimedia" },
    mark:   { url: "https://.../domain:amazon.in", mime: "image/webp", width: 256, height: 256, source: "apistemic" }
  }
}
```

`vector` and/or `mark` can be `null` if you don't have one.
