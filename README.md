# WORLD

A one-phone Next.js demo that opens an owned Pixel 7 photosphere captured outside
Bastille Court, 1–2 Paris Garden, London. On supported mobile devices, turning the
phone changes the point of view. Touch dragging remains available as a fallback.

## Run locally

```shell
npm install
npm run dev
```

Open the site on the Pixel 7 in Chrome and tap **Look around**. Motion sensors
require a secure context, so use an HTTPS deployment for the phone demo. The
photosphere is bundled with the app and does not require an imagery API or network
request after the site has loaded.

## Checks

```shell
npm run typecheck
npm run build
```
