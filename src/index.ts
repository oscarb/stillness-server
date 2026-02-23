import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import { getAlbumImageUrls, deps as scraperDeps } from './scraper.js';
import { selectAndProcessNextImage } from './image-selector.js';
import { deps as processorDeps } from './processor.js';
import { getConfig } from './config.js';

dotenv.config();

const app = express();
app.use(express.static('public'));
const PORT = process.env.PORT || 3000;
const ALBUM_URLS = process.env.SHARED_ALBUM_URL ? process.env.SHARED_ALBUM_URL.split(',').map(url => url.trim()) : [];
const NEXT_IMAGE_PATH = path.join(process.cwd(), 'data', '_next.png');
const TEMP_NEXT_IMAGE_PATH = path.join(process.cwd(), 'data', '_temp_next.png');

if (ALBUM_URLS.length === 0) {
  console.error('Error: SHARED_ALBUM_URL environment variable is not set or empty.');
  process.exit(1);
}

// Ensure data directory exists
if (!fs.existsSync(path.dirname(NEXT_IMAGE_PATH))) {
    fs.mkdirSync(path.dirname(NEXT_IMAGE_PATH), { recursive: true });
}


let lastProcessedUrl: string | null = null;
let lastGeneratedTimestamp: number | null = null;
if (fs.existsSync(NEXT_IMAGE_PATH)) {
    lastGeneratedTimestamp = fs.statSync(NEXT_IMAGE_PATH).mtimeMs;
}
const serverStartTime = Date.now();

// Track active generation
let isGenerating = false;
let isShuttingDown = false;

async function generateNextImage() {
    if (isShuttingDown) return;
    if (isGenerating) return; // Prevent concurrent generations

    isGenerating = true;
    const startTime = Date.now();
    console.log('Generating next image...');
    try {
        const results = await Promise.allSettled(ALBUM_URLS.map(url => getAlbumImageUrls(url)));
        const urls = results
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value);

        // Pick a random URL and try to process it
        // If processing returns null (e.g. portrait), try another one.
        // Limit retries to avoid infinite loops.
        const maxAttempts = 10;

        if(urls.length === 0) {
            console.error('No URLs found in album');
            return;
        }

        console.log(`Found ${urls.length} total images in ${ALBUM_URLS.length === 1 ? 'one album' : ALBUM_URLS.length + ' albums'}`);

        const result = await selectAndProcessNextImage(urls, lastProcessedUrl, isShuttingDown, maxAttempts);

        if (isShuttingDown) {
            console.log('Generation aborted due to shutdown.');
            return;
        }

        if (!result) {
            console.error('Failed to generate next image after max attempts.');
            return;
        }

        // Write to temp file then rename for atomic update
        fs.writeFileSync(TEMP_NEXT_IMAGE_PATH, result.buffer);
        fs.renameSync(TEMP_NEXT_IMAGE_PATH, NEXT_IMAGE_PATH);
        lastProcessedUrl = result.url;
        lastGeneratedTimestamp = Date.now();
        console.log('Next image generated and saved to ' + NEXT_IMAGE_PATH + ' (took ' + (Date.now() - startTime) + 'ms)');
    } catch (error: any) {
        console.error('Error generating next image:', error);
    } finally {
        isGenerating = false;
    }
}

app.get('/health', (req: express.Request, res: express.Response) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
        
        let blocklistCount = 0;
        try {
            blocklistCount = Object.keys(processorDeps.blocklistCache.all()).length;
        } catch (e) {
            console.error('Error reading blocklist cache:', e);
        }

        let albumsData: any[] = [];
        let totalCachedUrls = 0;
        try {
            const albumCacheData = scraperDeps.albumCache.all();
            for (const [url, data] of Object.entries(albumCacheData)) {
                const typedData = data as { urls?: string[], timestamp?: number };
                const count = typedData.urls?.length || 0;
                totalCachedUrls += count;
                albumsData.push({ url, count, timestamp: typedData.timestamp });
            }
        } catch (e) {
            console.error('Error reading album cache:', e);
        }

        res.json({
            status: 'ok',
            uptimeSeconds,
            serverStartTime,
            lastGeneratedTimestamp,
            lastProcessedUrl,
            monitoredAlbums: ALBUM_URLS,
            stats: {
                totalCachedUrls,
                blocklistCount,
                albumsCached: albumsData.length
            },
            config: getConfig(),
            cacheDetails: albumsData
        });
    } catch (error: any) {
        console.error('Error in /health endpoint:', error);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.get('/dashboard', (req: express.Request, res: express.Response) => {
    res.sendFile(path.join(process.cwd(), 'public', 'dashboard.html'));
});

app.get('/image', async (req: express.Request, res: express.Response) => {
  try {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(`Request processed in ${duration}ms`);
    });
    console.log('Request received for /image');

    // Check if next image exists
    if (!fs.existsSync(NEXT_IMAGE_PATH)) {
        console.log('Next image not found, generating immediately...');
        await generateNextImage();
    }

    if (fs.existsSync(NEXT_IMAGE_PATH)) {
        const stats = await fs.promises.stat(NEXT_IMAGE_PATH);
        const lastModified = stats.mtime.toUTCString();
        const ifModifiedSince = req.headers['if-modified-since'];

        if (lastModified === ifModifiedSince) {
            res.status(304).send();
            return;
        }        
 
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'no-cache');
        res.set('ETag', `"${stats.size}-${stats.mtime.getTime()}"`);
        res.set('Last-Modified', lastModified);

        res.sendFile(NEXT_IMAGE_PATH);

        // Trigger background generation for the NEXT request
        // Fire and forget (unless this request was just a local preview from the dashboard)
        if (!isShuttingDown && req.query.localPreview !== 'true') {
            generateNextImage(); 
        }
    } else {
        res.status(500).send('Failed to serve image');
    }

  } catch (error: any) {
    console.error('Server Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Monitoring albums: \n  - ${ALBUM_URLS.join('\n  - ')}`);

  // Generate initial image on startup if missing
  if (!fs.existsSync(NEXT_IMAGE_PATH)) {
      console.log('Initial image missing, generating...');
      await generateNextImage();
  } else {
      console.log('Initial image already exists.');
  }
});

function gracefulShutdown(signal: string) {
    console.log(`${signal} signal received: closing HTTP server`);
    isShuttingDown = true;
    
    server.close(() => {
        console.log('HTTP server closed');
        
        if (isGenerating) {
            console.log('Waiting for ongoing image generation to complete...');
            const interval = setInterval(() => {
                if (!isGenerating) {
                    clearInterval(interval);
                    console.log('Image generation completed. Exiting.');
                    process.exit(0);
                }
            }, 100);
        } else {
            console.log('No partial generation active. Exiting.');
            process.exit(0);
        }
    });
    
    // Force shutdown after timeout
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000); // 10s timeout
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
