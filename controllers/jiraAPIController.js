const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const https = require('https');
const dayjs = require('dayjs');
const configController = require('./configController');

// Add this to store the current project
global.selectedProject = 'all';

function getDefaultHeaders(req) {
    let defaultHeaders;

    switch (process.env.JIRA_AUTH_TYPE) {
        case "OAUTH":
            defaultHeaders = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + req.user.accessToken
            };
        break;
        
        case "BASIC":
        default:
            const bearerToken = 'Basic ' + Buffer.from(process.env.JIRA_BASIC_AUTH_USERNAME + ':' + process.env.JIRA_BASIC_AUTH_API_TOKEN).toString('base64');

            defaultHeaders = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': bearerToken
            };
            break;
    }

    return defaultHeaders;
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

let httpsAgent;

if (process.env.JIRA_API_DISABLE_HTTPS_VALIDATION || process.env.JIRA_API_DISABLE_HTTPS_VALIDATION===undefined) {
    httpsAgent = new https.Agent({
        rejectUnauthorized: false,
    });
} else {
    httpsAgent = new https.Agent();
}

async function withRetry(fetchFn, req, ...args) {
    const data = await fetchFn(req, ...args);
    if (data.code === 401 && process.env.JIRA_AUTH_TYPE === "OAUTH") {
        console.log('Token expired. Refreshing token...');
        await refreshToken(req);
        // Retry the API call with the new token
        return fetchFn(req, ...args);
    } else if (data.code === 401) {
        console.log('Error - unauthorized. Check your credentials.');
    } else {
        return data;
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
    jql = appendProjectFilter(jql, req.query.project);
    
    return fetch(url + '/rest/api/2/search', {
        method: 'POST',
        headers: getDefaultHeaders(req),
        body: JSON.stringify({
            jql,
            expand: ['renderedFields', 'worklog'],
            fields: ['parent', 'customfield_10017', 'worklog', 'summary', 'issuetype']
        }),
        agent: httpsAgent
    }).then(res => res.json());
}

exports.searchIssuesWithWorkLogs = function(req, start, end) {
    return withRetry(searchIssuesWithWorkLogsInternal, req, start, end);
};

exports.getProjects = async function(req) {
    const url = getCallURL(req);
    const response = await fetch(url + '/rest/api/3/project/search', {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent: httpsAgent
    });
    return response.json();
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