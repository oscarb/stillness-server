import sharp from 'sharp';
import { ditherImage, ColorScheme, DitherMode } from '@opendisplay/epaper-dithering';
import { create } from 'flat-cache';
import { isLandscapeOnly } from './config.js';

// Blocklist (videos, portrait photos, etc.)
export const deps = {
    blocklistCache: create({ cacheId: 'urlBlocklist', cacheDir: 'data' })
};


// target dimensions for 7-inch e-Paper
// target dimensions for e-Paper (configurable)
const WIDTH = parseInt(process.env.IMAGE_WIDTH) || 800;
const HEIGHT = parseInt(process.env.IMAGE_HEIGHT) || 480;

export function isBlocklisted(imageUrl) {
    return !!deps.blocklistCache.getKey(imageUrl);
}

export async function processImage(imageUrl, options = {}) {
  try {
    // Check blocklist first
    if (isBlocklisted(imageUrl)) {
        console.log(`Skipping image: ${imageUrl} is in blocklist`);
        return null;
    }

    // Check if it's a video
    if (await isVideo(imageUrl)) {
        console.log(`Skipping image: Detected ${imageUrl} as video/motion photo`);
        deps.blocklistCache.setKey(imageUrl, true);
        deps.blocklistCache.save(true);
        return null;
    }

    const landscapeOnly = isLandscapeOnly();

    const longestSide = landscapeOnly 
        ? Math.max(WIDTH, Math.round(HEIGHT * 16/9)) // Ensure up to 16:9 ratio fill screen height
        : Math.max(WIDTH, HEIGHT);
    const resizedImageUrl = `${imageUrl}=s${longestSide}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    let response;
    try {
        response = await fetch(resizedImageUrl, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }

    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);
    
    // Call rotate() to automatically useEXIF Orientation tag before getting metadata
    const image = sharp(inputBuffer).rotate();
    
    // Check orientation
    const metadata = await image.metadata();

    if (landscapeOnly && metadata.height >= metadata.width) {
      console.log(`Skipping image: Portrait or square orientation (${metadata.width}x${metadata.height})`);
      deps.blocklistCache.setKey(imageUrl, true);
      deps.blocklistCache.save(true);
      return null;
    }
    
    // Configurable cropping strategy
    // Options: 'ATTENTION', 'ENTROPY', 'CENTER', 'TOP', 'RIGHT', 'BOTTOM', 'LEFT' (case-insensitive)
    // Default to ENV or 'CENTER'
    const strategyName = (options.cropStrategy || process.env.CROP_STRATEGY || 'CENTER').toUpperCase();

    // Map strategy name to sharp position/strategy
    let resizeOptions = {
        fit: 'cover',
        position: 'center' // Default
    };

    // Mapping for static positions
    const staticPositions = ['CENTER', 'TOP', 'RIGHT', 'BOTTOM', 'LEFT', 'NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST'];
    
    if (staticPositions.includes(strategyName)) {
        resizeOptions.position = strategyName.toLowerCase();
    } else if (strategyName === 'ENTROPY') {
        resizeOptions.position = sharp.strategy.entropy;
    } else if (strategyName === 'ATTENTION') {
        resizeOptions.position = sharp.strategy.attention;
    } else {
        console.warn(`Unknown CROP_STRATEGY '${strategyName}', falling back to CENTER`);
    }

    // Apply resize with calculated options
    const { data: rawBuffer, info } = await image
      .resize(WIDTH, HEIGHT, resizeOptions)
      .ensureAlpha() 
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imageBuffer = {
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(rawBuffer)
    };

    // Determine dithering mode from env
    let ditherMode = DitherMode.STUCKI; // Default
    if (process.env.DITHER_MODE) {
        // Find matching key in DitherMode enum (case-insensitive)
        const modeKey = Object.keys(DitherMode).find(key => key.toUpperCase() === process.env.DITHER_MODE.toUpperCase());
        if (modeKey) {
            ditherMode = DitherMode[modeKey];
        } else {
            console.warn(`Invalid DITHER_MODE '${process.env.DITHER_MODE}', falling back to STUCKI`);
        }
    }

    // Apply Dithering using the library
    const dithered = ditherImage(imageBuffer, ColorScheme.MONO, ditherMode);

    // Calculate expected size
    const expectedSize = dithered.width * dithered.height;

    // Guard Clause
    if (dithered.indices.length !== expectedSize) {
        throw new Error(
        `Dither mismatch: Expected ${expectedSize} indices (${dithered.width}x${dithered.height}), ` +
        `but got ${dithered.indices.length}. Check cropping/resize logic.`
    );
}

    // The library returns { width, height, indices, palette } for indexed color schemes like MONO.
    // indices is a Uint8Array where each byte is an index into the palette.
    // For MONO, we expect 0 (Black) and 1 (White).
    // We need to convert this to something Sharp understands.
    // Let's map indices to 0 and 255 for a grayscale image.
    
    // Create a new buffer for the grayscale data
    const grayscaleData = Buffer.alloc(expectedSize);
    for (let i = 0; i < expectedSize; i++) {
        // Assuming palette[0] is black and palette[1] is white, or similar.
        // Usually index 0 -> 0x00, index 1 -> 0xFF.
        // If the library follows standard conventions, index 1 is 'on' / white, index 0 is 'off' / black.
        // But let's check the palette if we need to be precise. 
        // For now, mapping index != 0 to 255 is safe for binary.
        grayscaleData[i] = dithered.indices[i] === 1 ? 255 : 0;
    }

    const pngBuffer = await sharp(grayscaleData, {
      raw: {
        width: dithered.width,
        height: dithered.height,
        channels: 1
      }
    })
    .png({
      palette: true, 
      bitdepth: 1, 
      colors: 2, 
      effort: 10,
      compressionLevel: 9
    })
    .toBuffer();
    
    console.error('Processing complete!');

    return {
      data: pngBuffer,
      mimeType: 'image/png'
    };

  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

async function isVideo(baseUrl) {
  try {
    // Attempt to access the video stream (Download Video)
    // If this returns 200 OK, it's likely a video or a motion photo.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    let response;
    try {
      response = await fetch(`${baseUrl}=dv`, { method: 'HEAD', signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}