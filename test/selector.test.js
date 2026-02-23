import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { selectAndProcessNextImage, deps } from '../src/image-selector.js';

describe('Image Selector Edge Cases Tests', () => {
    let processImageMock;
    let isBlocklistedMock;

    beforeEach(() => {
        processImageMock = mock.fn();
        isBlocklistedMock = mock.fn();
        
        deps.processImage = processImageMock;
        deps.isBlocklisted = isBlocklistedMock;
    });

    afterEach(() => {
        mock.reset();
    });

    it('should handle empty album', async () => {
        const result = await selectAndProcessNextImage([], null, false);
        assert.strictEqual(result, null);
    });

    it('should handle album with only blocklisted/video URLs', async () => {
        // Return true (blocklisted) for any url
        isBlocklistedMock.mock.mockImplementation(() => true);
        
        const result = await selectAndProcessNextImage(['http://1.com', 'http://2.com'], null, false);
        
        assert.strictEqual(result, null);
        assert.strictEqual(processImageMock.mock.callCount(), 0);
    });

    it('should process the only valid image even if it is the lastProcessedUrl', async () => {
        isBlocklistedMock.mock.mockImplementation(() => false); // valid
        processImageMock.mock.mockImplementation(async () => ({ data: Buffer.from('test') }));

        const validUrl = 'http://valid.com';
        // Set lastProcessedUrl to be the same as the only valid url
        const result = await selectAndProcessNextImage([validUrl], validUrl, false);
        
        // Ensure it doesn't skip it and return null
        assert.notStrictEqual(result, null);
        assert.strictEqual(result.url, validUrl);
        assert.strictEqual(processImageMock.mock.callCount(), 1);
    });

    it('should try blocklisted/failing URLs and eventually return null if all active tests fail', async () => {
        // Blocklist traps one immediately
        isBlocklistedMock.mock.mockImplementation((url) => url === 'http://bad.com');
        
        // Simulating the actual processImage failing inside the retries (e.g., video caught late)
        processImageMock.mock.mockImplementation(async () => null); 

        const result = await selectAndProcessNextImage(['http://bad.com', 'http://valid1.com', 'http://valid2.com'], null, false);
        
        assert.strictEqual(result, null);
        assert.strictEqual(processImageMock.mock.callCount(), 2); // only valid1.com and valid2.com attempted
    });

    it('should skip lastProcessedUrl when there are multiple valid URLs to pick from', async () => {
        isBlocklistedMock.mock.mockImplementation(() => false);
        processImageMock.mock.mockImplementation(async () => ({ data: Buffer.from('test') }));

        const prevUrl = 'http://prev.com';
        const newUrl = 'http://new.com';

        const result = await selectAndProcessNextImage([prevUrl, newUrl], prevUrl, false);
        
        assert.notStrictEqual(result, null);
        assert.strictEqual(result.url, newUrl); // It must pick the new one, since they both are valid
    });
});
