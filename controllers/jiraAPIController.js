const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const https = require('https');
const dayjs = require('dayjs');
const configController = require('./configController');
const fs = require('fs').promises;
const path = require('path');
const authErrorHandler = require('../utils/authErrorHandler');

// Cache for API data
const issueCache = new Map();
const worklogCache = new Map();
const ISSUE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const WORKLOG_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Add avatar cache
const avatarCache = new Map();
const AVATAR_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Add icon cache
const iconCache = new Map();
const ICON_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Remove global state
// global.selectedProject = 'all';

const disableValidation = process.env.JIRA_API_DISABLE_HTTPS_VALIDATION;
console.log(`JIRA_API_DISABLE_HTTPS_VALIDATION environment variable: "${disableValidation}"`);
const shouldValidateHttps = !(disableValidation === 'true' || disableValidation === 'True' || disableValidation === 'TRUE' || disableValidation === '1');
const httpsAgent = new https.Agent({
    rejectUnauthorized: shouldValidateHttps
});

console.log(`HTTPS certificate validation: ${shouldValidateHttps ? 'ENABLED' : 'DISABLED'}`);

function getDefaultHeaders(req) {
    if (!req.user && process.env.JIRA_AUTH_TYPE === "OAUTH") {
        throw new Error('No user session found');
    }

    switch (process.env.JIRA_AUTH_TYPE) {
        case "OAUTH":
            return {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + req.user.accessToken
            };
        
        case "BASIC":
        default:
            const bearerToken = 'Basic ' + Buffer.from(
                process.env.JIRA_BASIC_AUTH_USERNAME + ':' + 
                process.env.JIRA_BASIC_AUTH_API_TOKEN
            ).toString('base64');

            return {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': bearerToken
            };
    }
}

function getCallURL(req) {
    let defaultURL;
    switch (process.env.JIRA_AUTH_TYPE) {
        case "OAUTH":
            defaultURL = 'https://api.atlassian.com/ex/jira/' + req.user.cloudId;
        break;
        
        case "BASIC":
        default:
            defaultURL = 'https://' + process.env.JIRA_URL;
            break;
    }
    return defaultURL;
}

async function withRetry(fetchFn, req, ...args) {
    const maxRetries = 2;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const data = await fetchFn(req, ...args);
            
            // Use centralized auth error detection
            if (authErrorHandler.isAuthError(data)) {
                if (process.env.JIRA_AUTH_TYPE === "OAUTH" && attempt < maxRetries) {
                    console.log(`Token expired or auth error detected. Attempting to refresh token... (attempt ${attempt + 1})`);
                    const tokenRefreshed = await refreshToken(req);
                    
                    if (tokenRefreshed) {
                        console.log('Token refreshed successfully, retrying request');
                        continue; // Retry the request
                    } else {
                        console.log('Token refresh failed, authentication required');
                        throw authErrorHandler.createAuthError();
                    }
                } else {
                    console.log('Error - unauthorized. Check your credentials.');
                    throw authErrorHandler.createAuthError('Unauthorized');
                }
            }
            return data;
        } catch (error) {
            lastError = error;
            
            // Use centralized auth error detection
            if (authErrorHandler.isAuthError(error)) {
                console.log(`Authentication error detected in API call: ${error.message} (attempt ${attempt + 1})`);
                
                // Try to refresh token if OAuth is enabled and we have retries left
                if (process.env.JIRA_AUTH_TYPE === "OAUTH" && attempt < maxRetries) {
                    try {
                        console.log('Attempting to refresh token due to error...');
                        const tokenRefreshed = await refreshToken(req);
                        
                        if (tokenRefreshed) {
                            console.log('Token refreshed successfully, retrying request');
                            continue; // Retry the request
                        }
                    } catch (refreshError) {
                        console.log('Token refresh failed:', refreshError.message);
                        lastError = authErrorHandler.createAuthError();
                    }
                }
            }
            
            // For network errors or other issues, retry if we have attempts left
            if (attempt < maxRetries && (
                error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ENOTFOUND' ||
                error.message.includes('fetch')
            )) {
                console.log(`Network error, retrying... (attempt ${attempt + 1}): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
                continue;
            }
            
            // If this is the last attempt or not a retryable error, break
            break;
        }
    }
    
    console.error('API call failed after all retries:', lastError);
    throw lastError;
}

async function refreshToken(req) {
    if (req.user) {
        const refreshToken = req.user.refreshToken;
        try {
            console.log('Refreshing token');
            const response = await fetch('https://auth.atlassian.com/oauth/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                agent:httpsAgent,
                body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${process.env.JIRA_OAUTH_CLIENT_ID}&client_secret=${process.env.JIRA_OAUTH_CLIENT_SECRET}`
            });
    
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
    
            req.user.refreshToken = data.refresh_token
            req.user.accessToken = data.access_token;
            return true;
    
        } catch (error) {
            console.error('Error refreshing token:', error);
            throw new Error('Failed to refresh authentication token');
        }
    }
    return false;
}

