// Modified getUsersWorkLogsAsEvent function to handle token refresh properly
const jiraAPIController = require('./jiraAPIController');
const configController = require('./configController');
const colorUtils = require('./colorUtils');
const { determineIssueColor } = require('./issueColorHelper');

// Add worklog caching system
const worklogCache = new Map();
const WORKLOG_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Extract text content from a comment field that might be a string or ProseMirror document
 * @param {any} comment - The comment field (string, object, or null)
 * @returns {string} - Extracted text content
 */
function extractCommentText(comment) {
    if (!comment) return '';
    
    // If it's already a string, return it
    if (typeof comment === 'string') {
        return comment;
    }
    
    // If it's a ProseMirror document object, extract text content
    if (comment && typeof comment === 'object' && comment.type === 'doc' && comment.content) {
        return extractProseMirrorText(comment.content);
    }
    
    // If it has a content property, try to extract from it
    if (comment && comment.content) {
        return extractProseMirrorText(comment.content);
    }
    
    // Fallback: try to stringify the object (for debugging)
    console.warn('Unknown comment format:', comment);
    return '';
}

/**
 * Recursively extract text content from ProseMirror document structure
 * @param {Array} content - The content array from ProseMirror
 * @returns {string} - Extracted text content
 */
function extractProseMirrorText(content) {
    if (!Array.isArray(content)) return '';
    
    let text = '';
    
    for (const node of content) {
        if (node.type === 'text' && node.text) {
            text += node.text;
        } else if (node.content && Array.isArray(node.content)) {
            text += extractProseMirrorText(node.content);
        } else if (node.content && typeof node.content === 'string') {
            text += node.content;
        }
        
        // Add line breaks for block-level elements
        if (node.type === 'paragraph' || node.type === 'heading') {
            text += '\n';
        }
    }
    
    return text.trim();
}

// Helper to clear worklog cache when data changes
function clearWorklogCache() {
    console.log('Clearing worklog cache');
    worklogCache.clear();
}

// Export the clearWorklogCache function so it can be used by other modules
exports.clearWorklogCache = clearWorklogCache;

