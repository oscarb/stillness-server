import NodeCache from '@cacheable/node-cache';
import { fetchImageUrls } from 'google-photos-album-image-url-fetch';
import { scrapeGooglePhotos } from 'google-photos-scraper';

// Cache album meta data
import { create } from 'flat-cache';
const albumMetaDataCache = create({ cacheId: 'albumMetaData', cacheDir: 'data' });

// Cache URLs for 1 hour (3600 seconds)
const urlCache = new NodeCache({ stdTTL: 3600 });
const URL_CACHE_KEY = 'album_urls';

// Prevent crashes in Docker/Non-TTY environments
['clearLine', 'cursorTo'].forEach(fn => process.stdout[fn] ||= () => {});

export const deps = {
    fetchImageUrls,
    scrapeGooglePhotos
};

export async function getAlbumImageUrls(albumUrl) {

  const urlCacheKey = `${URL_CACHE_KEY}_${albumUrl}`;
  // Check url cache first
  const cachedUrls = urlCache.get(urlCacheKey);
  if (cachedUrls) {
    console.log(`Using cached URLs (${cachedUrls.length}) for album ${albumUrl}`);
    return cachedUrls;
  }

  console.log(`Fetching new URLs from album ${albumUrl}...`);

  // Check if we already know this is a large album
  const albumMetaData = albumMetaDataCache.getKey(albumUrl);
  if (albumMetaData && albumMetaData.size >= 300) {
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

      // Check if we hit the ~300 limit (typical limit for this library / initial page load)
      // If we got exactly 0, it might be empty or error, but let's assume valid.
      // If we validly got < 300, we proceed. 
      if (images.length < 300) {
          // Success! Map to URLs and return.
          const landscapeOnly = process.env.LANDSCAPE_ONLY !== 'false'; // Default to true
          const urls = images
            .filter(image => landscapeOnly ? image.width > image.height : true)
            .map(image => image.url);
          
          console.log(`Using ${urls.length} images from lightweight fetch for album ${albumUrl}.`);
          urlCache.set(urlCacheKey, urls);

          // Update album metadata
          albumMetaDataCache.setKey(albumUrl, { size: images.length });
          albumMetaDataCache.save(true);

          return urls;
      }
      
       console.log('Hit 300-image limit. Switching to heavy scraper for full album...');

  } catch (error) {
       console.error('Lightweight fetch failed or suspect (Error: ' + error.message + '). Switching to fallback scraper.');
  }

  // Fallback to heavy scraper
  return await performHeavyScrape(albumUrl);
}

async function performHeavyScrape(albumUrl) {
    try {
        console.log(`Attempting heavy scrape for album ${albumUrl}...`);
        const imageUrls = await deps.scrapeGooglePhotos(albumUrl);
        console.log("\n"); // Add a newline for better spacing

        if (!imageUrls || imageUrls.length === 0) {
            throw new Error(`No imageUrls found in album (Scraper) ${albumUrl}`);
        }
        const urlCacheKey = `${URL_CACHE_KEY}_${albumUrl}`;
        urlCache.set(urlCacheKey, imageUrls);

        // Update album metadata
        albumMetaDataCache.setKey(albumUrl, { size: imageUrls.length });
        albumMetaDataCache.save(true);

        return imageUrls;
    } catch (error) {
        console.error('Error in heavy scraper:', error);
        throw error;
    }
}