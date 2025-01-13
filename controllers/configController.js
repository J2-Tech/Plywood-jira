const settingsService = require('./settingsService');
const jiraAPIController = require('./jiraAPIController');
const { JSDOM } = require('jsdom');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Store colors to update per user
const issueColorsToUpdate = new Map();

exports.loadConfig = async function (req) {
    return await settingsService.getSettings(req);
};

exports.setSetting = async function (req, key, value) {
    return await settingsService.setSetting(req, key, value);
};

exports.accumulateIssueColor = async function(req, issueKey, color) {
    const userId = settingsService._getUserId(req);
    if (!issueColorsToUpdate.has(userId)) {
        issueColorsToUpdate.set(userId, {});
    }
    if (color) {
        issueColorsToUpdate.get(userId)[issueKey.toLowerCase()] = color;
    }
};

exports.saveAccumulatedIssueColors = async function(req) {
    const userId = settingsService._getUserId(req);
    const userColors = issueColorsToUpdate.get(userId);
    if (userColors && Object.keys(userColors).length > 0) {
        const config = await settingsService.getSettings(req);
        config.issueColors = { 
            ...config.issueColors, 
            ...userColors 
        };
        await settingsService.updateSettings(req, config);
        issueColorsToUpdate.delete(userId);
    }
};

exports.ensureConfigDirExists = async function(req) {
    const config = await settingsService.getSettings(req);
    if (!config.issueColorField) {
        const customFields = await jiraAPIController.getCustomFields(req);
        const issueColorField = await exports.findColorFieldName(req);

        // Get user's projects first
        let projectKey = req.query.project || 'all';
        let jql = projectKey !== 'all' ? `project = "${projectKey}"` : '';
        
        // Get all issue types actually used in user's projects
        const searchResult = await jiraAPIController.searchIssues(req, jql);
        const usedIssueTypes = new Set();
        searchResult.issues?.forEach(issue => {
            if (issue.fields?.issuetype?.name) {
                usedIssueTypes.add(issue.fields.issuetype);
            }
        });

        // Only get colors for issue types that are actually used
        const issueColors = {};
        for (const issueType of usedIssueTypes) {
            const iconUrl = issueType.iconUrl;
            const color = await exports.getMainColorFromIcon(iconUrl);
            issueColors[issueType.name.toLowerCase()] = color;
        }

        // Add some sensible defaults for common issue types if not already set
        const defaultColors = {
            'story': '#63ba3c',
            'bug': '#e5493a',
            'task': '#4bade8',
            'epic': '#904ee2'
        };

        await settingsService.updateSettings(req, {
            issueColorField,
            issueColors: {
                ...defaultColors,
                ...issueColors
            }
        });
    }
};

exports.findColorFieldName = async function (req) {
    const fields = await jiraAPIController.getCustomFields(req);
    const colorField = fields.find(field => field.name === "Issue color");
    return colorField ? colorField.id : null;

}

exports.getMainColorFromIcon = async function (imageUrl) {
    try {
        const response = await fetch(imageUrl);
        const svgText = await response.text();
        const dom = new JSDOM(svgText);
        const svg = dom.window.document.querySelector('svg');

        // Return default color if SVG parsing failed
        if (!svg) {
            console.warn(`Failed to parse SVG from ${imageUrl}`);
            return '#2684FF'; // Default Jira blue
        }

        const colorCount = {};
        let maxCount = 0;
        let mainColor = '#2684FF'; // Default color if no fills found

        function countColor(color) {
            if (color && color !== 'none') {
                colorCount[color] = (colorCount[color] || 0) + 1;
                if (colorCount[color] > maxCount) {
                    maxCount = colorCount[color];
                    mainColor = color;
                }
            }
        }

        // Try to get colors from both fill and stroke attributes
        svg.querySelectorAll('*').forEach(element => {
            const fill = element.getAttribute('fill');
            const stroke = element.getAttribute('stroke');
            countColor(fill);
            countColor(stroke);
        });

        return mainColor;
    } catch (error) {
        console.error(`Error getting icon color from ${imageUrl}:`, error);
        return '#2684FF'; // Default Jira blue
    }
}