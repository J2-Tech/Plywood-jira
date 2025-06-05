// filepath: d:\workspaces\jiraTime\jiraTime\controllers\jiraController.js
const jiraAPIController = require('./jiraAPIController');
const configController = require('./configController');
const colorUtils = require('./colorUtils');
const dayjs = require('dayjs');
const path = require('path');

// Import functionality from separate modules
const getSingleEventModule = require('./getSingleEvent');
const getUsersWorkLogsModule = require('./getUsersWorkLogsAsEvent');

// Import the determineIssueColor function from the helper
const { determineIssueColor } = require('./issueColorHelper');

// Re-export getSingleEvent and getUsersWorkLogsAsEvent functions
exports.getSingleEvent = getSingleEventModule.getSingleEvent;
exports.getUsersWorkLogsAsEvent = getUsersWorkLogsModule.getUsersWorkLogsAsEvent;
exports.clearWorklogCache = getUsersWorkLogsModule.clearWorklogCache;

// Export determineIssueColor function
exports.determineIssueColor = determineIssueColor;

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
exports.suggestIssues = function(req, start, end, query) {
    var query = req.query.query;
    var promises = [];

    // Try exact key match first
    var keyJQL = 'key = ' + query;
    promises.push(jiraAPIController.searchIssues(req, keyJQL));

    // Then try text search
    promises.push(jiraAPIController.suggestIssues(req, query));

    return Promise.all(promises).then(results => {
        var issues = [];

        // Add exact matches first
        if (results[0] && results[0].issues) {
            issues = issues.concat(results[0].issues.map(mapIssuesFunction));
        }

        // Then add suggestions
        if (results[1] && results[1].sections) {
            results[1].sections.forEach(section => {
                if (section.issues) {
                    const mappedIssues = section.issues.map(mapIssuesFunction);
                    // Filter out duplicates
                    mappedIssues.forEach(issue => {
                        if (!issues.some(existing => existing.key === issue.key)) {
                            issues.push(issue);
                        }
                    });
                }
            });
        }

        return issues;
    });
};

// Helper function for mapping issues
const mapIssuesFunction = issue => {
    return {
        key: issue.key,
        summary: issue.fields.summary,
        issueId: issue.id,
        subtaskKey: issue.fields && issue.fields.parent ? issue.fields.parent.key : null,
        issueType: issue.fields.issuetype ? issue.fields.issuetype.name : 'unknown',
        issueTypeIcon: issue.fields.issuetype && issue.fields.issuetype.iconUrl ? issue.fields.issuetype.iconUrl : null
    };
};

exports.updateWorkLog = async function(req, issueId, worklogId, comment, startTime, endTime, issueKeyColor) {
    console.log(`Updating worklog ${worklogId} for issue ${issueId}`);
    
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
        
        console.log(`Worklog ${worklogId} updated successfully`);
        
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
        console.error('Error updating worklog:', error);
        throw error;
    }
};

exports.createWorkLog = async function(req, issueId, started, ended, comment, issueKeyColor) {
    console.log(`Creating worklog for issue ${issueId}`);
    
    try {
        // Validate inputs
        if (!issueId || !started || !ended) {
            throw new Error('Missing required parameters');
        }
        
        // Calculate duration in seconds
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
        
        // Get the issue key from the request body if available
        const issueKey = req.body.issueKey;
        
        // Determine the color to use - use issue-based color determination
        let color = issueKeyColor || '#2a75fe';
        
        if (issueKey) {
            try {
                // Use the issue color determination system
                const determinedColor = await exports.determineIssueColor(req, issueKey);
                if (determinedColor) {
                    color = determinedColor;
                    console.log(`Using determined color ${color} for issue ${issueKey}`);
                }
            } catch (error) {
                console.warn(`Could not determine color for issue ${issueKey}, using default:`, error);
            }
        }
        
        // Calculate contrasting text color
        const textColor = calculateContrastingTextColor(color);
        
        // Call API to create worklog
        const result = await jiraAPIController.createWorkLog(req, issueId, startDate, durationSeconds, safeComment, color);
        
        if (result.errorMessages && result.errorMessages.length > 0) {
            throw new Error(result.errorMessages.join(', '));
        }
        
        if (result.errors) {
            throw new Error(Object.values(result.errors).join(', '));
        }
        
        // Get issue details for complete response data
        let issueDetails = null;
        try {
            issueDetails = await jiraAPIController.getIssue(req, issueId);
        } catch (error) {
            console.warn('Could not fetch issue details for response:', error);
        }
        
        // Clear worklog cache to ensure fresh data on next load
        exports.clearWorklogCache();
        
        console.log(`Worklog created successfully with id: ${result.id}, background: ${color}, text: ${textColor} for issue: ${issueKey}`);
        
        // Return comprehensive data for client-side use
        const responseData = {
            ...result,
            issueId,
            issueKey: issueKey || (issueDetails ? issueDetails.key : null),
            issueSummary: issueDetails ? issueDetails.fields.summary : null,
            startTime: startDate.toISOString(),
            endTime: endDate.toISOString(),
            comment: safeComment,
            issueKeyColor: color,
            backgroundColor: color,
            borderColor: color,
            textColor: textColor, // Include calculated text color
            timeSpentSeconds: durationSeconds,
            author: result.author || 'Current User'
        };
        
        // Add issue type icon if available
        if (issueDetails && issueDetails.fields.issuetype && issueDetails.fields.issuetype.id) {
            responseData.issueTypeIcon = `/avatars/issuetype/${issueDetails.fields.issuetype.id}?size=small`;
            responseData.issueType = issueDetails.fields.issuetype.name;
        }
        
        // Add calculated text color to extended props
        if (!responseData.extendedProps) {
            responseData.extendedProps = {};
        }
        responseData.extendedProps.calculatedTextColor = textColor;
        
        return responseData;
    } catch (error) {
        console.error('Error creating worklog:', error);
        throw error;
    }
};

