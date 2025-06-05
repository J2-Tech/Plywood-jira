/**
 * Utility functions for handling Jira issue colors
 */

// Color mapping for Jira standard colors
const JIRA_COLOR_MAP = {
    'purple': '#8777D9', 
    'blue': '#2684FF',
    'green': '#57D9A3',
    'teal': '#00C7E6',
    'yellow': '#FFC400',
    'orange': '#FF7452',
    'grey': '#6B778C',
    'dark_purple': '#5243AA',
    'dark_blue': '#0052CC',
    'dark_green': '#00875A',
    'dark_teal': '#00A3BF',
    'dark_yellow': '#FF991F',
    'dark_orange': '#DE350B',
    'dark_grey': '#253858'
};

// Map of issue types to default colors
const ISSUE_TYPE_COLORS = {
    'bug': '#E5493A',
    'task': '#4FADE6',
    'story': '#65BA43',
    'epic': '#904EE2',
    'subtask': '#4FADE6'
};

// Cache for issue colors with improved performance
const issueColorCache = new Map();
const COLOR_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get a color from the Jira color name
 * @param {string} jiraColor - The Jira color name
 * @returns {string} The hex color value
 */
exports.mapJiraColorToHex = function(jiraColor) {
    return JIRA_COLOR_MAP[jiraColor] || jiraColor;
};

/**
 * Get a color for an issue type
 * @param {string} issueType - The issue type name
 * @returns {string|null} The hex color value or null if not found
 */
exports.getIssueTypeColor = function(issueType) {
    const issueTypeLower = issueType.toLowerCase();
    return ISSUE_TYPE_COLORS[issueTypeLower] || null;
};

/**
 * Get a cached issue color or store a new one
 * @param {string} issueKey - The issue key
 * @param {string} color - The color to cache
 * @returns {string} The color (same as input)
 */
exports.cacheIssueColor = function(issueKey, color) {
    // Safety checks
    if (!issueKey || !color) {
        console.warn(`Invalid issueKey or color passed to cacheIssueColor: ${issueKey}, ${color}`);
        return color;
    }
    
    const issueKeyLower = issueKey.toLowerCase();
    const cacheKey = `${issueKeyLower}_color`;
    
    // Check if the color is already cached with the same value
    const existing = issueColorCache.get(cacheKey);
    if (existing && existing.color === color) {
        // Just update the timestamp to extend the TTL
        existing.timestamp = Date.now();
        console.log(`Extended TTL for existing color cache: ${issueKey} -> ${color}`);
        return color;
    }
    
    // Store the new color with current timestamp
    issueColorCache.set(cacheKey, { 
        color, 
        timestamp: Date.now()
    });
    
    console.log(`Cached new color: ${issueKey} -> ${color}`);
    return color;
};

/**
 * Get a color from the cache if it exists and is valid
 * @param {string} issueKey - The issue key
 * @param {boolean} [ignoreTimestamp=false] - Whether to ignore the timestamp check
 * @returns {string|null} The color or null if not cached or expired
 */
exports.getIssueColorFromCache = function(issueKey, ignoreTimestamp = false) {
    // Make sure we have a valid issue key
    if (!issueKey) return null;
    
    const issueKeyLower = issueKey.toLowerCase();
    const cacheKey = `${issueKeyLower}_color`;
    const cachedColor = issueColorCache.get(cacheKey);
    
    // If we have a cached color and either we're ignoring the timestamp or it's not expired
    if (cachedColor && (ignoreTimestamp || Date.now() - cachedColor.timestamp < COLOR_CACHE_TTL)) {
        console.log(`Using cached color for ${issueKey}: ${cachedColor.color}`);
        return cachedColor.color;
    }
    
    // Remove the expired or invalid cache entry
    if (cachedColor) {
        issueColorCache.delete(cacheKey);
        console.log(`Removed expired cache entry for ${issueKey}`);
    }
    
    return null;
};

/**
 * Clear the color cache
 */
exports.clearColorCache = function() {
    // Log cache contents before clearing for debugging
    console.log('Clearing color cache - current entries:', Array.from(issueColorCache.keys()));
    
    // Clear the cache
    issueColorCache.clear();
    
    // Verify it's empty
    console.log('Color cache cleared, entries now:', issueColorCache.size);
};

/**
 * Clear the color cache for a specific issue key
 * @param {string} issueKey - The issue key to clear from cache
 */
exports.clearIssueColorFromCache = function(issueKey) {
    const issueKeyLower = issueKey.toLowerCase();
    const cacheKey = `${issueKeyLower}_color`;
    if (issueColorCache.has(cacheKey)) {
        issueColorCache.delete(cacheKey);
        console.log(`Cleared color cache for issue ${issueKey}`);
        return true;
    }
    return false;
};

// Export the constants
exports.JIRA_COLOR_MAP = JIRA_COLOR_MAP;
exports.ISSUE_TYPE_COLORS = ISSUE_TYPE_COLORS;
