const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const https = require('https');
const dayjs = require('dayjs');
const configController = require('./configController');

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
    jql = appendProjectFilter(jql, req.query.project);
    
    const fields = ['summary', 'issuetype', 'parent', 'customfield_10017'];
    return fetch(url + '/rest/api/3/search?maxResults=' + process.env.JIRA_MAX_SEARCH_RESULTS + '&jql=' + jql + '&fields=' + fields.join(','), {
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
    const projectFilter = appendProjectFilter('', req.query.project);
    
    if (projectFilter) {
        query += '&currentJQL=' + projectFilter;
    }
    
    return fetch(url + '/rest/api/3/issue/picker?query=' + query, {
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
    const url = getCallURL(req);
    let jql = `worklogDate >= "${start}" AND worklogDate <= "${end}" AND worklogAuthor = currentUser()`;
    
    // Get project from query params
    const projectKey = req.query.project;
    jql = appendProjectFilter(jql, projectKey);
    
    // Use parallel requests for search and worklog expansion
    const searchPromise = fetch(url + '/rest/api/2/search', {
        method: 'POST',
        headers: getDefaultHeaders(req),
        body: JSON.stringify({
            jql,
            fields: ['parent', 'customfield_10017', 'summary', 'issuetype', 'status', 'project']
        }),
        agent: httpsAgent
    }).then(res => res.json());

    const worklogsPromise = fetch(url + '/rest/api/2/worklog/list', {
        method: 'POST',
        headers: getDefaultHeaders(req),
        body: JSON.stringify({
            ids: [] // Will be filled after search
        }),
        agent: httpsAgent
    }).then(res => res.json());

    const [searchResult, _] = await Promise.all([searchPromise, worklogsPromise]);
    
    // Attach worklogs to issues
    return {
        ...searchResult,
        issues: searchResult.issues.map(issue => ({
            ...issue,
            fields: {
                ...issue.fields,
                worklog: {
                    worklogs: [] // Fill from worklog result
                }
            }
        }))
    };
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

exports.getMainColorFromIcon = async function (imageUrl) {
    if (!imageUrl) {
        return '#2684FF'; // Default Jira blue
    }

    try {
        const response = await fetch(imageUrl, {
            agent: httpsAgent // Use the same HTTPS validation settings as other API calls
        });
        const svgText = await response.text();
        // ... rest of the function
    } catch (error) {
        console.error('Error fetching icon:', error);
        return '#2684FF'; // Default Jira blue
    }
};