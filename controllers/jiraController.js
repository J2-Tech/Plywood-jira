const jiraAPIController = require('./jiraAPIController');
const configController = require('./configController');
const colorUtils = require('./colorUtils');
const dayjs = require('dayjs');
const path = require('path');
const { log } = require('../utils/logger');

// Import functionality from separate modules
const getSingleEventModule = require('./getSingleEvent');
const getUsersWorkLogsModule = require('./getUsersWorkLogsAsEvent');

// Import the determineIssueColor function from the helper
const { determineIssueColor } = require('./issueColorHelper');

// Re-export getSingleEvent and getUsersWorkLogsAsEvent functions
exports.getSingleEvent = getSingleEventModule.getSingleEvent;
exports.getUsersWorkLogsAsEvent = getUsersWorkLogsModule.getUsersWorkLogsAsEvent;
exports.clearWorklogCache = getUsersWorkLogsModule.clearWorklogCache;
exports.clearWorklogCacheForDateRange = getUsersWorkLogsModule.clearWorklogCacheForDateRange;

// Export determineIssueColor function with improved wrapper
exports.determineIssueColor = async function(req, issueKey) {
    try {
        const settings = await configController.loadConfig(req);
        const issueData = {
            issueKey: issueKey,
            issueId: null, // We don't have the ID at this point
            issueType: null // We'll determine this later if needed
        };
        
        return await determineIssueColor(settings, req, issueData, null);
    } catch (error) {
        return '#2a75fe'; // Default color
    }
};

// Track in-flight requests to prevent duplicate color API calls
const pendingColorRequests = new Map();

// Helper function to append project filter to JQL
function appendProjectFilter(jql, projectKey) {
    if (projectKey && projectKey !== 'all') {
        return jql ? `project = "${projectKey}" AND (${jql})` : `project = "${projectKey}"`;
    }
    return jql;
}

