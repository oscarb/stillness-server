import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { processImage, deps } from '../src/processor.js';
import sharp from 'sharp';

describe('Processor Tests', () => {
    let fetchMock: any;

    beforeEach(() => {
        // Mock global fetch
        fetchMock = mock.method(global, 'fetch');
        
        // Mock blocklist cache to avoid mutating real data
        (deps as any).blocklistCache = {
            getKey: mock.fn(() => null),
            setKey: mock.fn(),
            save: mock.fn()
        };
    });

    afterEach(() => {
        mock.reset();
        delete process.env.LANDSCAPE_ONLY;
        delete process.env.IMAGE_WIDTH;
        delete process.env.IMAGE_HEIGHT;
        delete process.env.CROP_STRATEGY;
    });

    it('should identify and skip videos', async () => {
        // First fetch is for isVideo check: returns ok = true (is a video)
        fetchMock.mock.mockImplementation(async (_url: string, options: any) => {
            if (options && options.method === 'HEAD') {
                return { ok: true };
            }
            return { ok: false };
        });

        const result = await processImage('http://example.com/video');
        assert.strictEqual(result, null);
        assert.strictEqual((deps.blocklistCache as any).setKey.mock.callCount(), 1);
        const args = (deps.blocklistCache as any).setKey.mock.calls[0].arguments;
        assert.strictEqual(args[0], 'http://example.com/video');
    });

    it('should skip images already in blocklist', async () => {
        (deps.blocklistCache as any).getKey.mock.mockImplementation(() => true);

        const result = await processImage('http://example.com/blocked');
        assert.strictEqual(result, null);
        assert.strictEqual(fetchMock.mock.callCount(), 0); // shouldn't attempt to fetch
    });

    it('should skip portrait images when LANDSCAPE_ONLY is true', async () => {
        process.env.LANDSCAPE_ONLY = 'true';
        
        // Return not-a-video for HEAD
        // Return a 1x2 image (portrait) for GET
        fetchMock.mock.mockImplementation(async (_url: string, options: any) => {
            if (options && options.method === 'HEAD') {
                return { ok: false };
            }
            
            // Create a 100x200 buffer
            const buffer = await sharp({
                create: { width: 100, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } }
            }).png().toBuffer();
             
            return {
                ok: true,
                arrayBuffer: async () => buffer
            };
        });

        const result = await processImage('http://example.com/portrait');
        assert.strictEqual(result, null);
        assert.strictEqual((deps.blocklistCache as any).setKey.mock.callCount(), 1);
    });

    it('should process landscape images successfully', async () => {
        process.env.LANDSCAPE_ONLY = 'true';
        process.env.IMAGE_WIDTH = '800';
        process.env.IMAGE_HEIGHT = '480';
        
        fetchMock.mock.mockImplementation(async (_url: string, options: any) => {
            if (options && options.method === 'HEAD') {
                return { ok: false };
            }
            
            const buffer = await sharp({
                create: { width: 800, height: 480, channels: 3, background: { r: 255, g: 255, b: 255 } }
            }).png().toBuffer(); 

            return {
                ok: true,
                arrayBuffer: async () => buffer
            };
        });

        const result = await processImage('http://example.com/landscape', { cropStrategy: 'CENTER' });
        assert.notStrictEqual(result, null);
        assert.strictEqual(result!.mimeType, 'image/png');
        assert.ok(result!.data.length > 0);
    });
});
