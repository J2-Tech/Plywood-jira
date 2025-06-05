const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const settingsService = require('../controllers/settingsService');

router.get('/getConfig', async (req, res) => {
    try {
        const config = await configController.loadConfig(req);
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load configuration' });
    }
});

router.post('/saveConfig', async (req, res) => {
    try {
        await configController.ensureConfigDirExists(req);
        const newSettings = req.body;
        await settingsService.updateSettings(req, newSettings);
        res.json({ message: 'Configuration saved successfully' });
    } catch (error) {
        console.error('Error saving config:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

router.post('/saveIssueColor', async (req, res) => {
    try {
        const { issueKey, color } = req.body;
        
        if (!issueKey || !color) {
            return res.status(400).json({ error: 'Missing issueKey or color' });
        }
        
        console.log(`Saving color ${color} for issue ${issueKey}`);
        
        // Get current settings
        const settings = await configController.loadConfig(req, true);
        
        // Ensure issueColors object exists
        if (!settings.issueColors) {
            settings.issueColors = {};
        }
        
        // Store with lowercase key for consistency
        const normalizedIssueKey = issueKey.toLowerCase();
        settings.issueColors[normalizedIssueKey] = color;
        
        // Save settings
        await configController.setSetting(req, 'issueColors', settings.issueColors);
        
        // Clear settings cache to ensure fresh data
        configController.clearSettingsCache(req);
        
        // Clear worklog cache to force fresh data with new colors
        const jiraController = require('../controllers/jiraController');
        jiraController.clearWorklogCache();
        
        console.log(`Successfully saved color ${color} for issue ${issueKey}`);
        
        res.json({ 
            success: true, 
            issueKey, 
            color,
            message: 'Color saved successfully' 
        });
        
    } catch (error) {
        console.error('Error saving issue color:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/setProject', async (req, res) => {
    const { project } = req.body;
    global.selectedProject = project;
    res.json({ message: 'Project updated successfully' }).status(200);
});

/**
 * Special route to force refresh issue colors
 * This is useful when the client needs to ensure all cache is cleared
 */
router.get('/refreshColors', async (req, res) => {
    try {
        const jiraController = require('../controllers/jiraController');
        const refreshedSettings = await jiraController.forceRefreshIssueColors(req);
        
        const issueColors = refreshedSettings.issueColors || {};
        const colorCount = Object.keys(issueColors).length;
        
        console.log(`Refreshed all issue colors (${colorCount} colors)`);
        
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.json({
            success: true,
            message: `Refreshed ${colorCount} issue colors`,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Error refreshing issue colors:', error);
        res.status(500).json({ error: 'Failed to refresh issue colors' });
    }
});

/**
 * Diagnostic endpoint to check issue color status for debugging
 */
router.get('/debugIssueColor/:issueKey', async (req, res) => {
    try {
        const { issueKey } = req.params;
        const colorUtils = require('../controllers/colorUtils');
        const jiraController = require('../controllers/jiraController');
        
        // Get fresh settings
        const settings = await configController.loadConfig(req, true);
        
        // Check if issue color exists in settings
        const normalizedKey = issueKey.toLowerCase();
        const settingsColor = settings.issueColors?.[normalizedKey];
        
        // Check color from cache
        const cachedColor = colorUtils.getIssueColorFromCache(normalizedKey);
        
        // Determine color that would be used in API
        const issue = { issueKey: normalizedKey };
        const determinedColor = await jiraController.determineIssueColor(settings, req, issue);
        
        // Return diagnostic information
        res.json({
            issueKey: normalizedKey,
            settingsColor,
            cachedColor,
            determinedColor,
            settingsCount: Object.keys(settings.issueColors || {}).length,
            cacheState: cachedColor ? 'found' : 'not in cache'
        });
    } catch (error) {
        console.error('Error in debug issue color:', error);
        res.status(500).json({ error: 'Failed to debug issue color' });
    }
});

module.exports = router;