// Exporting missing functions that are being called from routes/index.js
// Note: start and end parameters are ignored - we search all issues regardless of date
// This allows users to log time on any issue, including old ones
exports.suggestIssues = function(req, start, end, query) {
    var query = req.query.query;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        log.warn('suggestIssues called with empty or invalid query');
        return Promise.resolve([]);
    }
    
    var promises = [];

    // Try exact key match first - handle case sensitivity
    // Jira keys are typically uppercase, but users might search in lowercase
    // Try multiple variations: original, uppercase, and case-insensitive
    const queryUpper = query.toUpperCase();
    const isPotentialKey = /^[A-Z0-9]+-[0-9]+$/i.test(query.trim());
    
    if (isPotentialKey) {
        // If it looks like an issue key, try multiple case variations
        const keyVariations = [];
        if (query !== queryUpper) {
            keyVariations.push(queryUpper); // Try uppercase version
        }
        keyVariations.push(query); // Try original
        if (query !== query.toLowerCase()) {
            keyVariations.push(query.toLowerCase()); // Try lowercase version
        }
        
        // Try each variation and combine results
        const keyPromises = keyVariations.map(keyVar => {
            const keyJQL = 'key = "' + keyVar + '"';
            return jiraAPIController.searchIssues(req, keyJQL)
                .then(result => {
                    return result;
                })
                .catch(error => {
                    log.warn(`Key match search failed for "${keyVar}":`, error.message || error);
                    if (error.stack) log.debug('Error stack:', error.stack);
                    return { issues: [] };
                });
        });
        
        promises.push(
            Promise.all(keyPromises).then(results => {
                // Combine all results and deduplicate by issue key
                const allIssues = [];
                const seenKeys = new Set();
                
                results.forEach((result) => {
                    if (result && result.issues && Array.isArray(result.issues)) {
                        result.issues.forEach(issue => {
                            const issueKey = issue && issue.key ? issue.key : null;
                            if (issueKey && !seenKeys.has(issueKey)) {
                                seenKeys.add(issueKey);
                                allIssues.push(issue);
                            }
                        });
                    }
                });
                
                const totalFound = allIssues.length;
                if (totalFound === 0) {
                    log.warn(`No issues found with key match for "${query}" (tried: ${keyVariations.join(', ')})`);
                }
                
                return { issues: allIssues };
            }).catch(error => {
                log.error(`Error combining key match results for "${query}":`, error);
                return { issues: [] };
            })
        );
    } else {
        // If it doesn't look like a key, try the original query as-is
        const keyJQL = 'key = "' + query + '"';
        promises.push(
            jiraAPIController.searchIssues(req, keyJQL)
                .then(result => {
                    return result;
                })
                .catch(error => {
                    log.warn(`Exact key match search failed for "${query}":`, error.message || error);
                    if (error.stack) log.debug('Error stack:', error.stack);
                    return { issues: [] }; // Return empty result instead of failing
                })
        );
    }

    // Then try text search
    promises.push(
        jiraAPIController.suggestIssues(req, query)
            .then(result => {
                return result;
            })
            .catch(error => {
                log.warn(`Text search failed for "${query}":`, error.message || error);
                if (error.stack) log.debug('Error stack:', error.stack);
                return { sections: [] }; // Return empty result instead of failing
            })
    );

    return Promise.all(promises).then(results => {
        var issues = [];

        // Add exact matches first
        if (results[0] && results[0].issues) {
            const mapped = results[0].issues.map(mapIssuesFunction).filter(issue => issue !== null);
            const filteredCount = results[0].issues.length - mapped.length;
            if (filteredCount > 0) {
                log.warn(`Filtered out ${filteredCount} invalid issue(s) from exact key match. Sample filtered issue:`, results[0].issues.find(issue => !issue || !issue.key || !issue.id));
            }
            issues = issues.concat(mapped);
        }

        // Then add suggestions
        if (results[1] && results[1].sections) {
            results[1].sections.forEach(section => {
                if (section.issues) {
                    const mappedIssues = section.issues.map(mapIssuesFunction).filter(issue => issue !== null);
                    const filteredCount = section.issues.length - mappedIssues.length;
                    if (filteredCount > 0) {
                        log.warn(`Filtered out ${filteredCount} invalid issue(s) from section "${section.label || 'unknown'}". Sample filtered issue:`, section.issues.find(issue => !issue || !issue.key || !issue.id));
                    }
                    // Filter out duplicates
                    mappedIssues.forEach(issue => {
                        if (!issues.some(existing => existing && existing.key === issue.key)) {
                            issues.push(issue);
                        }
                    });
                }
            });
        }

        if (issues.length === 0) {
            log.warn(`No issues found for query "${query}" - both search methods may have failed or returned no results`);
        }

        return issues;
    }).catch(error => {
        log.error(`Unexpected error in suggestIssues for query "${query}":`, error);
        if (error.stack) log.error('Error stack:', error.stack);
        return []; // Return empty array instead of throwing
    });
};

// Helper function for mapping issues
// Handles missing fields gracefully to avoid filtering out valid issues
const mapIssuesFunction = issue => {
    if (!issue) {
        log.warn('mapIssuesFunction: issue is undefined or null');
        return null;
    }
    
    // Ensure fields object exists (even if empty) to avoid errors
    const fields = issue.fields || {};
    
    return {
        key: issue.key || 'UNKNOWN',
        summary: fields.summary || '(no summary)',
        issueId: issue.id,
        subtaskKey: fields.parent && fields.parent.key ? fields.parent.key : null,
        issueType: fields.issuetype && fields.issuetype.name ? fields.issuetype.name : 'unknown',
        issueTypeIcon: fields.issuetype && fields.issuetype.iconUrl ? fields.issuetype.iconUrl : null
    };
};

