export const getConfig = () => {
    const defaultMins = 60;
    const parsedMins = parseInt(process.env.CACHE_TTL_MINUTES || '', 10);
    const cacheTtlMinutes = isNaN(parsedMins) ? defaultMins : parsedMins;

    return {
        width: parseInt(process.env.IMAGE_WIDTH || "800", 10),
        height: parseInt(process.env.IMAGE_HEIGHT || "480", 10),
        ditherMode: (process.env.DITHER_MODE || "STUCKI").toUpperCase(),
        cropStrategy: (process.env.CROP_STRATEGY || "CENTER").toUpperCase(),
        landscapeOnly: process.env.LANDSCAPE_ONLY !== 'false',
        cacheTtlMinutes
    };
};