exports.refreshToken = function(req) {
    return refreshToken(req);
}

exports.getAvailableSites= function(req) {
    return fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent:httpsAgent,
    }).then(res => res.json());
}

function searchIssuesInternal(req, jql) {
    const headers = getDefaultHeaders(req);
    const url = getCallURL(req);
    
    // If it's a query (not a specific issue key), use contains search
    if (!jql.startsWith('key = ')) {
        jql = `summary ~ "${jql}*" OR description ~ "${jql}*"`;
    }
    
    // Apply project filter
    jql = appendProjectFilter(jql, req.query.project);
    
    const fields = ['summary', 'issuetype', 'parent', 'customfield_10017'];
    
    // Use the new JQL-based search API (POST method)
    const requestBody = {
        jql: jql,
        maxResults: parseInt(process.env.JIRA_MAX_SEARCH_RESULTS),
        fields: fields
    };
    
    return fetch(url + '/rest/api/3/search/jql', {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        agent: httpsAgent
    }).then(res => res.json());
}

exports.searchIssues = function(req, jql) {
    return withRetry(searchIssuesInternal, req, jql);
}

exports.suggestIssues = function(req, query) {
    return withRetry(suggestIssuesInternal, req, query);
}

function suggestIssuesInternal(req, query) {
    const url = getCallURL(req);
    
    // Add JQL for text search
    let searchJql = `summary ~ "${query}*" OR description ~ "${query}*"`;
    
    // Apply project filter
    searchJql = appendProjectFilter(searchJql, req.query.project);
    
    return fetch(url + '/rest/api/3/issue/picker?query=' + encodeURIComponent(query) + '&currentJQL=' + encodeURIComponent(searchJql), {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent: httpsAgent
    }).then(res => {
        if (!res.ok) {
            console.error(`Issue picker API error: ${res.status} ${res.statusText}`);
            // Return empty result instead of throwing
            return { sections: [] };
        }
        return res.json();
    }).then(data => {
        // Check for API errors and return empty result
        if (data.errorMessages || data.errors) {
            console.warn('Issue picker returned errors:', data.errorMessages || data.errors);
            return { sections: [] };
        }
        
        // Ensure sections exist
        if (!data.sections) {
            console.warn('Issue picker returned unexpected format, creating empty sections');
            return { sections: [] };
        }
        
        return data;
    }).catch(error => {
        console.error('Issue picker error:', error);
        // Return empty result instead of throwing
        return { sections: [] };
    });
}

function getIssueInternal(req, issueId) {
    const url = getCallURL(req);
    return fetch(url + '/rest/api/3/issue/' + issueId, {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent:httpsAgent
    }).then(res => res.json());
}

exports.getIssues = function(req, issuesIds) {
    return withRetry(getIssuesInternal, req, issuesIds);
}

function getIssuesInternal(req, issuesIds) {
    const url = getCallURL(req);
    return fetch(url + '/rest/api/3/search/jql', {
        method: 'POST',
        headers: getDefaultHeaders(req),
        body: JSON.stringify({jql: 'key in (' + issuesIds.join(',') + ')'}),
        agent:httpsAgent
    }).then(res => res.json());
}

exports.getIssue = function(req, issueId) {
    return withRetry(getIssueInternal, req, issueId);
}

function getIssueWorklogsInternal(req, issueId, startedBefore, startedAfter) {
    const url = getCallURL(req);
    return fetch(url + '/rest/api/2/issue/' + issueId + '/worklog?startedBefore=' + startedBefore + '&startedAfter=' + startedAfter + '&expand=renderedFields', {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent:httpsAgent
    }).then(res => res.json());
}

exports.getIssueWorklogs = function(req, issueId, startedBefore, startedAfter) {
    return withRetry(getIssueWorklogsInternal, req, issueId, startedBefore, startedAfter);
}

function getWorkLogInternal(req, issueId, worklogId) {
    const url = getCallURL(req);
    return fetch(url + '/rest/api/2/issue/' + issueId + '/worklog/' + worklogId + '?expand=renderedFields', {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent:httpsAgent
    }).then(res => res.json());
}