exports.updateWorkLog = async function(req, issueId, worklogId, comment, startTime, endTime, issueKeyColor) {
    log.info(`Updating worklog ${worklogId} for issue ${issueId}`);
    
    try {
        // Validate inputs
        if (!issueId || !worklogId || !startTime || !endTime) {
            throw new Error('Missing required parameters');
        }
        
        // Calculate duration in seconds
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error('Invalid date format');
        }
        
        if (endDate <= startDate) {
            throw new Error('End time must be after start time');
        }
        
        const durationSeconds = Math.round((endDate.getTime() - startDate.getTime()) / 1000);
        
        if (durationSeconds < 60) {
            throw new Error('Worklog must be at least 1 minute long');
        }
        
        const safeComment = comment || '';
        
        // Update the worklog
        const result = await jiraAPIController.updateWorkLog(req, issueId, worklogId, startDate, durationSeconds, safeComment, issueKeyColor);
        
        if (result.errorMessages && result.errorMessages.length > 0) {
            throw new Error(result.errorMessages.join(', '));
        }
        
        if (result.errors) {
            throw new Error(Object.values(result.errors).join(', '));
        }
        
        // Only clear worklog cache selectively - don't force full refresh
        exports.clearWorklogCache();
        
        log.info(`Worklog ${worklogId} updated successfully`);
        
        // Return additional data for client-side optimistic updates
        return {
            ...result,
            issueId,
            worklogId,
            startTime: startDate.toISOString(),
            endTime: endDate.toISOString(),
            comment: safeComment,
            issueKeyColor,
            timeSpentSeconds: durationSeconds
        };
    } catch (error) {
        log.error('Error updating worklog:', error);
        throw error;
    }
};

function calculateContrastingTextColor(backgroundColor) {
    if (!backgroundColor) return '#000000';
    
    var hex = backgroundColor.replace('#', '');
    
    var r = parseInt(hex.substr(0, 2), 16);
    var g = parseInt(hex.substr(2, 2), 16);
    var b = parseInt(hex.substr(4, 2), 16);
    
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

exports.createWorkLog = async function(req, issueId, started, ended, comment, issueKeyColor) {
    log.info('Creating worklog for issue ' + issueId);
    
    try {
        if (!issueId || !started || !ended) {
            throw new Error('Missing required parameters');
        }
        
        const startDate = new Date(started);
        const endDate = new Date(ended);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error('Invalid date format');
        }
        
        if (endDate <= startDate) {
            throw new Error('End time must be after start time');
        }
        
        const durationSeconds = Math.round((endDate.getTime() - startDate.getTime()) / 1000);
        
        if (durationSeconds < 60) {
            throw new Error('Worklog must be at least 1 minute long');
        }
        
        const safeComment = comment || '';
        const issueKey = req.body.issueKey;
        
        // Determine color with improved logic
        let color = issueKeyColor || '#2a75fe';
        
        if (issueKey) {
            try {
                const determinedColor = await exports.determineIssueColor(req, issueKey);
                if (determinedColor) {
                    color = determinedColor;
                    log.debug('Using determined color ' + color + ' for issue ' + issueKey);
                }
            } catch (error) {
                log.warn('Could not determine color for issue ' + issueKey + ', using default:', error);
            }
        }
        
        const textColor = calculateContrastingTextColor(color);
        
        // Create the worklog
        const result = await jiraAPIController.createWorkLog(req, issueId, startDate, durationSeconds, safeComment, color);
        
        
        if (result.errorMessages && result.errorMessages.length > 0) {
            throw new Error(result.errorMessages.join(', '));
        }
        
        if (result.errors) {
            throw new Error(Object.values(result.errors).join(', '));
        }
        
        // Clear cache to ensure fresh data on next load
        exports.clearWorklogCache();
        
        // Also clear cache for the specific date range to ensure immediate refresh
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        exports.clearWorklogCacheForDateRange(startDateStr, endDateStr);
        
        // Try to get issue details for better response data
        let issueDetails = null;
        try {
            issueDetails = await jiraAPIController.getIssue(req, issueId);
        } catch (error) {
            log.warn('Could not fetch issue details for response:', error);
        }
        
        const responseData = {
            id: result.id,
            issueId: issueId,
            issueKey: issueKey || (issueDetails ? issueDetails.key : null),
            issueSummary: issueDetails ? issueDetails.fields.summary : null,
            title: (issueKey || 'Unknown') + (issueDetails ? ': ' + issueDetails.fields.summary : ''),
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            startTime: startDate.toISOString(),
            endTime: endDate.toISOString(),
            comment: safeComment,
            backgroundColor: color,
            borderColor: color,
            textColor: textColor,
            color: color,
            timeSpentSeconds: durationSeconds,
            author: result.author || 'Current User',
            classNames: ['worklog-event'],
            extendedProps: {
                issueId: issueId,
                issueKey: issueKey,
                comment: safeComment,
                timeSpentSeconds: durationSeconds,
                backgroundColor: color,
                textColor: textColor,
                calculatedTextColor: textColor
            }
        };
        
        if (issueDetails && issueDetails.fields.issuetype && issueDetails.fields.issuetype.id) {
            responseData.issueTypeIcon = '/avatars/issuetype/' + issueDetails.fields.issuetype.id + '?size=small';
            responseData.issueType = issueDetails.fields.issuetype.name;
            responseData.extendedProps.issueType = issueDetails.fields.issuetype.name;
            responseData.extendedProps.issueTypeIcon = responseData.issueTypeIcon;
        }
        
        log.info('Worklog created successfully with id: ' + result.id + ' for issue: ' + issueKey);
        
        return responseData;
        
    } catch (error) {
        log.error('Error creating worklog:', error);
        throw error;
    }
};

