const settingsService = require('./settingsService');
const jiraAPIController = require('./jiraAPIController');
const { JSDOM } = require('jsdom');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Store colors to update per user
const issueColorsToUpdate = new Map();

exports.loadConfig = async function (req, forceRefresh = false) {
    return await settingsService.getSettings(req, forceRefresh);
};

exports.setSetting = async function (req, key, value) {
    return await settingsService.setSetting(req, key, value);
};

exports.accumulateIssueColor = async function(req, issueKey, color) {
    const userId = settingsService._getUserId(req);
    if (!issueColorsToUpdate.has(userId)) {
        issueColorsToUpdate.set(userId, {});
    }
    if (color && issueKey) {
        // Always use lowercase for issue keys in settings for consistency
        const normalizedIssueKey = issueKey.toLowerCase();
        
        // Store the new color and log it
        issueColorsToUpdate.get(userId)[normalizedIssueKey] = color;
        console.log(`Accumulated color ${color} for issue ${normalizedIssueKey} (user: ${userId})`);
    }
};

exports.saveAccumulatedIssueColors = async function(req) {
    const userId = settingsService._getUserId(req);
    const userColors = issueColorsToUpdate.get(userId);
    if (userColors && Object.keys(userColors).length > 0) {
        // Force refresh to get the latest settings
        const config = await settingsService.getSettings(req, true);
        
        // Create a new issue colors object if it doesn't exist
        if (!config.issueColors) {
            config.issueColors = {};
        }
        
        // Merge the existing colors with the new ones
        config.issueColors = { 
            ...config.issueColors,
            ...userColors 
        };
        
        // Update settings and clear cache
        await settingsService.updateSettings(req, config);
        settingsService.clearSettingsCache(req);
        
        // Clear worklog cache to ensure fresh colors are applied
        const jiraController = require('./jiraController');
        if (jiraController.clearWorklogCache) {
            jiraController.clearWorklogCache();
        }
        
        // Log the colors being saved
        console.log(`Saved accumulated issue colors for user ${userId}:`, userColors);
        
        // Clear the pending updates
        issueColorsToUpdate.delete(userId);
    }
};

exports.ensureConfigDirExists = async function(req) {
    if (!req) {
        throw new Error('Request object is required for ensureConfigDirExists');
    }
    
    const userId = settingsService._getUserId(req);
    if (!userId) {
        throw new Error('User ID is undefined or null');
    }
    
    // Create config directory
    const configDir = path.join(__dirname, '..', 'config', 'users', userId);
    
    // Ensure the directory exists
    try {
        await fs.mkdir(configDir, { recursive: true });
    } catch (error) {
        console.error('Error creating config directory:', error);
    }
    
    return configDir;
};

exports.findColorFieldName = async function (req) {
    const fields = await jiraAPIController.getCustomFields(req);
    const colorField = fields.find(field => field.name === "Issue color");
    return colorField ? colorField.id : null;

}

// Update determineIssueColor to support parent issue hierarchy
exports.determineIssueColor = async function(settings, req, issue, parentIssue = null) {
    const defaultColor = process.env.DEFAULT_ISSUE_COLOR || '#2a75fe';

    // Try to get color for specific issue key first
    let color = settings.issueColors && settings.issueColors[issue.issueKey.toLowerCase()];
    if (color) {
        console.log(`Found color ${color} for issue ${issue.issueKey}`);
        return color;
    }

    // If no color found and we have a parent issue, try parent's color
    if (parentIssue && parentIssue.key) {
        const parentColor = settings.issueColors && settings.issueColors[parentIssue.key.toLowerCase()];
        if (parentColor) {
            console.log(`Using parent issue ${parentIssue.key} color ${parentColor} for issue ${issue.issueKey}`);
            return parentColor;
        }
        
        // Try parent's issue type
        if (parentIssue.issueType) {
            const parentIssueTypeLower = parentIssue.issueType.toLowerCase();
            const parentTypeColor = settings.issueColors && settings.issueColors[parentIssueTypeLower];
            if (parentTypeColor) {
                console.log(`Using parent issue type ${parentIssue.issueType} color ${parentTypeColor} for issue ${issue.issueKey}`);
                return parentTypeColor;
            }
        }
    }

    // Try to get color from current issue type
    if (issue.issueType) {
        const issueTypeLower = issue.issueType.toLowerCase();
        color = settings.issueColors && settings.issueColors[issueTypeLower];
        if (color) {
            console.log(`Using issue type ${issue.issueType} color ${color} for issue ${issue.issueKey}`);
            return color;
        }
    }

    console.log(`Using default color ${defaultColor} for issue ${issue.issueKey}`);
    return defaultColor;
};

exports.clearSettingsCache = function(req) {
    return settingsService.clearSettingsCache(req);
};

// Utility function for debugging - only used when troubleshooting
exports.debugDumpSettings = async function(req, issueKey) {
    try {
        console.log('==== SETTINGS DEBUG INFO ====');
        const userId = settingsService._getUserId(req);
        console.log(`User ID: ${userId}`);
        
        // Get current settings with force refresh
        const settings = await settingsService.getSettings(req, true);
        
        // Check if issue color exists
        if (issueKey) {
            const normalizedKey = issueKey.toLowerCase();
            const colorInSettings = settings.issueColors && settings.issueColors[normalizedKey];
            console.log(`Color for ${issueKey} in settings: ${colorInSettings || 'not found'}`);
            
            // Check color cache
            const colorUtils = require('./colorUtils');
            const cachedColor = colorUtils.getIssueColorFromCache(issueKey, true);
            console.log(`Color for ${issueKey} in cache: ${cachedColor || 'not found'}`);
        }
        
        // Check pending updates
        const pendingUpdates = issueColorsToUpdate.get(userId);
        console.log('Pending color updates:', pendingUpdates || 'none');
        
        console.log('==== END DEBUG INFO ====');
    } catch (error) {
        console.error('Error in debugDumpSettings:', error);
    }
};