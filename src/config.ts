export const isLandscapeOnly = () => process.env.LANDSCAPE_ONLY !== 'false';
export const getCacheTtlMinutes = () => {
    const defaultMins = 60;
    const parsed = parseInt(process.env.CACHE_TTL_MINUTES || '', 10);
    return isNaN(parsed) ? defaultMins : parsed;
};
