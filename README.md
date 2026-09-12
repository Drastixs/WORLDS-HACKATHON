# WORLD

A one-phone Next.js demo that opens Google Street View outside Bastille Court,
1–2 Paris Garden, London. On supported mobile devices, turning the phone changes
the point of view. Touch dragging remains available as a fallback.

## Set up Google Maps

1. Create a browser API key in Google Cloud.
2. Enable **Maps JavaScript API** and billing for the project.
3. Restrict the key to your deployed HTTPS domain and to Maps JavaScript API.
4. Copy `.env.example` to `.env.local` and add the key.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Open the site on the Pixel 7 in Chrome and tap **Look around**. Motion sensors
require a secure context, so use an HTTPS deployment for the phone demo. The
Street View motion-tracking control appears only when the browser reports sensor
support.

## Checks

```sh
npm run typecheck
npm run build
```
