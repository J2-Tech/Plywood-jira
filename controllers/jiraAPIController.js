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
            defaultURL = 'https://api.atlassian.com/ex/jira/' + req.session.cloudId;
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


exports.getAvailableSites = function(req) {
    // fetch  https://api.atlassian.com/oauth/token/accessible-resources
    return fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent:httpsAgent,
    }).then(res => res.json());
}

exports.searchIssues = function(req, jql) {
    const headers = getDefaultHeaders(req);
    const url = getCallURL(req);
    return fetch(url + '/rest/api/3/search?maxResults='+process.env.JIRA_MAX_SEARCH_RESULTS+'&jql=' + jql, {
        method: 'GET',
        headers,
        agent: httpsAgent
    }).then(res => res.json());
}

exports.getIssue = function(req, issueId) {
    const url = getCallURL(req);
    return fetch(url + '/rest/api/3/issue/' + issueId, {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent:httpsAgent
    }).then(res => res.json());
}


exports.getIssueWorklogs = function(req, issueId, startedBefore, startedAfter) {
    const url = getCallURL(req);
    return fetch(url + '/rest/api/2/issue/' + issueId + '/worklog?startedBefore=' + startedBefore + '&startedAfter=' + startedAfter + '&expand=renderedFields', {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent:httpsAgent
    }).then(res => res.json());
}

exports.getWorkLog = function(req, issueId, worklogId) {
    const url = getCallURL(req);
    return fetch(url + '/rest/api/2/issue/' + issueId + '/worklog/' + worklogId + '?expand=renderedFields', {
        method: 'GET',
        headers: getDefaultHeaders(req),
        agent:httpsAgent
    }).then(res => res.json());
}


exports.updateWorkLog = function(req, issue, worklogId, started, timeSpentSeconds, comment) {
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
    }).then(res => res.json());
}

exports.createWorkLog = function(req, issue, started, timeSpentSeconds, comment) {
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

exports.deleteWorkLog = function(req, issue, worklogId) {
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