exports.getUsersWorkLogsAsEvent = async function(req, start, end) {
    // Check if this is just a HEAD request for cache validation
    if (!start || !end || req.method === 'HEAD') {
        // For HEAD requests or missing dates, just return an empty array
        console.log('Received request without valid date range or HEAD request, returning empty result');
        return [];
    }
    
    try {
        const settings = await configController.loadConfig(req);
        
        // Validate date parameters
        const filterStartTime = new Date(start);
        const filterEndTime = new Date(end);
        
        // Check if dates are valid
        if (isNaN(filterStartTime.getTime()) || isNaN(filterEndTime.getTime())) {
            console.warn(`Invalid date parameters received: start=${start}, end=${end}`);
            return [];
        }
        
        const formattedStart = filterStartTime.toISOString().split('T')[0];
        const formattedEnd = filterEndTime.toISOString().split('T')[0];
        
        // Generate a cache key based on the date range and project
        const projectKey = req.query.project || 'all';
        const cacheKey = `${formattedStart}_${formattedEnd}_${projectKey}`;
        
        // Check if we have cached data for this date range
        const cached = worklogCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < WORKLOG_CACHE_TTL) {
            console.log(`Using cached worklogs for ${formattedStart} to ${formattedEnd}`);
            return cached.events;
        }

        console.log(`Fetching worklogs for ${formattedStart} to ${formattedEnd}`);
        
        // Enhanced error handling with token refresh
        let result;
        let attempts = 0;
        const maxAttempts = 2;
        
        while (attempts < maxAttempts) {
            try {
                result = await jiraAPIController.searchIssuesWithWorkLogs(req, formattedStart, formattedEnd);
                break; // Success, exit loop
            } catch (error) {
                attempts++;
                console.log(`Attempt ${attempts} failed:`, error.message);
                
                // Check for 401 or auth-related errors
                const isAuthError = error.status === 401 || 
                                  error.code === 401 || 
                                  error.authFailure ||
                                  (error.message && error.message.toLowerCase().includes('unauthorized')) ||
                                  (typeof error === 'object' && error.code === 401);
                
                if (isAuthError && process.env.JIRA_AUTH_TYPE === "OAUTH" && attempts < maxAttempts) {
                    console.log('Authentication error detected, attempting to refresh token...');
                    
                    try {
                        const tokenRefreshed = await jiraAPIController.refreshToken(req);
                        
                        if (tokenRefreshed) {
                            console.log('Token refreshed successfully, retrying request');
                            continue; // Retry the request
                        } else {
                            console.log('Token refresh failed, authentication required');
                            const authError = new Error('Authentication required');
                            authError.authFailure = true;
                            authError.status = 401;
                            throw authError;
                        }
                    } catch (refreshError) {
                        console.error('Token refresh failed:', refreshError);
                        const authError = new Error('Authentication required');
                        authError.authFailure = true;
                        authError.status = 401;
                        throw authError;
                    }
                } else if (isAuthError) {
                    // Auth error but not OAuth or max attempts reached
                    console.log('Authentication failed - redirecting to login required');
                    const authError = new Error('Authentication required');
                    authError.authFailure = true;
                    authError.status = 401;
                    throw authError;
                } else {
                    // Non-auth error, rethrow
                    throw error;
                }
            }
        }
        
        // Validate we have valid result data
        if (!result || !result.issues) {
            console.error('Invalid response from JIRA API:', result);
            // Check if result contains auth error info
            if (result && (result.code === 401 || result.status === 401)) {
                const authError = new Error('Authentication required');
                authError.authFailure = true;
                authError.status = 401;
                throw authError;
            }
            throw new Error('Failed to fetch worklogs from JIRA');
        }
        
        // Process the worklogs
        const events = [];
        
        for (const issue of result.issues) {
            if (!issue.fields || !issue.fields.worklog || !issue.fields.worklog.worklogs) {
                continue;
            }

            // Filter worklogs first
            const filteredWorklogs = issue.fields.worklog.worklogs.filter(worklog => {
                if (process.env.JIRA_BASIC_AUTH_USERNAME) {
                    return worklog.author.emailAddress === process.env.JIRA_BASIC_AUTH_USERNAME;
                }
                if (process.env.JIRA_AUTH_TYPE === "OAUTH") {
                    return worklog.author.emailAddress === req.user.email;
                }
                return true;
            });

            // Only process issues with matching worklogs
            if (filteredWorklogs.length === 0) continue;

            // Get issue color from settings or use default
            const issueData = {
                issueId: issue.id,
                issueKey: issue.key,
                issueType: issue.fields.issuetype?.name || 'unknown'
            };
            
            // Process each worklog
            for (const worklog of filteredWorklogs) {
                try {
                    // Only process worklogs within our date range
                    const started = new Date(worklog.started);
                    if (started < filterStartTime || started > filterEndTime) {
                        continue;
                    }

                    // Get the worklog duration
                    const durationSeconds = worklog.timeSpentSeconds;
                    
                    // Calculate end time by adding the duration to the start time
                    const endTime = new Date(started.getTime() + (durationSeconds * 1000));

                    // Determine issue color
                    let issueKeyColor = null;


                    
                    // Check for color in worklog comment first (allows per-worklog color override)
                    const commentText = extractCommentText(worklog.comment);
                    if (commentText && commentText.includes('color:')) {
                        const colorMatch = commentText.match(/color:\s*([#0-9A-Fa-f]+)/);
                        if (colorMatch && colorMatch[1]) {
                            issueKeyColor = colorMatch[1];
                        }
                    }
                    
                    // If no color in comment, determine from issue settings
                    if (!issueKeyColor) {
                        // Special case: If this request is coming after a color change,
                        // bypass the cache and use the settings value directly
                        if (req.query._forceRefresh || req.query._clearWorklogCache || req.query._forceClearCache) {
                            // Try to get color directly from settings first
                            const issueKey = issue.key.toLowerCase();
                            if (settings && settings.issueColors && settings.issueColors[issueKey]) {
                                // Use the settings value directly
                                issueKeyColor = settings.issueColors[issueKey];
                                console.log(`Using direct color from settings for ${issueKey}: ${issueKeyColor}`);
                            } else {
                                // Fall back to normal determination
                                issueKeyColor = await determineIssueColor(settings, req, {
                                    issueId: issue.id,
                                    issueKey: issue.key,
                                    issueType: issue.fields.issuetype?.name
                                }, null);
                            }
                        } else {
                            // Normal flow
                            issueKeyColor = await determineIssueColor(settings, req, {
                                issueId: issue.id,
                                issueKey: issue.key,
                                issueType: issue.fields.issuetype?.name
                            }, null);
                        }
                    }

                    // Create the calendar event
                    const event = {
                        title: `${issue.key}: ${issue.fields.summary}`,
                        start: started.toISOString(),
                        end: endTime.toISOString(),
                        id: worklog.id,
                        backgroundColor: issueKeyColor,
                        borderColor: issueKeyColor,
                        textColor: issueKeyColor === '#ffffff' || issueKeyColor === '#FFFFFF' ? '#000000' : undefined,
                        extendedProps: {
                            worklogId: worklog.id,
                            issueId: issue.id,
                            issueKey: issue.key,
                            issueSummary: issue.fields.summary,
                            comment: extractCommentText(worklog.comment),
                            timeSpent: worklog.timeSpent,
                            timeSpentSeconds: worklog.timeSpentSeconds,
                            author: worklog.author.displayName,
                            issueType: issue.fields.issuetype?.name,
                            issueStatus: issue.fields.status?.name,
                            issueColor: issueKeyColor,
                            issueTypeIcon: settings.showIssueTypeIcons && issue.fields.issuetype && issue.fields.issuetype.id ? `/avatars/issuetype/${issue.fields.issuetype.id}?size=small` : null,
                            showIssueTypeIcons: settings.showIssueTypeIcons !== false
                        }
                    };

                    events.push(event);
                } catch (worklogError) {
                    console.error(`Error processing worklog ${worklog.id}:`, worklogError);
                    // Continue with other worklogs
                }
            }
        }

        // Cache the result
        worklogCache.set(cacheKey, { 
            events,
            timestamp: Date.now()
        });

        return events;
    } catch (error) {
        console.error('Error in getUsersWorkLogsAsEvent:', error);
        
        // Enhanced auth error detection and propagation
        if (error.authFailure || error.status === 401 || error.code === 401 || 
            (error.message && error.message.toLowerCase().includes('unauthorized'))) {
            console.log('Propagating authentication error');
            const authError = new Error('Authentication required');
            authError.authFailure = true;
            authError.status = 401;
            throw authError;
        }
        
        return []; // Return empty array for other errors
    }
};
