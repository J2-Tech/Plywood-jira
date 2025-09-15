/**
 * A standalone helper module for determining issue colors
 */
const colorUtils = require('./colorUtils');

/**
 * Determine the color of an issue
 * @param {Object} settings - The user settings
 * @param {Object} req - The request object
 * @param {Object} issue - The issue object
 * @param {Map} pendingColorRequests - A map of pending color requests
 * @returns {Promise<string>} The determined color
 */
exports.determineIssueColor = async function(settings, req, issue, pendingColorRequests) {
    const defaultColor = process.env.DEFAULT_ISSUE_COLOR || '#2a75fe';
    
    // Handle case where issueKey is undefined
    if (!issue || !issue.issueKey) {
        log.warn('determineIssueColor called with invalid issue object');
        return defaultColor;
    }
    
    const issueKey = issue.issueKey.toLowerCase();
    
    // First check user settings directly (highest priority, bypassing cache)
    // This ensures we get the latest color right after a save
    if (settings && settings.issueColors && settings.issueColors[issueKey]) {
        const settingsColor = settings.issueColors[issueKey];
        // Update cache with this color
        return colorUtils.cacheIssueColor(issueKey, settingsColor);
    }
    
    // Then check in-memory cache for faster response
    const cachedColor = colorUtils.getIssueColorFromCache(issueKey);
    if (cachedColor) {
        return cachedColor;
    }
    
    // If there's already a pending request for this issue, wait for it
    if (pendingColorRequests && pendingColorRequests.has(issueKey)) {
        try {
            const colorPromise = pendingColorRequests.get(issueKey);
            return await colorPromise;
        } catch (error) {
            log.error(`Error waiting for pending color request for ${issueKey}:`, error);
        }
    }
    
    // Create a promise for this color request
    const colorPromise = (async () => {
        try {
            // 1. First priority: Check user-defined issue colors (from settings)
            let color = settings && settings.issueColors ? settings.issueColors[issueKey] : null;
            if (color) {
                return colorUtils.cacheIssueColor(issueKey, color);
            }
            
            // 2. Second priority: Check issue type colors (faster than API calls)
            if (issue.issueType) {
                const issueTypeLower = issue.issueType.toLowerCase();
                // Check user settings for this issue type
                color = settings && settings.issueColors ? settings.issueColors[issueTypeLower] : null;
                if (color) {
                    return colorUtils.cacheIssueColor(issueKey, color);
                }
                
                // Check default type colors
                color = colorUtils.getIssueTypeColor(issueTypeLower);
                if (color) {
                    return colorUtils.cacheIssueColor(issueKey, color);
                }
            }
              // 3. As a last resort, look up parent issue color (more expensive)
            try {
                // Skip parent issue lookup to avoid circular dependency
                // We'll just use the default color in this case
                log.debug(`Using default color for ${issueKey} to avoid circular dependency`);
                
                // This is commented out to avoid circular dependencies with jiraAPIController
                // const jiraAPIController = require('./jiraAPIController');
                // const issueDetails = await jiraAPIController.getIssue(req, issue.issueId);
                // if (issueDetails && issueDetails.fields && issueDetails.fields.parent) {
                //     const parentIssueKey = issueDetails.fields.parent.key.toLowerCase();
                //     color = settings && settings.issueColors ? settings.issueColors[parentIssueKey] : null;
                //     if (color) {
                //         return colorUtils.cacheIssueColor(issueKey, color);
                //     }
                // }
            } catch (error) {
                log.error(`Error getting parent issue for ${issueKey}:`, error);
                // Failed to get parent - fall through to default
            }
            
            // Return default color if nothing else matched
            return colorUtils.cacheIssueColor(issueKey, defaultColor);
        } finally {
            // Clean up pending request
            if (pendingColorRequests) {
                pendingColorRequests.delete(issueKey);
            }
        }
    })();
    
    // Store the promise so other requests can wait on it
    if (pendingColorRequests) {
        pendingColorRequests.set(issueKey, colorPromise);
    }
    
    return colorPromise;
};
