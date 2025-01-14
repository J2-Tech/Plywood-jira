const settingsService = require('./settingsService');
const jiraAPIController = require('./jiraAPIController');
const { JSDOM } = require('jsdom');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

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

};

exports.findColorFieldName = async function (req) {
    const fields = await jiraAPIController.getCustomFields(req);
    const colorField = fields.find(field => field.name === "Issue color");
    return colorField ? colorField.id : null;

}

// Update determineIssueColor to not try fetching colors automatically
exports.determineIssueColor = async function(settings, req, issue) {
    const defaultColor = process.env.DEFAULT_ISSUE_COLOR || '#2a75fe';

    // Try to get color for specific issue key
    let color = settings.issueColors[issue.issueKey.toLowerCase()];
    if (color) return color;

    // Try to get color from issue type
    if (issue.issueType) {
        const issueTypeLower = issue.issueType.toLowerCase();
        color = settings.issueColors[issueTypeLower];
        if (color) return color;
    }

    return defaultColor;
};