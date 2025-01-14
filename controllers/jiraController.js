const jiraAPIController = require('./jiraAPIController');
const configController = require('./configController');
const dayjs = require('dayjs');
const path = require('path');

exports.getParentIssueColor = async function(settings, req, issue, issueColors) {
    if (issue.fields.parent) {
        const parentIssueKey = issue.fields.parent.key.toLowerCase();
        if (issueColors[parentIssueKey]) {
            return issueColors[parentIssueKey];
        } else {
            const parentIssue = await jiraAPIController.getIssue(req, issue.fields.parent.id);
            const color = await exports.getParentIssueColor(settings, req, parentIssue, issueColors);
            if (color) {
                return color;
            }
            if (settings.issueColors[parentIssueKey]) {
                return settings.issueColors[parentIssueKey];
            } else {
                let color = process.env.DEFAULT_ISSUE_COLOR || '#2a75fe';
                if (parentIssue.fields[settings.issueColorField]) {
                    const jiraColor = parentIssue.fields[settings.issueColorField];
                    switch (jiraColor) {
                        case 'purple': color = '#8777D9'; break;
                        case 'blue': color =  '#2684FF'; break;
                        case 'green': color =  '#57D9A3'; break;
                        case 'teal': color =  '#00C7E6'; break;
                        case 'yellow': color =  '#FFC400'; break;
                        case 'orange': color =  '#FF7452'; break;
                        case 'grey': color =  '#6B778C'; break;
                        case 'dark_purple': color =  '#5243AA'; break;
                        case 'dark_blue': color =  '#0052CC'; break;
                        case 'dark_green': color =  '#00875A'; break;
                        case 'dark_teal': color =  '#00A3BF'; break;
                        case 'dark_yellow': color =  '#FF991F'; break;
                        case 'dark_orange': color =  '#DE350B'; break;
                        case 'dark_grey': color =  '#253858'; break;
                        default: color =  jiraColor; break;
                    }
                    await configController.accumulateIssueColor(parentIssue.key, color);
                    settings.issueColors[parentIssueKey] = color;
                    return color;
                }
            }
        }
    }
    return null;
}

// Add color cache
const issueColorCache = new Map();
const colorCacheTTL = 30 * 60 * 1000; // 30 minutes

exports.determineIssueColor = async function(settings, req, issue) {
    const defaultColor = process.env.DEFAULT_ISSUE_COLOR || '#2a75fe';
    
    // Try to get color for specific issue key
    let color = settings.issueColors[issue.issueKey.toLowerCase()];
    if (color) {
        return color;
    }

    // Try to get color from parent issue
    try {
        const issueDetails = await jiraAPIController.getIssue(req, issue.issueId);
        if (issueDetails.fields.parent) {
            const parentColor = await exports.getParentIssueColor(settings, req, issueDetails, settings.issueColors);
            if (parentColor) {
                return parentColor;
            }
        }
    } catch (error) {
        console.error('Error getting parent issue color:', error);
    }

    // Try issue type color
    if (issue.issueType) {
        const issueTypeLower = issue.issueType.toLowerCase();
        color = settings.issueColors[issueTypeLower];
        if (color) {
            return color;
        }
    }

    return defaultColor;
};

