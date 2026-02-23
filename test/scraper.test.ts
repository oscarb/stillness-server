import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getAlbumImageUrls, deps } from '../src/scraper.js';
import fs from 'fs';
import path from 'path';

describe('Scraper Tests', () => {
    let fetchImageUrlsMock: any;
    let scrapeGooglePhotosMock: any;

    beforeEach(() => {
        // Create mock functions
        fetchImageUrlsMock = mock.fn();
        scrapeGooglePhotosMock = mock.fn();

        // Inject mocks
        deps.fetchImageUrls = fetchImageUrlsMock;
        deps.scrapeGooglePhotos = scrapeGooglePhotosMock;

        // Clear out any cached data if necessary
        const nextImagePath = path.join(process.cwd(), 'data', 'albumMetaData');
        if (fs.existsSync(nextImagePath)) {
            // We'll let flat-cache do its thing or we can remove the whole folder, but it's okay for these tests to rely on memory cache and fresh runs.
        }
    });

    afterEach(() => {
        mock.reset();
    });

    it('should use lightweight fetch when under 300 images', async () => {
        fetchImageUrlsMock.mock.mockImplementation(async () => {
            return [
                { url: 'http://example.com/1', width: 800, height: 600 },
                { url: 'http://example.com/2', width: 600, height: 800 } // Portrait, should be filtered if LANDSCAPE_ONLY is true
            ];
        });

        const urls = await getAlbumImageUrls('test-album-1');
        assert.strictEqual(urls.length, 1);
        assert.strictEqual(urls[0], 'http://example.com/1');
        assert.strictEqual(fetchImageUrlsMock.mock.callCount(), 1);
        assert.strictEqual(scrapeGooglePhotosMock.mock.callCount(), 0);
    });

    it('should fallback to heavy scraper if lightweight fails', async () => {
        fetchImageUrlsMock.mock.mockImplementation(async () => { throw new Error('Failed'); });
        scrapeGooglePhotosMock.mock.mockImplementation(async () => ['http://example.com/heavy']);

        const urls = await getAlbumImageUrls('test-album-fail');
        assert.strictEqual(urls.length, 1);
        assert.strictEqual(urls[0], 'http://example.com/heavy');
        assert.strictEqual(scrapeGooglePhotosMock.mock.callCount(), 1);
    });

    it('should use cached URLs if available', async () => {
        // The first call will cache 'test-album-cache'
        fetchImageUrlsMock.mock.mockImplementation(async () => [
            { url: 'http://example.com/cached', width: 800, height: 600 }
        ]);

        const urls1 = await getAlbumImageUrls('test-album-cache');
        assert.strictEqual(urls1.length, 1);

        // The second call should hit the cache and not call the fetch again
        const urls2 = await getAlbumImageUrls('test-album-cache');
        assert.strictEqual(urls2.length, 1);
        assert.deepStrictEqual(urls1, urls2);
        
        // fetchImageUrlsMock should only have been called once
        assert.strictEqual(fetchImageUrlsMock.mock.callCount(), 1);
    });
});