exports.getWorkLog = function(req, issueId, worklogId) {
    return withRetry(getWorkLogInternal, req, issueId, worklogId);
}

function updateWorkLogInternal(req, issue, worklogId, started, timeSpentSeconds, comment, issueKeyColor) {
    console.log(`Updating worklog ${worklogId} for issue ${issue} with comment: "${comment}" (type: ${typeof comment})`);
    
    // Clean comment to remove any color information that might have been stored previously
    const cleanedComment = cleanWorklogComment(comment || "");
    
    const body = {
        "comment": cleanedComment,
        "started": formatDateToJira(new Date(started)),
        "timeSpentSeconds": timeSpentSeconds
    };

    const url = getCallURL(req);
    return fetch(url + '/rest/api/2/issue/' + issue + '/worklog/' + worklogId +'?expand=renderedFields', {
        method: 'PUT',
        headers: getDefaultHeaders(req),
        body: JSON.stringify(body),
        agent: httpsAgent
    }).then(res => res.json());
}

exports.updateWorkLog = function(req, issue, worklogId, started, timeSpentSeconds, comment, issueKeyColor) {
    return withRetry(updateWorkLogInternal, req, issue, worklogId, started, timeSpentSeconds, comment, issueKeyColor);
}

function createWorkLogInternal(req, issue, started, timeSpentSeconds, comment, issueKeyColor) {
    console.log(`Creating worklog for issue ${issue} with comment: "${comment}"`);
    
    // Clean comment to remove any color information
    const cleanedComment = cleanWorklogComment(comment || "");
    
    const body = {
        "comment": cleanedComment,
        "started": formatDateToJira(new Date(started)),
        "timeSpentSeconds": timeSpentSeconds
    };

    const url = getCallURL(req);
    return fetch(url + '/rest/api/2/issue/' + issue + '/worklog', {
        method: 'POST',
        headers: getDefaultHeaders(req),
        body: JSON.stringify(body),
        agent:httpsAgent
    }).then(res => res.json());
}

exports.createWorkLog = function(req, issue, started, timeSpentSeconds, comment, issueKeyColor) {
    return withRetry(createWorkLogInternal, req, issue, started, timeSpentSeconds, comment, issueKeyColor);
}

function deleteWorkLogInternal(req, issue, worklogId) {
    const url = getCallURL(req);
    return fetch(url + '/rest/api/3/issue/' + issue + '/worklog/' + worklogId, {
        method: 'DELETE',
        headers: {
            'Authorization': getDefaultHeaders(req).Authorization,
        },
        agent:httpsAgent
    }).then(res => res.text()).catch(err => {
        console.log(err);
        res.status(500).json({status: 'error', message: err});
    });
}

exports.deleteWorkLog = function(req, issue, worklogId) {
    return withRetry(deleteWorkLogInternal, req, issue, worklogId);
}

exports.getCustomFields = async function (req) {
    const url = getCallURL(req);
    const response = await fetch(url + '/rest/api/3/field', {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent: httpsAgent
    });
    return response.json();
}

exports.getIssueTypes = async function(req) {
    const url = getCallURL(req);
    const response = await fetch(url + '/rest/api/3/issuetype', {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent: httpsAgent
    });
    return response.json();
}

exports.searchIssuesWithWorkLogs = async function(req, start, end) {
    return withRetry(searchIssuesWithWorkLogsInternal, req, start, end);
};

