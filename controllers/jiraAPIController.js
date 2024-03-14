const fetch = require('node-fetch');
const https = require('https');

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
    return fetch(url + '/rest/api/3/search?maxResults='+process.env.JIRA_MAX_SEARCH_RESULTS+'&jql=' + jql, {
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
    if (process.env.JIRA_PROJECT_JQL) {
        query += '&currentJQL=' + process.env.JIRA_PROJECT_JQL
    }
    return fetch(url + '/rest/api/3/issue/picker?query=' + query , {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent:httpsAgent
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

function updateWorkLogInternal(req, issue, worklogId, started, timeSpentSeconds, comment) {
    const body = {
        "comment": comment,
        "started": started,
        "timeSpentSeconds": timeSpentSeconds
    };

    const url = getCallURL(req);
    return fetch(url + '/rest/api/2/issue/' + issue + '/worklog/' + worklogId +'?expand=renderedFields', {
        method: 'PUT',
        headers: getDefaultHeaders(req),
        body: JSON.stringify(body),
        agent:httpsAgent
    }).then(res => {

        return res.json();
    });
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