exports.getUsersWorkLogsAsEvent = async function(req, start, end) {
    const settings = await configController.loadConfig(req);
    const filterStartTime = new Date(start);
    const filterEndTime = new Date(end);

    const formattedStart = filterStartTime.toISOString().split('T')[0];
    const formattedEnd = filterEndTime.toISOString().split('T')[0];

    const result = await jiraAPIController.searchIssuesWithWorkLogs(req, formattedStart, formattedEnd);
    const events = [];

    for (const issue of result.issues) {
        if (!issue.fields || !issue.fields.worklog || !issue.fields.worklog.worklogs) {
            continue;
        }

        // Filter worklogs first
        const filteredWorklogs = issue.fields.worklog.worklogs.filter(worklog => {
            if (process.env.JIRA_BASIC_AUTH_USERNAME) {
                return worklog.author.emailAddress === process.env.JIRA_BASIC_AUTH_USERNAME;
            }
            if (process.env.JIRA_AUTH_TYPE === "OAUTH") {
                return worklog.author.emailAddress === req.user.email;
            }
            return true;
        });

        // Get color for the issue
        const color = await exports.determineIssueColor(settings, req, {
            issueId: issue.id,
            issueKey: issue.key,
            issueType: issue.fields.issuetype.name
        });

        // Map worklogs to events
        const issueWorklogs = filteredWorklogs.map(worklog => {
            // Format title with proper HTML structure
            let title = '';
            if (settings.showIssueTypeIcons && issue.fields.issuetype.iconUrl) {
                title += `<img src="${issue.fields.issuetype.iconUrl}" class="issue-type-icon" alt="${issue.fields.issuetype.name}">`;
            }
            title += `<span class="plywood-event-title">${issue.key} - ${issue.fields.summary}</span>`;
            if (worklog.comment) {
                title += `<span class="comment">${worklog.comment}</span>`;
            }

            return {
                id: worklog.id,
                title: title,
                start: worklog.started,
                end: new Date(new Date(worklog.started).getTime() + worklog.timeSpentSeconds * 1000).toISOString(),
                worklogId: worklog.id,
                issueId: issue.id,
                issueKey: issue.key,
                comment: worklog.comment || "",
                issueSummary: issue.fields.summary,
                editable: true,
                backgroundColor: color,
                textColor: color,
                issueType: issue.fields.issuetype.name,
                issueTypeIcon: settings.showIssueTypeIcons ? issue.fields.issuetype.iconUrl : null,
                author: worklog.author.displayName
            };
        });

        events.push(...issueWorklogs);
    }

    return events;
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

async function getFilteredWorklogs(req, issue, filterStartTime, filterEndTime) {
    const settings = await configController.loadConfig();
    return jiraAPIController.getIssueWorklogs(req, issue.issueId, filterEndTime.getTime(), filterStartTime.getTime())
        .then(result => {
            const worklogs = result.worklogs;
            const filteredLogs = worklogs.filter(worklog => filterWorklog(req, worklog, filterStartTime, filterEndTime));
            const promises = filteredLogs.map(worklog => exports.formatWorklog(settings, req, worklog, issue));
            return promises;
        });
}

function filterWorklog(req, worklog, filterStartTime, filterEndTime) {
    const startTime = new Date(worklog.started);
    const endTime = new Date(startTime.getTime() + (worklog.timeSpentSeconds * 1000));
    let condition = startTime.getTime() > filterStartTime.getTime() && startTime.getTime() < filterEndTime.getTime();
    
    if (process.env.JIRA_BASIC_AUTH_USERNAME) {
        condition = condition && worklog.author == process.env.JIRA_BASIC_AUTH_USERNAME;
    }
    if (process.env.JIRA_AUTH_TYPE == "OAUTH") {
        condition = condition && worklog.author == req.user.email;
    }
    
    return condition;
}

exports.formatWorklog = async function (settings, req, worklog, issue) {
    const color = await exports.determineIssueColor(settings, req, issue);
    const showIssueTypeIcons = settings.showIssueTypeIcons || false;

    let title = `<b class="plywood-event-title">${issue.issueKey} - ${issue.summary}</b> <span class="comment">${worklog.comment || ''}</span>`;
    if (showIssueTypeIcons && issue.issueTypeIcon ) {
        title = `<img src="${issue.issueTypeIcon }" alt="${issue.issueType}" class="issue-type-icon"> ` + title;
    }

    return {
        id: worklog.id,
        worklogId: worklog.id,
        author: worklog.author,
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

exports.updateWorkLog = async function(req, issueId, worklogId, comment, startTime, endTime, issueKeyColor) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = (end - start) / 1000; // Calculate duration in seconds

    // update the worklog issue key color if it is different from determined issue color
    await updateColorIfDifferent(req, issueId, issueKeyColor).then(async () => {
        await configController.saveAccumulatedIssueColors();
    });


    return jiraAPIController.updateWorkLog(req, issueId, worklogId, startTime, duration, comment);
}

exports.createWorkLog = function(req, issueId, startTime, endTime, comment) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = (end - start) / 1000; // Calculate duration in seconds
    const formattedStartTime = formatDateToJira(start);

    return jiraAPIController.createWorkLog(req, issueId, formattedStartTime, duration, comment);
}

function updateColorIfDifferent(req, issueId, issueKeyColor) {
    // get issue key from ID 
    return jiraAPIController.getIssue(req, issueId).then(issue => {
        if (issue && issue.fields) {
            const issueKey = issue.key;
            // check what the determined issue color is
            return configController.loadConfig().then(settings => {
                return exports.determineIssueColor(settings, req, { issueId: issueId, issueKey: issueKey, issueType: issue.fields.issuetype.name }).then(determinedColor => {
                    if (determinedColor && issueKeyColor && determinedColor != issueKeyColor) {
                        // if the determined color is different from the issue key color, update the issue key color
                        configController.accumulateIssueColor(issueKey, issueKeyColor);
                    }
                });
            });
        }
    });
}

exports.deleteWorkLog = function(req, issueId, worklogId) {
    return jiraAPIController.deleteWorkLog(req, issueId, worklogId);
}

exports.suggestIssues = function(req, start, end, query) {
    var query = req.query.query;
    var promises = [];

    // Try exact key match first
    var keyJQL = 'key = ' + query;
    promises.push(jiraAPIController.searchIssues(req, keyJQL));

    // Then try text search
    promises.push(jiraAPIController.suggestIssues(req, query));

    return Promise.all(promises).then(results => {
        var issues = [];

        // Add exact matches first
        if (results[0] && results[0].issues) {
            issues = issues.concat(results[0].issues.map(mapIssuesFunction));
        }

        // Then add suggestions
        if (results[1] && results[1].sections) {
            results[1].sections.forEach(section => {
                if (section.issues) {
                    const mappedIssues = section.issues.map(mapIssuesFunction);
                    // Filter out duplicates
                    mappedIssues.forEach(issue => {
                        if (!issues.some(existing => existing.key === issue.key)) {
                            issues.push(issue);
                        }
                    });
                }
            });
        }

        return issues;
    });
};

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

exports.getSingleEvent = async function(req, issueId, worklogId) {
    const settings = await configController.loadConfig();
    const worklog = await jiraAPIController.getWorkLog(req, issueId, worklogId);
    const issue = extractIssues([await jiraAPIController.getIssue(req, issueId)])[0];
    const formattedEvent = await exports.formatWorklog(settings, req, worklog, issue);
    return formattedEvent;
};

exports.getWorklogStats = async function(req, start, end, project) {
    // Pass project filter through req.query
    req.query.project = project;
    const worklogs = await jiraAPIController.searchIssuesWithWorkLogs(req, start, end);
    
    let stats = worklogs.issues.map(issue => {
        // Filter worklogs by current user
        const userWorklogs = issue.fields.worklog.worklogs.filter(worklog => {
            if (process.env.JIRA_BASIC_AUTH_USERNAME) {
                return worklog.author.emailAddress === process.env.JIRA_BASIC_AUTH_USERNAME;
            }
            if (process.env.JIRA_AUTH_TYPE === "OAUTH") {
                return worklog.author.emailAddress === req.user.email;
            }
            return true;
        });

        const totalTime = userWorklogs.reduce((acc, worklog) => 
            acc + worklog.timeSpentSeconds, 0);
            
        const comments = userWorklogs
            .filter(worklog => worklog.comment)
            .map(worklog => ({
                author: worklog.author.displayName,
                comment: worklog.comment,
                created: worklog.created,
                timeSpent: worklog.timeSpentSeconds
            }));

        return {
            key: issue.key,
            summary: issue.fields.summary,
            totalTimeSpent: totalTime,
            status: issue.fields.status.name,
            type: issue.fields.issuetype.name,
            comments: comments
        };
    })
    // Filter out issues with no time spent by current user
    .filter(issue => issue.totalTimeSpent > 0);

    stats.sort((a, b) => b.totalTimeSpent - a.totalTimeSpent);
    return stats;
};