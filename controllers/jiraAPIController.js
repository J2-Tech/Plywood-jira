const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const https = require('https');
const dayjs = require('dayjs');
const configController = require('./configController');

// Cache for API data
const issueCache = new Map();
const worklogCache = new Map();
const ISSUE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const WORKLOG_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Remove global state
// global.selectedProject = 'all';

const shouldValidateHttps = process.env.JIRA_API_DISABLE_HTTPS_VALIDATION !== 'true';
const httpsAgent = new https.Agent({
    rejectUnauthorized: shouldValidateHttps
});

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
            
            // Enhanced check for various forms of authentication errors
            const hasAuthError = data.code === 401 || 
                                data.status === 401 || 
                                (Array.isArray(data.errors) && data.errors.some(err => 
                                    typeof err === 'string' && (err.includes('Authorization') || 
                                                             err.includes('auth') || 
                                                             err.includes('token')))) ||
                                (typeof data.errors === 'string' && (data.errors.includes('Authorization') || 
                                                                   data.errors.includes('auth') || 
                                                                   data.errors.includes('token'))) ||
                                (data.errorMessages && Array.isArray(data.errorMessages) && 
                                 data.errorMessages.some(msg => msg.includes('auth') || msg.includes('token')));
                                
            if (hasAuthError && process.env.JIRA_AUTH_TYPE === "OAUTH" && attempt < maxRetries) {
                console.log(`Token expired or auth error detected. Attempting to refresh token... (attempt ${attempt + 1})`);
                const tokenRefreshed = await refreshToken(req);
                
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
            } else if (data.code === 401 || data.status === 401) {
                console.log('Error - unauthorized. Check your credentials.');
                const authError = new Error('Unauthorized');
                authError.authFailure = true;
                authError.status = 401;
                throw authError;
            }
            return data;
        } catch (error) {
            lastError = error;
            
            // Enhanced auth error detection
            if (error.message && (
                error.message.includes('Authentication') || 
                error.message.includes('Unauthorized') ||
                error.message.includes('token') ||
                error.message.includes('auth') ||
                error.message.includes('401')
            )) {
                error.authFailure = true;
                error.status = 401;
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
                        lastError = refreshError;
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
    return fetch(url + '/rest/api/3/search?maxResults=' + process.env.JIRA_MAX_SEARCH_RESULTS + '&jql=' + encodeURIComponent(jql) + '&fields=' + fields.join(','), {
        method: 'GET',
        headers,
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
    console.log(`Updating worklog ${worklogId} for issue ${issue} with comment: "${comment}"`);
    
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

async function searchIssuesWithWorkLogsInternal(req, start, end) {
    const cacheKey = `${start}-${end}-${req.query.project || 'all'}`;
    const cached = issueCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ISSUE_CACHE_TTL) {
        return cached.data;
    }

    const url = getCallURL(req);
    let jql = `worklogDate >= "${start}" AND worklogDate <= "${end}" AND worklogAuthor = currentUser()`;
    
    // Get project from query params
    const projectKey = req.query.project;
    jql = appendProjectFilter(jql, projectKey);
    
    try {
        const searchResult = await fetch(url + '/rest/api/2/search', {
            method: 'POST',
            headers: getDefaultHeaders(req),
            body: JSON.stringify({
                jql,
                fields: ['parent', 'customfield_10017', 'summary', 'issuetype', 'status', 'project'],
                maxResults: 100 // Limit results for faster response
            }),
            agent: httpsAgent
        }).then(res => {
            if (!res.ok) {
                console.error(`Search API error: ${res.status} ${res.statusText}`);
                return { issues: [] };
            }
            return res.json();
        });

        // Check for API errors
        if (searchResult.errorMessages || searchResult.errors) {
            console.warn('Search API returned errors:', searchResult.errorMessages || searchResult.errors);
            return { issues: [] };
        }

        // Cache the result
        issueCache.set(cacheKey, {
            data: searchResult,
            timestamp: Date.now()
        });

        return searchResult;
    } catch (error) {
        console.error('Search issues error:', error);
        return { issues: [] };
    }
}

exports.searchIssuesWithWorkLogs = async function(req, start, end) {
    const url = getCallURL(req);
    let jql = `worklogDate >= "${start}" AND worklogDate <= "${end}" AND worklogAuthor = currentUser()`;
    
    // Get project from query params and apply filter
    const projectKey = req.query.project;
    jql = appendProjectFilter(jql, projectKey);
    
    return fetch(url + '/rest/api/2/search', {
        method: 'POST',
        headers: getDefaultHeaders(req),
        body: JSON.stringify({
            jql,
            expand: ['renderedFields', 'worklog'],
            fields: ['parent', 'customfield_10017', 'worklog', 'summary', 'issuetype', 'status', 'project']
        }),
        agent: httpsAgent
    }).then(res => res.json());
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
    return fetch(url + '/rest/api/2/search', {
        method: 'POST',
        headers: getDefaultHeaders(req),
        body: JSON.stringify({
            jql,
            expand: ['renderedFields', 'worklog'],
            fields: ['worklog', 'summary', 'issuetype', 'status']
        }),
        agent: httpsAgent
    }).then(res => res.json());
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
        
        if (contentType.includes('svg')) {
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
        return '#2684FF';
    }
    
    return '#2684FF';
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

// Add wrapper functions for all exports to ensure error handling
const wrapWithErrorHandling = (fn) => {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            // Log the error but don't crash the app
            console.error(`API call error in ${fn.name}:`, error);
            
            // Return appropriate error response instead of throwing
            if (error.authFailure) {
                return { error: 'Authentication required', authFailure: true, status: 401 };
            }
            
            return { error: error.message || 'API call failed', status: error.status || 500 };
        }
    };
};

// Wrap existing exports
const originalExports = { ...module.exports };
Object.keys(originalExports).forEach(key => {
    if (typeof originalExports[key] === 'function' && key !== 'refreshToken') {
        module.exports[key] = wrapWithErrorHandling(originalExports[key]);
    }
});