/**
 * Calculate the luminance of a color
 * @param {string} color - Color in hex format (e.g., "#FF0000")
 * @returns {number} - Luminance value between 0 and 1
 */
function calculateLuminance(color) {
    // Remove the hash if present
    const hex = color.replace('#', '');
    
    // Parse RGB values
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    // Apply gamma correction
    const sR = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const sG = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const sB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    
    // Calculate luminance
    return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

/**
 * Calculate contrast ratio between two colors
 * @param {number} luminance1 - Luminance of first color
 * @param {number} luminance2 - Luminance of second color
 * @returns {number} - Contrast ratio
 */
function calculateContrastRatio(luminance1, luminance2) {
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calculate contrasting text color (white or black) for a given background color
 * @param {string} backgroundColor - Background color in hex format
 * @returns {string} - Either "#FFFFFF" for white text or "#000000" for black text
 */
function calculateContrastingTextColor(backgroundColor) {
    if (!backgroundColor) return '#000000';
    
    // Ensure we have a valid hex color
    if (!backgroundColor.startsWith('#') || backgroundColor.length !== 7) {
        return '#000000'; // Default to black for invalid colors
    }
    
    try {
        const backgroundLuminance = calculateLuminance(backgroundColor);
        const whiteLuminance = 1.0; // White luminance
        const blackLuminance = 0.0; // Black luminance
        
        const contrastWithWhite = calculateContrastRatio(backgroundLuminance, whiteLuminance);
        const contrastWithBlack = calculateContrastRatio(backgroundLuminance, blackLuminance);
        
        // Choose the color with better contrast (WCAG recommends minimum 4.5:1 for normal text)
        return contrastWithWhite > contrastWithBlack ? '#FFFFFF' : '#000000';
    } catch (error) {
        log.warn('Error calculating contrasting text color for', backgroundColor, error);
        return '#000000'; // Default to black on error
    }
}

exports.deleteWorkLog = function(req, issueId, worklogId) {
    return jiraAPIController.deleteWorkLog(req, issueId, worklogId);
};

exports.getIssue = function(req, issueId) {
    return jiraAPIController.getIssue(req, issueId);
};

exports.getWorkLog = function(req, issueId, worklogId) {
    return jiraAPIController.getWorkLog(req, issueId, worklogId);
};

exports.getWorklogStats = async function(req, start, end, projectFilter, options = {}) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    const formattedStart = startDate.toISOString().split('T')[0];
    const formattedEnd = endDate.toISOString().split('T')[0];
    
    // Build ONLY extra JQL for issue filters (no dates/project/order here)
    const { issues = [], includeChildren = false, commentsOnly = false } = options;

    let extraClauses = [];
    if (Array.isArray(issues) && issues.length > 0) {
        // Only allow well-formed Jira keys and quote them for JQL (ABC-123)
        const keys = issues.map(k => k.trim()).filter(Boolean).filter(k => /^[A-Z][A-Z0-9_]+-\d+$/i.test(k));
        if (keys.length > 0) {
            const quotedKeys = keys.map(k => '"'+k+'"');
            const issuesList = quotedKeys.join(',');
            const base = [`issue in (${issuesList})`];
            if (includeChildren) {
                base.push(`parent in (${issuesList})`);
                base.push(`"Epic Link" in (${issuesList})`);
            }
            extraClauses.push(`(${base.join(' OR ')})`);
        }
    }

    const jql = extraClauses.join(' AND ');
    
    const result = await jiraAPIController.searchIssuesWithWorkLogs(req, formattedStart, formattedEnd, jql);
    
    // Group worklogs by issue
    // Prepare end-of-day for inclusive range filtering
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    const stats = result.issues.map(issue => {
        // Handle missing fields gracefully
        const fields = issue.fields || {};
        const worklogData = fields.worklog || {};
        const worklogs = worklogData.worklogs || [];
        
        // Filter to only include worklogs from the current user
        const userWorklogs = worklogs.filter(worklog => {
            if (process.env.JIRA_BASIC_AUTH_USERNAME) {
                return worklog.author && worklog.author.emailAddress === process.env.JIRA_BASIC_AUTH_USERNAME;
            }
            if (process.env.JIRA_AUTH_TYPE === "OAUTH") {
                return worklog.author && worklog.author.emailAddress === req.user.email;
            }
            return true;
        });

        // Restrict to requested date range using worklog.started timestamp
        const rangedWorklogs = userWorklogs.filter(w => {
            try {
                const started = new Date(w.started || w.created);
                return started >= startDate && started <= endOfDay;
            } catch (_) {
                return false;
            }
        });

        // Optionally keep only worklogs with comments
        const filteredWorklogs = commentsOnly
            ? userWorklogs.filter(w => {
                const c = w.comment;
                if (!c) return false;
                if (typeof c === 'string') return c.trim().length > 0;
                try {
                    // Minimal check for ADF presence of any text nodes
                    const asText = JSON.stringify(c);
                    return /\btext\b/i.test(asText);
                } catch (_) {
                    return false;
                }
            })
            : rangedWorklogs;

        const totalTime = filteredWorklogs.reduce((acc, worklog) => 
            acc + worklog.timeSpentSeconds, 0);
            
        const comments = filteredWorklogs
            .map(worklog => ({
                author: worklog.author.displayName,
                comment: worklog.comment || '',
                created: worklog.created,
                timeSpent: worklog.timeSpentSeconds
            }))
            .sort((a, b) => b.timeSpent - a.timeSpent);

        // Try to identify parent relationships: parent key (sub-tasks) or epic link
        let parentKey = null;
        try {
            if (fields.parent && fields.parent.key) {
                parentKey = fields.parent.key;
            } else if (fields.customfield_10017) {
                // Epic Link can be an object with key or a string key depending on site/config
                const epicField = fields.customfield_10017;
                if (typeof epicField === 'string') parentKey = epicField;
                else if (epicField && typeof epicField === 'object' && epicField.key) parentKey = epicField.key;
            }
        } catch (_) {}

        return {
            key: issue.key || 'UNKNOWN',
            summary: fields.summary || '(no summary)',
            totalTimeSpent: totalTime,
            status: fields.status && fields.status.name ? fields.status.name : 'Unknown',
            type: fields.issuetype && fields.issuetype.name ? fields.issuetype.name : 'unknown',
            comments: comments,
            parentKey: parentKey
        };
    })
    // Filter out issues with no time spent by current user
    .filter(issue => issue.totalTimeSpent > 0);

    stats.sort((a, b) => b.totalTimeSpent - a.totalTimeSpent);
    return stats;
};

/**
 * Force refresh issue colors by clearing all caches
 * @param {Object} req - The request object
 * @returns {Object} The refreshed settings
 */
exports.forceRefreshIssueColors = async function(req) {
    log.info('Force refreshing all issue colors and clearing ALL caches');
    
    // Clear color caches
    colorUtils.clearColorCache();
    
    // Clear settings cache and force reload
    configController.clearSettingsCache(req);
    
    // IMPORTANT: Clear the worklog cache to force a fresh load with updated colors
    exports.clearWorklogCache();
    log.info('Worklog cache cleared - will force fresh data load on next request');
    
    // Force load settings from disk
    const settings = await configController.loadConfig(req, true);
    
    // Reinitialize the color cache with current settings
    if (settings && settings.issueColors) {
        Object.entries(settings.issueColors).forEach(([key, color]) => {
            colorUtils.cacheIssueColor(key, color);
        });
        log.info(`Re-initialized color cache with ${Object.keys(settings.issueColors).length} colors from settings`);
    }
    
    return settings;
};

/**
 * Update all worklogs for a specific issue to use the new issue color
 * This ensures consistency when an issue color is changed
 * @param {Object} req - The request object
 * @param {string} issueKey - The issue key
 * @param {string} newColor - The new color to apply
 */
// Update updateWorklogsColorForIssue to handle issue-based colors
async function updateWorklogsColorForIssue(req, issueKey, newColor) {
    try {
        log.debug(`Color system now uses issue-based configuration for ${issueKey}`);
        
        // Clear any cached data to ensure fresh color determination
        const getUsersWorkLogsModule = require('./getUsersWorkLogsAsEvent');
        
        // Clear the worklog cache to force fresh data
        if (getUsersWorkLogsModule.clearWorklogCache) {
            getUsersWorkLogsModule.clearWorklogCache();
            log.debug(`Cleared worklog cache for issue ${issueKey} color update`);
        }
        
        // Clear color cache for this specific issue and related issues
        const colorUtils = require('./colorUtils');
        colorUtils.clearIssueColorFromCache(issueKey);
        
        // Also clear cache for any child issues that might inherit this color
        colorUtils.clearColorCache(); // Clear entire cache to be safe
        
        return {
            total: 0,
            successful: 0,
            failed: 0,
            message: 'Issue-based color system updated - all worklogs will now use issue color hierarchy'
        };
        
    } catch (error) {
        log.error(`Error updating color system for issue ${issueKey}:`, error);
        throw error;
    }
}

exports.getUsersWorkLogsAsEvent = async function(req, start, end) {
    const startTime = Date.now();
    log.info(`Loading worklogs from ${start} to ${end}`);
    
    try {
        // Use the optimized module function
        const getUsersWorkLogsModule = require('./getUsersWorkLogsAsEvent');
        const events = await getUsersWorkLogsModule.getUsersWorkLogsAsEvent(req, start, end);
        
        const duration = Date.now() - startTime;
        log.info(`Worklogs loaded in ${duration}ms, found ${events.length} events`);
        
        return events;
    } catch (error) {
        const duration = Date.now() - startTime;
        log.error(`Worklog loading failed after ${duration}ms:`, error);
        throw error;
    }
};

module.exports = {
    suggestIssues: exports.suggestIssues,
    getSingleEvent: exports.getSingleEvent,
    getUsersWorkLogsAsEvent: exports.getUsersWorkLogsAsEvent,
    clearWorklogCache: exports.clearWorklogCache,
    determineIssueColor: exports.determineIssueColor,
    updateWorkLog: exports.updateWorkLog,
    createWorkLog: exports.createWorkLog,
    deleteWorkLog: exports.deleteWorkLog,
    getIssue: exports.getIssue,
    getWorkLog: exports.getWorkLog,
    getWorklogStats: exports.getWorklogStats,
    forceRefreshIssueColors: exports.forceRefreshIssueColors,
    updateWorklogsColorForIssue
};