async function searchIssuesWithWorkLogsInternal(req, start, end) {
    const url = getCallURL(req);
    
    // Use a more efficient approach: search for issues with worklogs in the specific date range
    // This reduces the number of API calls significantly
    let jql = `worklogDate >= "${start}" AND worklogDate <= "${end}"`;
    
    // Add user filter if we can identify the current user
    if (process.env.JIRA_BASIC_AUTH_USERNAME) {
        jql += ` AND worklogAuthor = "${process.env.JIRA_BASIC_AUTH_USERNAME}"`;
    } else if (req.user && req.user.email) {
        jql += ` AND worklogAuthor = "${req.user.email}"`;
    } else {
        // Fallback to currentUser() function
        jql += ` AND worklogAuthor = currentUser()`;
    }
    
    console.log(`JQL Query: ${jql}`);
    console.log(`Date range: ${start} to ${end}`);
    
    // Get project from query params and apply filter
    const projectKey = req.query.project;
    jql = appendProjectFilter(jql, projectKey);
    
    // Use the new JQL-based search API with worklog expansion
    const requestBody = {
        jql: jql,
        maxResults: parseInt(process.env.JIRA_MAX_SEARCH_RESULTS) || 100,
        expand: 'renderedFields,worklog',
        fields: ['summary', 'issuetype', 'status', 'project', 'key', 'id', 'parent', 'customfield_10017', 'worklog']
    };
    
    const response = await fetch(url + '/rest/api/3/search/jql', {
        method: 'POST',
        headers: {
            ...getDefaultHeaders(req),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        agent: httpsAgent
    });
    
    // Check response status before parsing
    if (!response.ok) {
        if (response.status === 401) {
            const authError = new Error('Unauthorized');
            authError.authFailure = true;
            authError.status = 401;
            throw authError;
        }
        
        // Try to get more details about the error
        let errorDetails = '';
        try {
            const errorResponse = await response.text();
            errorDetails = ` - Response: ${errorResponse}`;
        } catch (e) {
            errorDetails = ' - Could not read error response';
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorDetails}`);
    }
    
    const issuesData = await response.json();
    
    if (!issuesData.issues || !Array.isArray(issuesData.issues)) {
        console.log('No issues found with worklogs in date range');
        return { issues: [] };
    }
    
    console.log(`Found ${issuesData.issues.length} issues with worklogs in date range`);
    
    // Debug: Log all found issues
    issuesData.issues.forEach((issue, index) => {
        console.log(`  Issue ${index + 1}: ${issue.key} (${issue.fields.issuetype?.name || 'unknown type'})`);
    });
    
    // Process the issues - the worklogs should already be included in the response
    const issuesWithWorklogs = [];
    
    for (const issue of issuesData.issues) {
        try {
            // Check if worklogs are already included in the response
            if (issue.fields.worklog && issue.fields.worklog.worklogs && Array.isArray(issue.fields.worklog.worklogs)) {
                // Filter worklogs by user to ensure we only get the current user's worklogs
                const filteredWorklogs = issue.fields.worklog.worklogs.filter(worklog => {
                    // Check if worklog is by the current user
                    if (process.env.JIRA_BASIC_AUTH_USERNAME) {
                        return worklog.author.emailAddress === process.env.JIRA_BASIC_AUTH_USERNAME;
                    } else if (req.user && req.user.email) {
                        return worklog.author.emailAddress === req.user.email;
                    }
                    
                    return true;
                });
                
                console.log(`Issue ${issue.key}: Found ${issue.fields.worklog.worklogs.length} total worklogs, ${filteredWorklogs.length} filtered for user`);
                
                if (filteredWorklogs.length > 0) {
                    // Update the issue with filtered worklogs
                    const issueWithWorklogs = {
                        ...issue,
                        fields: {
                            ...issue.fields,
                            worklog: {
                                worklogs: filteredWorklogs
                            }
                        }
                    };
                    
                    issuesWithWorklogs.push(issueWithWorklogs);
                    console.log(`Issue ${issue.key}: ${filteredWorklogs.length} worklogs in date range`);
                }
            }
        } catch (error) {
            console.error(`Error processing issue ${issue.key}:`, error.message);
            continue;
        }
    }
    
    console.log(`Successfully processed ${issuesWithWorklogs.length} issues with relevant worklogs`);
    
    return { issues: issuesWithWorklogs };
};

exports.getProjects = async function(req) {
    const url = getCallURL(req);
    const startAt = req.query.startAt || 0;
    const maxResults = req.query.maxResults || 50;
    
    const response = await fetch(url + `/rest/api/3/project/search?startAt=${startAt}&maxResults=${maxResults}`, {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent: httpsAgent
    });
    return response.json();
};

exports.getSprintIssues = async function(req, sprintId) {
    const url = getCallURL(req);
    const jql = `sprint = ${sprintId}`;
    
    // Use the new JQL-based search API to get sprint issues
    const requestBody = {
        jql: jql,
        maxResults: parseInt(process.env.JIRA_MAX_SEARCH_RESULTS) || 100,
        expand: 'renderedFields',
        fields: ['summary', 'issuetype', 'status', 'key', 'id']
    };
    
    const response = await fetch(url + '/rest/api/3/search/jql', {
        method: 'POST',
        headers: {
            ...getDefaultHeaders(req),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        agent: httpsAgent
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const issuesData = await response.json();
    
    if (!issuesData.issues || !Array.isArray(issuesData.issues)) {
        return { issues: [] };
    }
    
    // Now fetch detailed worklog data for each issue
    const issuesWithWorklogs = [];
    
    for (const issue of issuesData.issues) {
        try {
            // Fetch all worklogs for this issue
            const worklogResponse = await fetch(`${url}/rest/api/3/issue/${issue.key}/worklog?expand=renderedFields`, {
                method: 'GET',
                headers: getDefaultHeaders(req),
                agent: httpsAgent
            });
            
            if (!worklogResponse.ok) {
                console.warn(`Failed to fetch worklogs for issue ${issue.key}: ${worklogResponse.status}`);
                continue;
            }
            
            const worklogData = await worklogResponse.json();
            
            if (!worklogData.worklogs || !Array.isArray(worklogData.worklogs)) {
                console.warn(`No worklogs found for issue ${issue.key}`);
                continue;
            }
            
            // Add all worklogs to the issue
            const issueWithWorklogs = {
                ...issue,
                fields: {
                    ...issue.fields,
                    worklog: {
                        worklogs: worklogData.worklogs
                    }
                }
            };
            
            issuesWithWorklogs.push(issueWithWorklogs);
            
        } catch (error) {
            console.error(`Error fetching worklogs for issue ${issue.key}:`, error.message);
            continue;
        }
    }
    
    return { issues: issuesWithWorklogs };
};

exports.getProjectAvatar = async function(req, projectKey) {
    console.log(`Fetching avatar for project ${projectKey}`);
    const url = getCallURL(req);
    try {
        // First try to get project details to get avatar URLs
        const projectResponse = await fetch(url + `/rest/api/3/project/${projectKey}`, {
            method: 'GET',
            headers: getDefaultHeaders(req),
            agent: httpsAgent
        });
        
        if (!projectResponse.ok) {
            console.error(`Failed to fetch project details: ${projectResponse.status}`);
            throw new Error('Failed to fetch project details');
        }
        
        const projectData = await projectResponse.json();
        console.log('Project avatar URLs:', projectData.avatarUrls);
        
        // Try to get the largest avatar available
        const avatarUrl = projectData.avatarUrls['48x48'] || 
                         projectData.avatarUrls['32x32'] || 
                         projectData.avatarUrls['24x24'] || 
                         projectData.avatarUrls['16x16'];
                         
        if (!avatarUrl) {
            console.error('No avatar URLs found in project data');
            return '#2684FF'; // Default color
        }

        // Get color from avatar
        const color = await exports.getMainColorFromIcon(avatarUrl);
        console.log(`Extracted color for project ${projectKey}:`, color);
        return color;
        
    } catch (error) {
        console.error('Error fetching project avatar:', error);
        return '#2684FF'; // Default color
    }
};

exports.getIssueColor = async function(req, issueId) {
    const url = getCallURL(req);
    const response = await fetch(url + `/rest/api/3/issue/${issueId}`, {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent: httpsAgent
    });
    const issue = await response.json();
      // Use the determineIssueColor from helper directly to avoid circular dependencies
    const { determineIssueColor } = require('./issueColorHelper');
    const settings = await configController.loadConfig(req);
    const color = await determineIssueColor(settings, req, {
        issueId: issue.id,
        issueKey: issue.key,
        issueType: issue.fields.issuetype.name
    }, null); // Pass null for pendingColorRequests
    
    return color;
};

exports.getMainColorFromIcon = async function (imageUrl) {
    if (!imageUrl) return '#2684FF';

    try {
        const response = await fetch(imageUrl, { agent: httpsAgent });
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('svg')) {
            const svgText = await response.text();
            
            // Look for Rectangle use element
            const useRegex = /<use[^>]*id="Rectangle"[^>]*fill="([^"]+)"[^>]*>/;
            const useMatch = svgText.match(useRegex);
            
            if (useMatch && useMatch[1]) {
                const color = useMatch[1];
                if (color !== 'none' && 
                    color.toLowerCase() !== '#fff' && 
                    color.toLowerCase() !== '#ffffff' &&
                    color.toLowerCase() !== 'white') {
                    return color;
                }
            }

            // Fallback to largest rectangle
            const rectRegex = /<rect[^>]*width="([^"]+)"[^>]*height="([^"]+)"[^>]*fill="([^"]+)"[^>]*>/g;
            let largestArea = 0;
            let backgroundColor = '#2684FF';
            let match;

            while ((match = rectRegex.exec(svgText)) !== null) {
                const [_, width, height, color] = match;
                if (color === 'none' || 
                    color.toLowerCase() === '#fff' || 
                    color.toLowerCase() === '#ffffff' ||
                    color.toLowerCase() === 'white') {
                    continue;
                }

                const area = parseFloat(width) * parseFloat(height);
                if (area > largestArea) {
                    largestArea = area;
                    backgroundColor = color;
                }
            }

            return backgroundColor;
        } else {
            let hash = 0;
            for (let i = 0; i < imageUrl.length; i++) {
                hash = ((hash << 5) - hash) + imageUrl.charCodeAt(i);
                hash = hash & hash;
            }
            const hue = Math.abs(hash % 360);
            return `hsl(${hue}, 70%, 50%)`;
        }
    } catch (error) {
        console.warn('Error fetching icon for color extraction:', error.message);
        return '#2684FF';
    }
};

function appendProjectFilter(jql, projectKey) {
    if (projectKey && projectKey !== 'all') {
        return jql ? `project = "${projectKey}" AND (${jql})` : `project = "${projectKey}"`;
    }
    return jql;
}

function formatDateToJira(date) {
    const dayJsDate = dayjs(date);
    return dayJsDate.format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
}

/**
 * Gets all sprints from all boards in Jira
 */
exports.getSprints = async function(req) {
    const url = getCallURL(req);
    const projectKey = req.query.project;
    
    try {
        // First get all the boards for the project
        let boards = [];
        let startAt = 0;
        const maxResults = 50;
        let hasMore = true;
        
        // Add queryString for project filtering if specified
        let queryString = '';
        if (projectKey && projectKey !== 'all') {
            queryString = `?projectKeyOrId=${projectKey}`;
        }
        
        // Fetch all boards with pagination
        while (hasMore) {
            const response = await fetch(`${url}/rest/agile/1.0/board${queryString}&startAt=${startAt}&maxResults=${maxResults}`, {
                method: 'GET',
                headers: getDefaultHeaders(req),
                agent: httpsAgent
            });
            
            const data = await response.json();
            boards = boards.concat(data.values || []);
            
            // Check if there are more boards to fetch
            hasMore = data.isLast === false;
            if (hasMore) {
                startAt += maxResults;
            }
        }
        
        // For each board, get its sprints
        const sprintsPromises = boards.map(board => 
            exports.getBoardSprints(req, board.id)
        );
        
        // Wait for all sprints to be fetched
        const sprintsResults = await Promise.all(sprintsPromises);
        
        // Combine all sprints from all boards
        let allSprints = [];
        sprintsResults.forEach(result => {
            if (result && result.values) {
                allSprints = allSprints.concat(result.values);
            }
        });
        
        // Deduplicate sprints by ID
        const uniqueSprints = Array.from(
            new Map(allSprints.map(sprint => [sprint.id, sprint])).values()
        );
        
        // Sort sprints by state (active first, then future, then closed) and then by start date
        uniqueSprints.sort((a, b) => {
            // First sort by state
            const stateOrder = { active: 0, future: 1, closed: 2 };
            const stateCompare = stateOrder[a.state] - stateOrder[b.state];
            if (stateCompare !== 0) return stateCompare;
            
            // Then sort by start date (most recent first)
            const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
            const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
            return dateB - dateA;
        });
        
        return { values: uniqueSprints };
    } catch (error) {
        console.error('Error fetching sprints:', error);
        throw error;
    }
};

/**
 * Gets all sprints for a specific board
 */
exports.getBoardSprints = async function(req, boardId) {
    const url = getCallURL(req);
    
    try {
        const response = await fetch(`${url}/rest/agile/1.0/board/${boardId}/sprint?startAt=0&maxResults=100`, {
            method: 'GET',
            headers: getDefaultHeaders(req),
            agent: httpsAgent
        });
        
        return await response.json();
    } catch (error) {
        console.error(`Error fetching sprints for board ${boardId}:`, error);
        return { values: [] }; // Return empty array on error to continue processing other boards
    }
};

/**
 * Gets sprint by ID with detailed information
 */
exports.getSprintById = async function(req, sprintId) {
    const url = getCallURL(req);
    
    try {
        const response = await fetch(`${url}/rest/agile/1.0/sprint/${sprintId}`, {
            method: 'GET',
            headers: getDefaultHeaders(req),
            agent: httpsAgent
        });
        
        return await response.json();
    } catch (error) {
        console.error(`Error fetching sprint ${sprintId}:`, error);
        throw error;
    }
};

/**
 * Clean worklog comment by removing any color information
 * @param {string} comment - The original comment
 * @returns {string} - Comment with color information removed
 */
function cleanWorklogComment(comment) {
    if (!comment) return '';
    
    // Handle case where comment is an object (shouldn't happen, but defensive programming)
    if (typeof comment !== 'string') {
        console.warn('cleanWorklogComment received non-string comment:', comment, typeof comment);
        return '';
    }
    
    // Remove color hex codes (e.g., #FF0000, #ff0000)
    let cleanedComment = comment.replace(/#[0-9A-Fa-f]{6}/g, '');
    
    // Remove color RGB values (e.g., rgb(255,0,0), rgba(255,0,0,1))
    cleanedComment = cleanedComment.replace(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+)?\s*\)/g, '');
    
    // Remove HSL values (e.g., hsl(0,100%,50%))
    cleanedComment = cleanedComment.replace(/hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(?:,\s*[\d.]+)?\s*\)/g, '');
    
    // Remove color keywords in brackets [COLOR:red] or similar patterns
    cleanedComment = cleanedComment.replace(/\[COLOR:[^\]]+\]/gi, '');
    
    // Remove any remaining color markers
    cleanedComment = cleanedComment.replace(/\bcolor\s*[:=]\s*[^\s,;]+/gi, '');
    
    // Clean up extra whitespace
    cleanedComment = cleanedComment.replace(/\s+/g, ' ').trim();
    
    return cleanedComment;
}

/**
 * Get issue type avatar using universal avatar API and return proxy URLs
 */
exports.getIssueTypeAvatar = async function(req, issueTypeId) {
    const cacheKey = `issuetype-avatar-${issueTypeId}`;
    const cached = avatarCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < AVATAR_CACHE_TTL) {
        return cached.data;
    }
    
    const url = getCallURL(req);
    
    try {
        // First get the issue type to get basic info
        const issueTypeResponse = await fetch(`${url}/rest/api/3/issuetype/${issueTypeId}`, {
            method: 'GET',
            headers: getDefaultHeaders(req),
            agent: httpsAgent
        });
        
        if (!issueTypeResponse.ok) {
            console.error(`Failed to fetch issue type: ${issueTypeResponse.status}`);
            throw new Error('Failed to fetch issue type');
        }
        
        const issueType = await issueTypeResponse.json();
        
        const result = {
            issueTypeId: issueTypeId,
            name: issueType.name,
            iconUrl: issueType.iconUrl, // Keep original for reference
            // Always provide our proxy URLs that the browser can access
            avatarUrls: {
                '16x16': `/avatars/issuetype/${issueTypeId}?size=xsmall`,
                '24x24': `/avatars/issuetype/${issueTypeId}?size=small`,
                '32x32': `/avatars/issuetype/${issueTypeId}?size=medium`,
                '48x48': `/avatars/issuetype/${issueTypeId}?size=large`
            }
        };
        
        // Cache the result
        avatarCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
        
        return result;
        
    } catch (error) {
        console.error('Error fetching issue type avatar info:', error);
        
        // Return fallback data with our proxy URLs
        return {
            issueTypeId: issueTypeId,
            name: 'Unknown',
            iconUrl: null,
            avatarUrls: {
                '16x16': `/avatars/issuetype/${issueTypeId}?size=xsmall`,
                '24x24': `/avatars/issuetype/${issueTypeId}?size=small`,
                '32x32': `/avatars/issuetype/${issueTypeId}?size=medium`,
                '48x48': `/avatars/issuetype/${issueTypeId}?size=large`
            }
        };
    }
};

/**
 * Proxy an issue type avatar image from JIRA (real-time proxy, no local storage)
 */
exports.proxyIssueTypeAvatarImage = async function(req, issueTypeId, size = 'medium') {
    const cacheKey = `issuetype-avatar-proxy-${issueTypeId}-${size}`;
    const cached = avatarCache.get(cacheKey);
    
    // Short cache for proxy requests to avoid hammering JIRA
    if (cached && Date.now() - cached.timestamp < (5 * 60 * 1000)) { // 5 minute cache
        return cached.data;
    }
    
    const url = getCallURL(req);
    
    try {
        // First get the issue type to extract avatar ID and iconUrl
        const issueTypeResponse = await fetch(`${url}/rest/api/3/issuetype/${issueTypeId}`, {
            method: 'GET',
            headers: getDefaultHeaders(req),
            agent: httpsAgent
        });
        
        if (!issueTypeResponse.ok) {
            console.warn(`Failed to fetch issue type ${issueTypeId}: ${issueTypeResponse.status}`);
            return null;
        }
        
        const issueType = await issueTypeResponse.json();
        let avatarBuffer = null;
        let contentType = 'image/png';
        
        // Approach 1: Use universal avatar API with extracted avatar ID
        if (issueType.iconUrl) {
            const avatarIdMatch = issueType.iconUrl.match(/avatar\/(\d+)/);
            if (avatarIdMatch) {
                const avatarId = avatarIdMatch[1];
                console.log(`Proxying avatar via universal API with ID ${avatarId} for issue type ${issueTypeId}`);
                
                try {
                    const avatarResponse = await fetch(`${url}/rest/api/3/universal_avatar/view/type/issuetype/avatar/${avatarId}?size=${size}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': getDefaultHeaders(req).Authorization,
                            'Accept': 'image/*'
                        },
                        agent: httpsAgent
                    });
                    
                    if (avatarResponse.ok) {
                        avatarBuffer = await avatarResponse.buffer();
                        contentType = avatarResponse.headers.get('content-type') || 'image/png';
                        console.log(`Successfully proxied avatar via universal API for issue type ${issueTypeId}`);
                    } else {
                        console.warn(`Universal avatar API returned ${avatarResponse.status} for issue type ${issueTypeId}`);
                    }
                } catch (error) {
                    console.warn(`Universal avatar API failed for issue type ${issueTypeId}:`, error.message);
                }
            }
        }
        
        // Approach 2: Try direct iconUrl if universal API failed
        if (!avatarBuffer && issueType.iconUrl) {
            console.log(`Proxying avatar via direct iconUrl for issue type ${issueTypeId}`);
            try {
                const directResponse = await fetch(issueType.iconUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': getDefaultHeaders(req).Authorization,
                        'Accept': 'image/*'
                    },
                    agent: httpsAgent  // Make sure this uses the configured agent
                });
                
                if (directResponse.ok) {
                    avatarBuffer = await directResponse.buffer();
                    contentType = directResponse.headers.get('content-type') || 'image/png';
                    console.log(`Successfully proxied avatar via direct URL for issue type ${issueTypeId}`);
                } else {
                    console.warn(`Direct iconUrl returned ${directResponse.status} for issue type ${issueTypeId}`);
                }
            } catch (error) {
                console.warn(`Direct iconUrl failed for issue type ${issueTypeId}:`, error.message);
            }
        }
        
        // Cache the result for a short time
        if (avatarBuffer && avatarBuffer.length > 0) {
            const result = {
                buffer: avatarBuffer,
                contentType: contentType
            };
            
            avatarCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });
            
            return result;
        }
        
        return null;
        
    } catch (error) {
        console.error(`Error proxying issue type avatar image for ${issueTypeId}:`, error);
        return null;
    }
};

