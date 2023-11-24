const jiraAPIController = require('./jiraAPIController');
const dayjs = require('dayjs');

exports.getUsersWorkLogsAsEvent = function(start, end) {
    // search fo jira issues where worklogAuthor = currentUser()
    const filterStartTime = new Date(start);
    const filterEndTime = new Date(end);

    const formattedStart = filterStartTime.toLocaleDateString('en-CA');
    const formattedEnd = filterEndTime.toLocaleDateString('en-CA');

    return jiraAPIController.searchIssues('worklogAuthor = currentUser() AND worklogDate >= ' + formattedStart + ' AND worklogDate <= '+ formattedEnd).then(result => {
        // create an array of issue IDs and keys from result.issues
        const issues = result.issues.map(issue => { return {issueId: issue.id, issueKey: issue.key} });
        const userWorkLogs = [];
        // for each issue ID, get worklogs, filter by started date and match worklog author to process.env.JIRA_USERNAME
        // create an array of promises , each promise should return the worklogs for its issue ID, and use promise.all to resolve them
        const worklogPromises = issues.map(issue => {
            return jiraAPIController.getIssueWorklogs(issue.issueId,filterEndTime.getTime(),filterStartTime.getTime()).then(result => {
                const worklogs = result.worklogs;
                // return worklog and add issueID and key to each worklog
                return worklogs.filter(worklog => {
                    const startTime = new Date(worklog.started);
                    const endTime = new Date(startTime.getTime() + (worklog.timeSpentSeconds * 1000));
                    return startTime.getTime() > filterStartTime.getTime() 
                        && endTime.getTime() < filterEndTime.getTime()
                        && worklog.author.emailAddress == process.env.JIRA_USERNAME
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

exports.getIssue = function(issueId) {
    return jiraAPIController.getIssue(issueId);
}

exports.getWorkLog = function(issueId, worklogId) {
    return jiraAPIController.getWorkLog(issueId, worklogId);
}

exports.updateWorkLog = function(issueId, worklogId, start, duration, comment) {
    const startTime = new Date(start);
    const formattedStartTime = formatDateToJira(startTime);
    return jiraAPIController.updateWorkLog(issueId, worklogId, formattedStartTime, duration, comment);

}

exports.createWorkLog = function(issueId, start, duration, comment) {
    const startTime = new Date(start);
    const formattedStartTime = formatDateToJira(startTime);
    return jiraAPIController.createWorkLog(issueId, formattedStartTime, duration, comment);
}

exports.deleteWorkLog = function(issueId, worklogId) {
    return jiraAPIController.deleteWorkLog(issueId, worklogId);
}


function formatDateToJira(toFormat) {
    const dayJsDate = dayjs(toFormat);
    const formatted = dayJsDate.format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
    return formatted;
}