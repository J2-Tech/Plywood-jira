// This helper function returns a single event by its id
const jiraAPIController = require('./jiraAPIController');
const configController = require('./configController');
const colorUtils = require('./colorUtils');
const { determineIssueColor } = require('./issueColorHelper');

exports.getSingleEvent = async function(req, issueId, worklogId) {
    console.log(`Getting single event for worklog ${worklogId} on issue ${issueId}`);
    
    try {
        const worklog = await jiraAPIController.getWorkLog(req, issueId, worklogId);
        
        if (!worklog) {
            console.error(`Worklog ${worklogId} not found`);
            throw new Error('Worklog not found');
        }
        
        // Get issue details
        console.log(`Fetching issue details for ${issueId}`);
        const issue = await jiraAPIController.getIssue(req, issueId);
        
        if (!issue || !issue.key) {
            console.error(`Issue ${issueId} not found or missing key property`);
            throw new Error('Issue not found or invalid');
        }
          // Calculate end time with date validation
        let started;
        let endTime;
        
        try {
            started = new Date(worklog.started);
            if (isNaN(started.getTime())) {
                console.warn(`Invalid start date in worklog: ${worklog.started}`);
                started = new Date(); // Use current date as fallback
            }
            
            endTime = new Date(started.getTime() + (worklog.timeSpentSeconds * 1000));
            if (isNaN(endTime.getTime())) {
                console.warn(`Invalid end time calculation for worklog ${worklogId}`);
                endTime = new Date(started.getTime() + 3600000); // Add 1 hour as fallback
            }
        } catch (dateError) {
            console.error(`Error parsing dates for worklog ${worklogId}:`, dateError);
            // Fallback to current time with 1 hour duration
            started = new Date();
            endTime = new Date(started.getTime() + 3600000); // 1 hour
        }
        
        // Get settings for colors
        const settings = await configController.loadConfig(req);
        
        // Get issue details for color determination
        const issueData = {
            issueId: issue.id,
            issueKey: issue.key,
            issueType: issue.fields && issue.fields.issuetype ? issue.fields.issuetype.name : 'unknown'
        };
        
        console.log(`Determining color for issue ${issue.key}`);
        
        // Check for color in worklog comment first (allows per-worklog color override)
        let issueKeyColor;
        if (worklog.comment && worklog.comment.includes('color:')) {
            const colorMatch = worklog.comment.match(/color:\s*([#0-9A-Fa-f]+)/);
            if (colorMatch && colorMatch[1]) {
                issueKeyColor = colorMatch[1];
                console.log(`Found color in worklog comment: ${issueKeyColor}`);
            }
        }
          // If no color in comment, determine from issue settings
        if (!issueKeyColor) {
            issueKeyColor = await determineIssueColor(settings, req, issueData, null);
        }
          console.log(`Final color for issue ${issue.key || 'unknown'}: ${issueKeyColor}`);
          // Create event object with safe date handling
        return {
            title: `${issue.key || 'Unknown'}: ${issue.fields?.summary || 'No summary'}`,
            start: started.toISOString(),
            end: endTime.toISOString(),
            id: worklog.id,
            backgroundColor: issueKeyColor,
            borderColor: issueKeyColor,
            textColor: issueKeyColor === '#ffffff' || issueKeyColor === '#FFFFFF' ? '#000000' : undefined,
            extendedProps: {
                issueId: issue.id,
                issueKey: issue.key,
                issueSummary: issue.fields.summary,
                worklogId: worklog.id,
                comment: worklog.comment,
                timeSpent: worklog.timeSpent,
                timeSpentSeconds: worklog.timeSpentSeconds,
                author: worklog.author.displayName,
                issueType: issue.fields.issuetype?.name,
                issueStatus: issue.fields.status?.name,
                issueColor: issueKeyColor
            }
        };
    } catch (error) {
        console.error('Error getting single event:', error);
        throw error;
    }
};