/**
 * Calculate contrasting text color (white or black) for a given background color
 * @param {string} backgroundColor - Background color in hex format
 * @returns {string} - Either "#FFFFFF" for white text or "#000000" for black text
 */
function calculateContrastingTextColor(backgroundColor) {
    if (!backgroundColor) return '#000000';
    
    // Remove the hash if present
    const hex = backgroundColor.replace('#', '');
    
    // Parse RGB values
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Calculate luminance using the standard formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return white text for dark backgrounds, black text for light backgrounds
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
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

exports.getWorklogStats = async function(req, start, end, projectFilter) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    const formattedStart = startDate.toISOString().split('T')[0];
    const formattedEnd = endDate.toISOString().split('T')[0];
    
    // Add project filter if specified
    let jql = '';
    if (projectFilter && projectFilter !== 'all') {
        jql = `project = ${projectFilter} AND `;
    }
    jql += `worklogDate >= "${formattedStart}" AND worklogDate <= "${formattedEnd}"`;
    jql += ' ORDER BY updated DESC';
    
    const result = await jiraAPIController.searchIssuesWithWorkLogs(req, formattedStart, formattedEnd, jql);
    
    // Group worklogs by issue
    const stats = result.issues.map(issue => {
        // Filter to only include worklogs from the current user
        const userWorklogs = issue.fields.worklog.worklogs.filter(worklog => {
            if (process.env.JIRA_BASIC_AUTH_USERNAME) {
                return worklog.author.emailAddress === process.env.JIRA_BASIC_AUTH_USERNAME;
            }
            if (process.env.JIRA_AUTH_TYPE === "OAUTH") {
                return worklog.author.emailAddress === req.user.email;
            }
            return true;
        });

        const totalTime = userWorklogs.reduce((acc, worklog) => 
            acc + worklog.timeSpentSeconds, 0);
            
        const comments = userWorklogs
            .filter(worklog => worklog.comment)
            .map(worklog => ({
                author: worklog.author.displayName,
                comment: worklog.comment,
                created: worklog.created,
                timeSpent: worklog.timeSpentSeconds
            }));

        return {
            key: issue.key,
            summary: issue.fields.summary,
            totalTimeSpent: totalTime,
            status: issue.fields.status.name,
            type: issue.fields.issuetype.name,
            comments: comments
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
    console.log('Force refreshing all issue colors and clearing ALL caches');
    
    // Clear color caches
    colorUtils.clearColorCache();
    
    // Clear settings cache and force reload
    configController.clearSettingsCache(req);
    
    // IMPORTANT: Clear the worklog cache to force a fresh load with updated colors
    exports.clearWorklogCache();
    console.log('Worklog cache cleared - will force fresh data load on next request');
    
    // Force load settings from disk
    const settings = await configController.loadConfig(req, true);
    
    // Reinitialize the color cache with current settings
    if (settings && settings.issueColors) {
        Object.entries(settings.issueColors).forEach(([key, color]) => {
            colorUtils.cacheIssueColor(key, color);
        });
        console.log(`Re-initialized color cache with ${Object.keys(settings.issueColors).length} colors from settings`);
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
        console.log(`Color system now uses issue-based configuration for ${issueKey}`);
        
        // Clear any cached data to ensure fresh color determination
        const getUsersWorkLogsModule = require('./getUsersWorkLogsAsEvent');
        
        // Clear the worklog cache to force fresh data
        if (getUsersWorkLogsModule.clearWorklogCache) {
            getUsersWorkLogsModule.clearWorklogCache();
            console.log(`Cleared worklog cache for issue ${issueKey} color update`);
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
        console.error(`Error updating color system for issue ${issueKey}:`, error);
        throw error;
    }
}

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
