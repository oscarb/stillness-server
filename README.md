# Stillness server

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://www.docker.com/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

![Stillness](docs/stillness-hero.gif)

**Stillness** is a battery-powered e-paper photo frame, surfacing memories from Google Photos albums using this custom server and ESPHome firmware. Read more in the [blog post](https://oscarb.medium.com/2de0da83912b) or check out the [firmware](https://github.com/oscarb/stillness-firmware).

**Stillness server** is a Node.js service that fetches images from albums in Google Photos, processes them with high-quality dithering, and serves them as 1-bit PNGs optimized for 7.5" Waveshare (and similar) e-ink screens.

## What makes Stillness different?

When development on Stillness started, I could not find any easy way to get photos from Google Photos shown on the fantastic [TRMNL](htttps://trmnl.com) (however, there are [recipes](https://trmnl.com/recipes/230712) for that now!). However, this project still brings some benefits:

- **Privacy**: While you do need to set up a public shared album, the album URL is not shared with anyone and if you self-host the service, nothing ends up in the cloud.
- **Performance**: Other solutions and BYOS for TRMNL rely on headless browsers taking screenshots, which can be very resource heavy. Stillness just fetches and processes image files, which makes it more suitable for running on a Raspberry Pi or NAS.
- **Photos first**: No complicated authentication with Google, just photos adapted in size and quality for e-paper displays.

## Features

- **Google Photos integration**: Automatically fetches and cycles through images from one or multiple albums
- **High-quality dithering**: Supports different [dithering algorithms](https://en.wikipedia.org/wiki/Dither#Algorithms), such as Stucki and Floyd-Steinberg for superior 1-bit image quality
- **Auto-filtering**: Smartly ignores portrait and square images to ensure a perfect landscape fit
- **Optimized for e-ink**: Serves 1-bit indexed PNGs (800x480 by default) to minimize transfer time and display processing
- **Efficient caching**: Caches album URLs to reduce API calls and improve responsiveness
- **Docker ready**: Comes with a Docker configuration for easy deployment on home servers or Raspberry Pis

## Quick start

### Prerequisites

- [Node.js 24 (LTS)](https://nodejs.org/) or [Docker](https://www.docker.com/)
- Public Google Photos Shared Album URLs
- An e-ink display that can fetch and display images from a URL, for example:
  - [Seeed Studio TRMNL 7.5" OG DIY Kit](https://www.seeedstudio.com/TRMNL-7-5-Inch-OG-DIY-Kit-p-6481.html)

### Docker

1. Clone the repository

2. Create a `.env` file and set `SHARED_ALBUM_URL` to your public album URL

   ```bash
   cp .env.sample .env
   ```

3. Spin it up
   ```bash
   docker compose up -d --build
   ```

The service should now be running at `http://localhost:3000/image`.

### Node

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file and set `SHARED_ALBUM_URL` to your public album URL

   ```bash
   cp .env.sample .env
   ```

3. Start the server:
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

## 🛠️ Configuration

The service is configured via environment variables:

| Variable                      | Description                                                                                                        | Default  |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------- | :------- |
| `SHARED_ALBUM_URL`            | **Required**. A comma-separated list of public Google Photos shared album URLs                                     | -        |
| `PORT`                        | The port the server will listen on                                                                                 | `3000`   |
| `IMAGE_WIDTH`                 | Target width of the generated e-ink image                                                                          | `800`    |
| `IMAGE_HEIGHT`                | Target height of the generated e-ink image                                                                         | `480`    |
| `DITHER_MODE`                 | Algorithm used for dithering ([options](https://www.npmjs.com/package/@opendisplay/epaper-dithering#dither-modes)) | `STUCKI` |
| `LANDSCAPE_ONLY`              | Whether to automatically skip portrait and square images (`true`, `false`)                                         | `true`   |
| `CROP_STRATEGY`               | How to crop images (`CENTER`, `ATTENTION`, `ENTROPY`, `TOP`, `LEFT`, etc.)                                         | `CENTER` |
| `CACHE_TTL_MINUTES`           | How often to check for new images in the album (in minutes)                                                        | `60`     |
| `SCRAPER_MAX_NO_NEW_PHOTOS`   | Scraper timeout: Max scroll attempts without finding new photos before exiting                                     | `200`    |
| `SCRAPER_MAX_SCROLL_ATTEMPTS` | Scraper global limit: Absolute maximum number of scroll attempts for an album                                      | `3000`   |
| `SCRAPER_SCROLL_DELAY`        | Wait time in ms between scraper scroll attempts to allow rendering                                                 | `200`    |

## 📡 API reference

### `GET /image`

Returns the next random image from the configured album, dithered and formatted for e-paper displays.

### `GET /dashboard`

Provides a web-based dashboard for monitoring the server's status, viewing the currently processed image alongside the original and current configuration.

### `GET /health`

Returns a JSON object detailing the system's operational status including server uptime, blocklist counts, current configuration details, and metrics about the album links cached.

---

Made with 🤖 by [oscarb](https://github.com/oscarb) and Antigravity
