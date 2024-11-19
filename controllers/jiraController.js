const jiraAPIController = require('./jiraAPIController');
const configController = require('./configController');
const dayjs = require('dayjs');
const path = require('path');

exports.getParentIssueColor = async function(settings, req, issue) {
    if (issue.fields.parent) {
        const parentIssue = await jiraAPIController.getIssue(req, issue.fields.parent.id);
        if (parentIssue && parentIssue.fields) {
            const color = await exports.getParentIssueColor(settings, req, parentIssue);
            if (color) {
                return color;
            }
            if (settings.issueColors[parentIssue.key.toLowerCase()]) {
                return settings.issueColors[parentIssue.key.toLowerCase()];
            }
            if (parentIssue.fields[configController.loadConfig().issueColorField]) {
                const jiraColor = parentIssue.fields[configController.loadConfig().issueColorField];
                switch (jiraColor) {
                    case 'purple': return '#8777D9';
                    case 'blue': return '#2684FF';
                    case 'green': return '#57D9A3';
                    case 'teal': return '#00C7E6';
                    case 'yellow': return '#FFC400';
                    case 'orange': return '#FF7452';
                    case 'grey': return '#6B778C';
                    case 'dark_purple': return '#5243AA';
                    case 'dark_blue': return '#0052CC';
                    case 'dark_green': return '#00875A';
                    case 'dark_teal': return '#00A3BF';
                    case 'dark_yellow': return '#FF991F';
                    case 'dark_orange': return '#DE350B';
                    case 'dark_grey': return '#253858';
                    default: return jiraColor;
                }
            }
        }
    }
    return null;
}

exports.determineIssueColor = async function(req, issue) {
    const settings = configController.loadConfig();
    const defaultColor = process.env.DEFAULT_ISSUE_COLOR || '#2a75fe';

    let color = settings.issueColors[issue.issueKey.toLowerCase()];
    if (!color) {
        // get the issue details
        const issueDetails = await jiraAPIController.getIssue(req, issue.issueId);
        color = await exports.getParentIssueColor(settings, req, issueDetails);
        if (!color && issue.issueType) {
            const issueTypeLower = issue.issueType.toLowerCase();
            color = settings.issueColors[issueTypeLower] || defaultColor;
        }
        configController.setSetting('issueColors', { ...settings.issueColors, [issue.issueKey.toLowerCase()]: color });
    }
    return color;
}

exports.getUsersWorkLogsAsEvent = async function(req, start, end) {
    const filterStartTime = new Date(start);
    const filterEndTime = new Date(end);

    const formattedStart = filterStartTime.toLocaleDateString('en-CA');
    const formattedEnd = filterEndTime.toLocaleDateString('en-CA');

    const issuesPromise = jiraAPIController.searchIssues(req, 
        `worklogAuthor = currentUser() AND worklogDate >= ${formattedStart} AND worklogDate <= ${formattedEnd}`);
    
    return issuesPromise.then(async result => {
        const issues = extractIssues(result.issues);
        const worklogPromises = issues.map(async issue => {
            const worklogs = await getFilteredWorklogs(req, issue, filterStartTime, filterEndTime);
            return Promise.all(worklogs);
        });
        const worklogs = await Promise.all(worklogPromises);
        return worklogs.flat();
    });
};

function extractIssues(issues) {
    return issues.map(issue => ({
        issueId: issue.id,
        issueKey: issue.key,
        summary: issue.fields.summary,
        issueType: issue.fields.issuetype.name,
        issueTypeIcon: issue.fields.issuetype.iconUrl
    }));
}

function getFilteredWorklogs(req, issue, filterStartTime, filterEndTime) {
    return jiraAPIController.getIssueWorklogs(req, issue.issueId, filterEndTime.getTime(), filterStartTime.getTime())
        .then(result => {
            const worklogs = result.worklogs;
            const filteredLogs = worklogs.filter(worklog => filterWorklog(req, worklog, filterStartTime, filterEndTime));
            const promises = filteredLogs.map(worklog => exports.formatWorklog(req, worklog, issue));
            return promises;
        });
}

