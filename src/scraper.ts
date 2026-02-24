import { fetchImageUrls } from 'google-photos-album-image-url-fetch';
import { scrapeGooglePhotos } from 'google-photos-scraper';
import { getConfig } from './config.js';

// Cache album data
import { create } from 'flat-cache';
const albumCache = create({ cacheId: 'albumCache', cacheDir: 'data' });

export const deps = {
    fetchImageUrls,
    scrapeGooglePhotos,
    albumCache // Exported for testing purposes
};

// Prevent crashes in Docker/Non-TTY environments
['clearLine', 'cursorTo'].forEach((fn: string) => (process.stdout as any)[fn] ||= () => {});

export async function getAlbumImageUrls(albumUrl: string): Promise<string[]> {
  const cached = deps.albumCache.getKey(albumUrl) as { urls: string[], timestamp: number } | undefined;
  
  if (cached && cached.urls) {
    const ttlMs = getConfig().cacheTtlMinutes * 60 * 1000;
    const ageMs = Date.now() - cached.timestamp;

    if (ageMs < ttlMs) {
      console.log(`Using cached URLs (${cached.urls.length}) for album ${albumUrl} (in cache for ${Math.round(ageMs/60000)} minutes)`);
      return cached.urls;
    }
    console.log(`Cache expired for album ${albumUrl} (in cache for ${Math.round(ageMs/60000)} minutes > TTL: ${getConfig().cacheTtlMinutes} minutes). Fetching new...`);
  } else {
    console.log(`Fetching new URLs from album ${albumUrl}...`);
  }

  // Check if we already know this is a large album based on previous cache size
  if (cached && cached.urls && cached.urls.length >= 300) {
      console.log('Album previously identified as large (>=300). Using scraper directly.');
      return await performHeavyScrape(albumUrl);
  }
  
  // Try lightweight fetch
  try {
      console.log('Attempting lightweight fetch...');
      const images = await deps.fetchImageUrls(albumUrl);
      
      if (!images) {
          throw new Error('Lightweight fetch returned null');
      }

      console.log(`Lightweight fetch found ${images.length} items.`);

      if (images.length < 300) {
          const config = getConfig();
          const landscapeOnly = config.landscapeOnly;
          const urls = images
            .filter(image => landscapeOnly ? image.width > image.height : true)
            .map(image => image.url);
          
          console.log(`Using ${urls.length} images from lightweight fetch for album ${albumUrl}.`);
          
          // Update cache with URLs and current timestamp
          deps.albumCache.setKey(albumUrl, { urls, timestamp: Date.now() });
          deps.albumCache.save(true);

          return urls;
      }
      
      console.log('Hit 300-image limit. Switching to heavy scraper for full album...');

  } catch (error: any) {
       console.error('Lightweight fetch failed or suspect (Error: ' + error.message + '). Switching to fallback scraper.');
  }

  // Fallback to heavy scraper
  return await performHeavyScrape(albumUrl);
}

async function performHeavyScrape(albumUrl: string): Promise<string[]> {
    try {
        console.log(`Attempting heavy scrape for album ${albumUrl}...`);
        const imageUrls = await deps.scrapeGooglePhotos(albumUrl);
        console.log("\n"); // Add a newline for better spacing

        if (!imageUrls || imageUrls.length === 0) {
            throw new Error(`No imageUrls found in album (Scraper) ${albumUrl}`);
        }

        // Update cache
        deps.albumCache.setKey(albumUrl, { urls: imageUrls, timestamp: Date.now() });
        deps.albumCache.save(true);

        return imageUrls;
    } catch (error) {
        console.error('Error in heavy scraper:', error);
        throw error;
    }
}