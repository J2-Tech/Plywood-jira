// This helper function returns a single event by its id
const jiraAPIController = require('./jiraAPIController');
const configController = require('./configController');
const colorUtils = require('./colorUtils');
const { determineIssueColor } = require('./issueColorHelper');

/**
 * Calculate the luminance of a color
 * @param {string} color - Color in hex format (e.g., "#FF0000")
 * @returns {number} - Luminance value between 0 and 1
 */
function calculateLuminance(color) {
    // Remove the hash if present
    const hex = color.replace('#', '');
    
    // Parse RGB values
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    // Apply gamma correction
    const sR = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const sG = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const sB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    
    // Calculate luminance
    return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

/**
 * Calculate contrast ratio between two colors
 * @param {number} luminance1 - Luminance of first color
 * @param {number} luminance2 - Luminance of second color
 * @returns {number} - Contrast ratio
 */
function calculateContrastRatio(luminance1, luminance2) {
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calculate contrasting text color (white or black) for a given background color
 * @param {string} backgroundColor - Background color in hex format
 * @returns {string} - Either "#FFFFFF" for white text or "#000000" for black text
 */
function calculateContrastingTextColor(backgroundColor) {
    if (!backgroundColor) return '#000000';
    
    // Ensure we have a valid hex color
    if (!backgroundColor.startsWith('#') || backgroundColor.length !== 7) {
        return '#000000'; // Default to black for invalid colors
    }
    
    try {
        const backgroundLuminance = calculateLuminance(backgroundColor);
        const whiteLuminance = 1.0; // White luminance
        const blackLuminance = 0.0; // Black luminance
        
        const contrastWithWhite = calculateContrastRatio(backgroundLuminance, whiteLuminance);
        const contrastWithBlack = calculateContrastRatio(backgroundLuminance, blackLuminance);
        
        // Choose the color with better contrast (WCAG recommends minimum 4.5:1 for normal text)
        return contrastWithWhite > contrastWithBlack ? '#FFFFFF' : '#000000';
    } catch (error) {
        console.warn('Error calculating contrasting text color for', backgroundColor, error);
        return '#000000'; // Default to black on error
    }
}

/**
 * Extract text content from a comment field that might be a string or ProseMirror document
 * @param {any} comment - The comment field (string, object, or null)
 * @returns {string} - Extracted text content
 */
function extractCommentText(comment) {
    if (!comment) return '';
    
    // If it's already a string, return it
    if (typeof comment === 'string') {
        return comment;
    }
    
    // If it's a ProseMirror document object, extract text content
    if (comment && typeof comment === 'object' && comment.type === 'doc' && comment.content) {
        return extractProseMirrorText(comment.content);
    }
    
    // If it has a content property, try to extract from it
    if (comment && comment.content) {
        return extractProseMirrorText(comment.content);
    }
    
    // Fallback: try to stringify the object (for debugging)
    console.warn('Unknown comment format:', comment);
    return '';
}

/**
 * Recursively extract text content from ProseMirror document structure
 * @param {Array} content - The content array from ProseMirror
 * @returns {string} - Extracted text content
 */
function extractProseMirrorText(content) {
    if (!Array.isArray(content)) {
        return '';
    }
    
    let text = '';
    
    for (const node of content) {
        if (node.type === 'text' && node.text) {
            text += node.text;
        } else if (node.content && Array.isArray(node.content)) {
            text += extractProseMirrorText(node.content);
        } else if (node.content && typeof node.content === 'string') {
            text += node.content;
        }
        
        // Add line breaks for block-level elements
        if (node.type === 'paragraph' || node.type === 'heading') {
            text += '\n';
        }
    }
    
    return text.trim();
}

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
        const commentText = extractCommentText(worklog.comment);
        if (commentText && commentText.includes('color:')) {
            const colorMatch = commentText.match(/color:\s*([#0-9A-Fa-f]+)/);
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
          
          // Calculate proper contrasting text color
          const textColor = calculateContrastingTextColor(issueKeyColor);
          
          // Create event object with safe date handling
        return {
            title: `${issue.key || 'Unknown'}: ${issue.fields?.summary || 'No summary'}`,
            start: started.toISOString(),
            end: endTime.toISOString(),
            id: worklog.id,
            backgroundColor: issueKeyColor,
            borderColor: issueKeyColor,
            textColor: textColor,
            extendedProps: {
                issueId: issue.id,
                issueKey: issue.key,
                issueSummary: issue.fields.summary,
                worklogId: worklog.id,
                comment: extractCommentText(worklog.comment),
                timeSpent: worklog.timeSpent,
                timeSpentSeconds: worklog.timeSpentSeconds,
                author: worklog.author.displayName,
                issueType: issue.fields.issuetype?.name,
                issueStatus: issue.fields.status?.name,
                issueColor: issueKeyColor,
                issueTypeIcon: settings.showIssueTypeIcons && issue.fields.issuetype && issue.fields.issuetype.id ? `/avatars/issuetype/${issue.fields.issuetype.id}?size=small` : null,
                showIssueTypeIcons: settings.showIssueTypeIcons !== false
            }
        };
    } catch (error) {
        console.error('Error getting single event:', error);
        throw error;
    }
};
