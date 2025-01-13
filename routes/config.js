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
        await configController.accumulateIssueColor(req, issueKey, color);
        await configController.saveAccumulatedIssueColors(req);
        res.json({ message: 'Issue color saved successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save issue color' });
    }
});

router.post('/setProject', async (req, res) => {
    const { project } = req.body;
    global.selectedProject = project;
    res.json({ message: 'Project updated successfully' }).status(200);
});

module.exports = router;

