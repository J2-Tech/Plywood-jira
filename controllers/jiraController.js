const jiraAPIController = require('./jiraAPIController');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

exports.getUsersWorkLogsAsEvent = function(req, start, end) {
    const filterStartTime = new Date(start);
    const filterEndTime = new Date(end);

    const formattedStart = filterStartTime.toLocaleDateString('en-CA');
    const formattedEnd = filterEndTime.toLocaleDateString('en-CA');

    const issuesPromise = jiraAPIController.searchIssues(req, 
        `worklogAuthor = currentUser() AND worklogDate >= ${formattedStart} AND worklogDate <= ${formattedEnd}`);
    
    return issuesPromise.then(result => {
        const issues = extractIssues(result.issues);
        const worklogPromises = issues.map(issue => getFilteredWorklogs(req, issue, filterStartTime, filterEndTime));
        return Promise.all(worklogPromises).then(worklogs => worklogs.flat());
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
            return worklogs.filter(worklog => filterWorklog(worklog, filterStartTime, filterEndTime))
                .map(worklog => formatWorklog(worklog, issue));
        });
}

function filterWorklog(worklog, filterStartTime, filterEndTime) {
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

function formatWorklog(worklog, issue) {
    const configPath = path.join(__dirname, '..', 'config', 'settings.json');
    let settings = {};

    // Check if the configuration file exists
    if (fs.existsSync(configPath)) {
        try {
            settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (err) {
            console.error(`Failed to parse configuration file at ${configPath}:`, err);
            settings = {};
        }
    } else {
        console.warn(`Configuration file not found at ${configPath}. Creating a new one.`);
        // Create an empty configuration file
        fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf8');
    }

    const defaultColor = process.env.DEFAULT_ISSUE_COLOR || '#000000'; // Default color from .env or fallback to black
    const issueTypeLower = issue.issueType.toLowerCase();
    const color = (settings.issueColors && settings.issueColors[issueTypeLower]) || defaultColor;
    const showIssueTypeIcons = settings.showIssueTypeIcons || false;

    let title = `<b class="plywood-event-title">${issue.issueKey} - ${issue.summary}</b> ${worklog.comment || ''}`;
    if (showIssueTypeIcons && issue.issueTypeIcon) {
        title = `<img src="${issue.issueTypeIcon}" alt="${issue.issueType}" class="issue-type-icon"> ` + title;
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
        issueType: issue.issueType,
        issueTypeIcon: issue.issueTypeIcon
    };
}

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