function filterWorklog(req, worklog, filterStartTime, filterEndTime) {
    const startTime = new Date(worklog.started);
    const endTime = new Date(startTime.getTime() + (worklog.timeSpentSeconds * 1000));
    let condition = startTime.getTime() > filterStartTime.getTime() && startTime.getTime() < filterEndTime.getTime();
                    if (process.env.JIRA_BASIC_AUTH_USERNAME) {
                        condition = condition && worklog.author.emailAddress == process.env.JIRA_BASIC_AUTH_USERNAME;
                    }
                    if (process.env.JIRA_AUTH_TYPE =="OAUTH") {
                        condition = condition && worklog.author.emailAddress == req.user.email;
                    }
    return condition;
}

exports.formatWorklog = async function (req, worklog, issue) {
    const color = await exports.determineIssueColor(req, issue);
    const settings = configController.loadConfig();
    const showIssueTypeIcons = settings.showIssueTypeIcons || false;

    let title = `<b class="plywood-event-title">${issue.issueKey} - ${issue.summary}</b> <span class="comment">${worklog.comment || ''}</span>`;
    if (showIssueTypeIcons && issue.issueTypeIcon ) {
        title = `<img src="${issue.issueTypeIcon }" alt="${issue.issueType}" class="issue-type-icon"> ` + title;
    }

    return {
        id: worklog.id,
        worklogId: worklog.id,
        title: title,
        start: worklog.started,
        end: new Date(new Date(worklog.started).getTime() + worklog.timeSpentSeconds * 1000).toISOString(),
        allDay: false,
        issueId: issue.issueId,
        issueKey: issue.issueKey,
        comment: worklog.comment || "",
        issueSummary: issue.summary,
        editable: true,
        color: color,
        textColor: color,
        issueType: issue.issueType,
        issueTypeIcon: issue.issueTypeIcon
    };
};

exports.getIssue = function(req, issueId) {
    return jiraAPIController.getIssue(req, issueId);
}

exports.getWorkLog = function(req, issueId, worklogId) {
    return jiraAPIController.getWorkLog(req, issueId, worklogId);
}

exports.updateWorkLog = function(req, issueId, worklogId, start, duration, comment) {
    const startTime = new Date(start);
    const formattedStartTime = formatDateToJira(startTime);
    return jiraAPIController.updateWorkLog(req, issueId, worklogId, formattedStartTime, duration, comment);

}

exports.createWorkLog = function(req, issueId, start, duration, comment) {
    const startTime = new Date(start);
    const formattedStartTime = formatDateToJira(startTime);
    return jiraAPIController.createWorkLog(req, issueId, formattedStartTime, duration, comment);
}

exports.deleteWorkLog = function(req, issueId, worklogId) {
    return jiraAPIController.deleteWorkLog(req, issueId, worklogId);
}

exports.suggestIssues = function(req, start, end, query) {
    var query = req.query.query;

    var promises = [];

    var keyJQL = 'key = ' + query


    promises.push(jiraAPIController.searchIssues(req, keyJQL));
    promises.push(jiraAPIController.suggestIssues(req, query));

    

    return Promise.all(promises).then(results => {
        // results[0] = Key search
        // results[1] = Suggestion search
        
        var issues = []

        if (results[1] && results[1].sections && results[1].sections.length > 0) {
            for (var i = 0; i < results[1].sections.length; i++) {
                if (results[1].sections[i].id == "cs") {
                    //console.log(JSON.stringify(results[0].sections[i]));
                    // add issues from the suggestion results to the issues array
                    var mappedIssues = results[1].sections[i].issues.map(mapIssuesFunction);
                    issues = issues.concat(mappedIssues);
                }
            }
        }
        if (results[0] && results[0].issues) {
            issues = issues.concat(results[0].issues.map(mapIssuesFunction));
        }
        return issues;
    });
}

function mapIssuesFunction(issue) {
    return {
        id: issue.id,
        key: issue.key,
        summary: issue.fields ? issue.fields.summary : issue.summary
    }
}


function formatDateToJira(toFormat) {
    const dayJsDate = dayjs(toFormat);
    const formatted = dayJsDate.format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
    return formatted;
}