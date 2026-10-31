# Deploy to a VPS and test on a phone

The app is static HTML, CSS, SVG and JavaScript. It has no backend, account, database, install step or build step. All interaction and recording stay in the visitor's browser. Use an existing HTTPS site on your VPS for the easiest phone test.

## Pull the repository

```sh
git clone https://github.com/lonce/interactive-gears.git
cd interactive-gears
```

For subsequent changes, run `git pull --ff-only` inside this checkout.

## Option A: serve static files with Nginx or Apache

Copy these runtime files into a directory under your existing site's document root, such as `gears/`:

```sh
mkdir -p /your/site/document-root/gears
cp index.html style.css app.mjs physics.mjs diagnostics.mjs gears.svg gear-spec.json /your/site/document-root/gears/
```

Replace `/your/site/document-root` with your actual site directory. No Node process is needed. Serve `.mjs` as JavaScript (`text/javascript` or `application/javascript`), `.svg` as `image/svg+xml`, and `.json` as `application/json`. If your web server does not already map `.mjs`, add that MIME mapping to the site's configuration. Only copy the runtime files above; the Git checkout and diagnostic reports do not need to be in the public document root.

## Option B: Node behind an existing reverse proxy

From the checkout, run:

```sh
node server.mjs 8080
```

It listens only on `127.0.0.1`, so the service is reached through your existing web server. It serves only the runtime assets, never `.git` or project notes. A minimal Nginx location inside an existing HTTPS server block is:

```nginx
location /gears/ {
    proxy_pass http://127.0.0.1:8080/;
}
```

Check your Nginx configuration and reload it using your existing deployment procedure. For persistent use, run Node under your existing process manager or systemd service. Restart Node after pulling changes to `server.mjs`; static asset edits are read on each request.

## Phone URLs

Replace `your-domain.example` with the domain already configured on your server:

- SVG: `https://your-domain.example/gears/`
- Cached images: `https://your-domain.example/gears/?renderer=bitmap`
- Comparison: `https://your-domain.example/gears/?diagnostics=1`

Keep the trailing slash after `/gears/` so relative asset URLs resolve correctly. Drag the vertical slider with your finger and release to coast. Keep the tab visible for recording or diagnostics. The diagnostics comparison takes 72 seconds and temporarily disables the normal controls. Browser movie export depends on the phone's MediaRecorder support; if unavailable, Save take still preserves the recording as JSON.

For meaningful stutter comparisons, test both rendering modes on the same phone, at the same orientation and zoom, without resizing or switching apps during the run. The diagnostic page offers a JSON report download.
