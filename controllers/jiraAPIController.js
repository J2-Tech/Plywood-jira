const fetch = require('node-fetch');
const https = require('https')


const bearerToken = 'Basic ' + Buffer.from(process.env.JIRA_USERNAME + ':' + process.env.JIRA_API_TOKEN).toString('base64');

const defaultHeaders = {
    'Authorization': bearerToken,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

let httpsAgent;

if (process.env.DISABLE_HTTPS) {
    httpsAgent = new https.Agent({
        rejectUnauthorized: false,
    });
} else {
    httpsAgent = new https.Agent();
}




exports.searchIssues = function(jql) {
    return fetch('https://' + process.env.JIRA_URL + '/rest/api/3/search?maxResults='+process.env.JIRA_MAX_SEARCH_RESULTS+'&jql=' + jql, {
        method: 'GET',
        headers: defaultHeaders,
        agent:httpsAgent
    }).then(res => res.json());
}

exports.getIssue = function(issueId) {
    return fetch('https://' + process.env.JIRA_URL + '/rest/api/3/issue/' + issueId, {
        method: 'GET',
        headers: defaultHeaders,
        agent:httpsAgent
    }).then(res => res.json());
}


exports.getIssueWorklogs = function(issueId, startedBefore, startedAfter) {
    return fetch('https://' + process.env.JIRA_URL + '/rest/api/2/issue/' + issueId + '/worklog?startedBefore=' + startedBefore + '&startedAfter=' + startedAfter + '&expand=renderedFields', {
        method: 'GET',
        headers: defaultHeaders,
        agent:httpsAgent
    }).then(res => res.json());
}

exports.getWorkLog = function(issueId, worklogId) {
    return fetch('https://' + process.env.JIRA_URL + '/rest/api/2/issue/' + issueId + '/worklog/' + worklogId + '?expand=renderedFields', {
        method: 'GET',
        headers: defaultHeaders,
        agent:httpsAgent
    }).then(res => res.json());
}


exports.updateWorkLog = function(issue, worklogId, started, timeSpentSeconds, comment) {
    const body = {
        "comment": comment,
        "started": started,
        "timeSpentSeconds": timeSpentSeconds
    };

    return fetch('https://' + process.env.JIRA_URL + '/rest/api/2/issue/' + issue + '/worklog/' + worklogId +'?expand=renderedFields', {
        method: 'PUT',
        headers: defaultHeaders,
        body: JSON.stringify(body),
        agent:httpsAgent
    }).then(res => res.json());
}

exports.createWorkLog = function(issue, started, timeSpentSeconds, comment) {
    const body = {
        "comment": comment,
        "started": started,
        "timeSpentSeconds": timeSpentSeconds
    };

    return fetch('https://' + process.env.JIRA_URL + '/rest/api/2/issue/' + issue + '/worklog', {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify(body),
        agent:httpsAgent
    }).then(res => res.json());
}

exports.deleteWorkLog = function(issue, worklogId) {
    return fetch('https://' + process.env.JIRA_URL + '/rest/api/3/issue/' + issue + '/worklog/' + worklogId, {
        method: 'DELETE',
        headers: {
            'Authorization': bearerToken,
        },
        agent:httpsAgent
    }).then(res => res.text()).catch(err => {
        console.log(err);
        res.status(500).json({status: 'error', message: err});
    });
}

