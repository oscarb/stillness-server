import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import { getAlbumImageUrls } from './scraper.js';
import { processImage, isBlocklisted } from './processor.js';

dotenv.config();

const app = express();
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


let lastProcessedUrl = null;

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
        
        let attempts = 0;
        const maxAttempts = 10;
        let pngBuffer;

        if(urls.length == 0) {
            console.error('No URLs found in album');
            return;
        }

        const validUrls = urls.filter(url => !isBlocklisted(url));
        const filteredCount = urls.length - validUrls.length;

        console.log(`Found ${urls.length} total images in ${ALBUM_URLS.length === 1 ? 'one album' : ALBUM_URLS.length + ' albums'} ` +
                    `${filteredCount > 0 ? `(ignored ${filteredCount} blocklisted)` : ''}`);

        if (validUrls.length === 0) {
            console.error('No valid URLs left after filtering blocklisted images');
            return;
        }

        const usedIndices = new Set();

        while (attempts < maxAttempts && !isShuttingDown && usedIndices.size < validUrls.length) {
            const index = Math.floor(Math.random() * validUrls.length);
            if (usedIndices.has(index)) continue;
            usedIndices.add(index);

            const url = validUrls[index];

            if(url === lastProcessedUrl && urls.length > 1) {
                console.log('Skipping image (same as last processed)');
                continue;
            }

            // Process
            console.log(`Processing image (attempt ${attempts + 1}/${maxAttempts})...`);
            let result = await processImage(url);
            
            if (result) {
                pngBuffer = result.data;
                lastProcessedUrl = url;
                break;
            }
            
            attempts++;
        }

        if (isShuttingDown) {
            console.log('Generation aborted due to shutdown.');
            return;
        }

        if (!pngBuffer) {
            console.error('Failed to generate next image after max attempts.');
            return;
        }

        // Write to temp file then rename for atomic update
        fs.writeFileSync(TEMP_NEXT_IMAGE_PATH, pngBuffer);
        fs.renameSync(TEMP_NEXT_IMAGE_PATH, NEXT_IMAGE_PATH);
        console.log('Next image generated and saved to ' + NEXT_IMAGE_PATH + ' (took ' + (Date.now() - startTime) + 'ms)');
    } catch (error) {
        console.error('Error generating next image:', error);
    } finally {
        isGenerating = false;
    }
}

app.get('/image', async (req, res) => {
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
        // Fire and forget
        if (!isShuttingDown) {
            generateNextImage(); 
        }
    } else {
        res.status(500).send('Failed to serve image');
    }

  } catch (error) {
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

function gracefulShutdown(signal) {
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
