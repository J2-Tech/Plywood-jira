const jiraAPIController = require('./jiraAPIController');
const dayjs = require('dayjs');

exports.getUsersWorkLogsAsEvent = function(req, start, end) {
    // search fo jira issues where worklogAuthor = currentUser()
    const filterStartTime = new Date(start);
    const filterEndTime = new Date(end);

    const formattedStart = filterStartTime.toLocaleDateString('en-CA');
    const formattedEnd = filterEndTime.toLocaleDateString('en-CA');

    let issuesPromise = jiraAPIController.searchIssues(req, 'worklogAuthor = currentUser() AND worklogDate >= ' + formattedStart + ' AND worklogDate <= '+ formattedEnd);
    
    return issuesPromise.then(result => {
        // create an array of issue IDs and keys from result.issues
        const issues = result.issues.map(issue => { return {issueId: issue.id, issueKey: issue.key, summary: issue.fields.summary} });
        const userWorkLogs = [];
        // for each issue ID, get worklogs, filter by started date and match worklog author to process.env.JIRA_BASIC_AUTH_USERNAME
        // create an array of promises , each promise should return the worklogs for its issue ID, and use promise.all to resolve them
        const worklogPromises = issues.map(issue => {
            return jiraAPIController.getIssueWorklogs(req, issue.issueId,filterEndTime.getTime(),filterStartTime.getTime()).then(result => {
                const worklogs = result.worklogs;
                // return worklog and add issueID and key to each worklog
                return worklogs.filter(worklog => {
                    const startTime = new Date(worklog.started);
                    const endTime = new Date(startTime.getTime() + (worklog.timeSpentSeconds * 1000));
                    let condition = startTime.getTime() > filterStartTime.getTime() 
                    && endTime.getTime() < filterEndTime.getTime();
                    if (process.env.JIRA_BASIC_AUTH_USERNAME) {
                        condition = condition && worklog.author.emailAddress == process.env.JIRA_BASIC_AUTH_USERNAME;
                    }
                    if (process.env.JIRA_AUTH_TYPE =="OAUTH") {
                        condition = condition && worklog.author.emailAddress == req.user.email;
                    }
                    return condition;
                })
                .map(worklog => {
                    worklog.issue = issue;
                    return worklog;
                })
            })
        })

        return Promise.all(worklogPromises).then(issues => {
            // for each worklog, create an event object
            issues.forEach(issue => {
                issue.forEach(log => {
                    const startTime = new Date(log.started);
                    const endTime = new Date(startTime.getTime() + (log.timeSpentSeconds * 1000));
                    userWorkLogs.push({
                        title: log.issue.issueKey + ' - ' + (log.comment  || ''),
                        start: startTime.toISOString(),
                        end: endTime.toISOString(),
                        allDay: false,
                        issueId: log.issue.issueId,
                        issueKey: log.issue.issueKey,
                        issueSummary: log.issue.summary,
                        worklogId: log.id,
                        editable: true,
                        Testurl: 'https://' + process.env.JIRA_URL + '/browse/' + log.issue.issueKey //FIXME
                    });
                })
            })
            return userWorkLogs;
        })

    });
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
    var startDate = new Date(start).toISOString().split('T')[0];
    var endDate = new Date(end).toISOString().split('T')[0];
    var searchInJira = req.query.searchInJira;
    var query = req.query.query;

    var promises = [];

    var emptyJQL = 'worklogAuthor = currentUser() AND worklogDate >= ' + startDate + ' AND worklogDate <= '+endDate+' OR ((assignee = currentUser() OR reporter = currentUser()) AND ((statusCategory != '+ process.env.JIRA_DONE_STATUS +') OR (statusCategory = '+ process.env.JIRA_DONE_STATUS +' AND status CHANGED DURING (' + startDate + ', '+endDate+'))))';

    var keyJQL = 'key = ' + query

    if (searchInJira != 'true') {
        promises.push(jiraAPIController.searchIssues(req, emptyJQL));
    } else {
      promises.push(jiraAPIController.searchIssues(req, keyJQL));
      promises.push(jiraAPIController.suggestIssues(req, query));
    }

    

    return Promise.all(promises).then(results => {
        // results[0] = base JQL search
        // if search in jira
        // results[0] = Key search
        // results[1] = Suggestion search
        
        var issues = []
        if (searchInJira != 'true' && results[0].issues) {
            issues = results[0].issues.map(mapIssuesFunction);
        }

        if (searchInJira == 'true') {
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