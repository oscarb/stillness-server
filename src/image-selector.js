import { processImage, isBlocklisted } from './processor.js';

export const deps = {
    processImage,
    isBlocklisted
};

export async function selectAndProcessNextImage(urls, lastProcessedUrl, isShuttingDown, maxAttempts = 10) {
    if (!urls || urls.length === 0) {
        return null;
    }

    const validUrls = urls.filter(url => !deps.isBlocklisted(url));
    const filteredCount = urls.length - validUrls.length;

    if (filteredCount > 0) {
        console.log(`  > Ignored ${filteredCount} blocklisted images.`);
    }

    if (validUrls.length === 0) {
        console.error('  > No valid URLs left after filtering blocklisted images');
        return null;
    }

    const usedIndices = new Set();
    let attempts = 0;

    while (attempts < maxAttempts && !isShuttingDown && usedIndices.size < validUrls.length) {
        const index = Math.floor(Math.random() * validUrls.length);
        if (usedIndices.has(index)) continue;
        usedIndices.add(index);

        const url = validUrls[index];

        // Ensure we check validUrls length, not the original URLs length.
        if (url === lastProcessedUrl && validUrls.length > 1) {
            console.log('  > Skipping image (same as last processed)');
            continue;
        }

        console.log(`  > Processing image (attempt ${attempts + 1}/${maxAttempts})...`);
        let result = await deps.processImage(url);
        
        if (result) {
            return { buffer: result.data, url: url };
        }
        
        attempts++;
    }

    return null;
}
