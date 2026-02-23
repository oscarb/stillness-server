# Stillness 🖼️

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://www.docker.com/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

**Stillness** is a lightweight Node.js service designed to breathe life into e-paper displays. It fetches images from a Google Photos Shared Album, processes them with high-quality dithering, and serves them as 1-bit PNGs optimized for 7-inch Waveshare (and similar) e-ink screens.

When development on Stillness started, I could not find any easy way to get photos from Google Photos shown on the fantastic [TRMNL](htttps://trmnl.com) (however, there are [recipes](https://trmnl.com/recipes/230712) now!), hence this project. However, as I see it this project brings three main benefits:

- **Privacy**: While you do need to set up a public shared album, the album URL is not shared with anyone and if you self-host the service, nothing ends up in the cloud.
- **Performance**: Other solutions and BYOS for TRMNL rely on headless browsers taking screenshots, which can be very resource heavy. Stillness just fetches and processes image files, which makes it more suitable to run on a Raspberry Pi or NAS.
- **Photos first**: No complicated authentication with Google, just photos adapted in size and quality for e-paper displays. If you want text and dashboards, there are other projects for that.

## ✨ Features

- **Google Photos integration**: Automatically fetches and cycles through images from any public shared album.
- **High-quality dithering**: Uses the [Floyd-Steinberg algorithm](https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering) for superior 1-bit image quality
- **Auto-filtering**: Smartly ignores portrait and square images to ensure a perfect landscape fit
- **Optimized for e-ink**: Serves 1-bit indexed PNGs (800x480 by default) to minimize transfer time and display processing
- **Efficient caching**: Caches album URLs to reduce API calls and improve responsiveness
- **Docker ready**: Comes with a slim Docker configuration for easy deployment on home servers or Raspberry Pis

## 🚀 Quick Start

### Prerequisites

- [Node.js 24 (LTS)](https://nodejs.org/) or [Docker](https://www.docker.com/)
- A public Google Photos Shared Album URL
- An e-ink display that can fetch and display images from a URL, for example:
  - [Seeed Studio TRMNL 7.5" OG DIY Kit](https://www.seeedstudio.com/TRMNL-7-5-Inch-OG-DIY-Kit-p-6481.html)

### Docker

1. Clone the repository

   ```bash
   git clone https://github.com/oscarb/stillness.git
   cd stillness
   ```

2. Create a `.env` file and set `SHARED_ALBUM_URL` to your public album URL

   ```bash
   cp .env.sample .env
   ```

3. Spin it up
   ```bash
   docker compose up -d --build
   ```

Your service should now be running at `http://localhost:3000/image`.

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

| Variable           | Description                                                                     | Default  |
| :----------------- | :------------------------------------------------------------------------------ | :------- |
| `SHARED_ALBUM_URL` | **Required**. A comma-separated list of public Google Photos shared album URLs. | -        |
| `PORT`             | The port the server will listen on.                                             | `3000`   |
| `IMAGE_WIDTH`      | Target width of the generated e-ink image.                                      | `800`    |
| `IMAGE_HEIGHT`     | Target height of the generated e-ink image.                                     | `480`    |
| `DITHER_MODE`      | Algorithm used for dithering (e.g., `STUCKI`, `FLOYDSTEINBERG`, etc.).          | `STUCKI` |
| `LANDSCAPE_ONLY`   | Whether to automatically skip portrait and square images (`true`/`false`).      | `true`   |
| `CROP_STRATEGY`    | How to crop images (`CENTER`, `ATTENTION`, `ENTROPY`, `TOP`, `LEFT`, etc.).     | `CENTER` |

## 📡 API Reference

### `GET /image`

Returns a random landscape image from the configured album, dithered and formatted for e-paper displays

---

Made with 🤖 by [oscarb](https://github.com/oscarb) and Antigravity