// Add missing constants for icon caching
const ICONS_DIR = path.join(__dirname, '..', 'public', 'cached-icons');

// Ensure icons directory exists
async function ensureIconsDirectory() {
    try {
        await fs.mkdir(ICONS_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating icons directory:', error);
    }
}

/**
 * Clean up old cached icons
 */
exports.cleanupIconCache = async function() {
    try {
        await ensureIconsDirectory();
        
        // Clear in-memory caches
        iconCache.clear();
        avatarCache.clear();
        
        console.log('Icon cache cleanup completed');
        return true;
    } catch (error) {
        console.error('Error cleaning up icon cache:', error);
        throw error;
    }
};

/**
 * Get information about cached icons
 */
exports.getCachedIconsInfo = function() {
    const iconInfo = [];
    
    for (const [key, value] of iconCache.entries()) {
        iconInfo.push({
            issueTypeId: key,
            cached: new Date(value.timestamp),
            age: Date.now() - value.timestamp
        });
    }
    
    return iconInfo;
};

/**
 * Generate fallback SVG icon for issue types
 */
exports.generateFallbackIssueTypeIcon = function(issueTypeName, size = 32) {
    const firstLetter = (issueTypeName || '?').charAt(0).toUpperCase();
    const color = `hsl(${Math.abs(issueTypeName.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 360}, 70%, 50%)`;
    
    const svg = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${size}" height="${size}" rx="4" fill="${color}"/>
            <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${Math.floor(size * 0.6)}" 
                  fill="white" text-anchor="middle" dominant-baseline="central">${firstLetter}</text>
        </svg>
    `;
    
    return Buffer.from(svg, 'utf8');
};


// Add the missing wrapWithErrorHandling function
function wrapWithErrorHandling(fn) {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            console.error(`Error in ${fn.name}:`, error);
            throw error;
        }
    };
}

// Wrap existing exports
const originalExports = { ...module.exports };
Object.keys(originalExports).forEach(key => {
    if (typeof originalExports[key] === 'function' && key !== 'refreshToken') {
        module.exports[key] = wrapWithErrorHandling(originalExports[key]);
    }
});
