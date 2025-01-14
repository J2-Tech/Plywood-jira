const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const https = require('https');
const dayjs = require('dayjs');
const configController = require('./configController');

// Add at the top of the file
const issueCache = new Map();
const ISSUE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
    try {
        const data = await fetchFn(req, ...args);
        if (data.code === 401 && process.env.JIRA_AUTH_TYPE === "OAUTH") {
            console.log('Token expired. Refreshing token...');
            await refreshToken(req);
            return await fetchFn(req, ...args);
        } else if (data.code === 401) {
            console.log('Error - unauthorized. Check your credentials.');
            throw new Error('Unauthorized');
        }
        return data;
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
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
    
        } catch (error) {
            console.error('Error refreshing token:', error);
            res.redirect('/login');
        }
    }
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
    }).then(res => res.json());
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
    const body = {
        "comment": comment,
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

exports.updateWorkLog = function(req, issue, worklogId, started, timeSpentSeconds, comment) {
    return withRetry(updateWorkLogInternal, req, issue, worklogId, started, timeSpentSeconds, comment);
}

function createWorkLogInternal(req, issue, started, timeSpentSeconds, comment) {
    const body = {
        "comment": comment,
        "started": started,
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

exports.createWorkLog = function(req, issue, started, timeSpentSeconds, comment) {
    return withRetry(createWorkLogInternal, req, issue, started, timeSpentSeconds, comment);
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
    
    const searchResult = await fetch(url + '/rest/api/2/search', {
        method: 'POST',
        headers: getDefaultHeaders(req),
        body: JSON.stringify({
            jql,
            fields: ['parent', 'customfield_10017', 'summary', 'issuetype', 'status', 'project'],
            maxResults: 100 // Limit results for faster response
        }),
        agent: httpsAgent
    }).then(res => res.json());

    // Cache the result
    issueCache.set(cacheKey, {
        data: searchResult,
        timestamp: Date.now()
    });

    return searchResult;
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
    
    // Use jiraController's determineIssueColor instead
    const jiraController = require('./jiraController');
    const settings = await configController.loadConfig(req);
    const color = await jiraController.determineIssueColor(settings, req, {
        issueId: issue.id,
        issueKey: issue.key,
        issueType: issue.fields.issuetype.name
    });
    
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
