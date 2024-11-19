const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const configController = require('../controllers/configController');

const configPath = path.join(__dirname, '..', 'config', 'settings.json');
const defaultConfig = {
    showIssueTypeIcons: true,
    themeSelection: 'auto',
    roundingInterval: 15,
    issueColors: {}
};

// Route to get the configuration
router.get('/getConfig', async (req, res) => {
    await configController.ensureConfigDirExists(req);
    if (fs.existsSync(configPath)) {
        fs.readFile(configPath, 'utf8', (err, data) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to read configuration file' });
            }
            try {
                const config = JSON.parse(data);
                res.json({ ...defaultConfig, ...config }); // Merge with default config
            } catch (parseError) {
                res.json(defaultConfig); // Return default config if parsing fails
            }
        });
    } else {
        console.warn(`Configuration file not found at ${configPath}. Creating a new one.`);
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig), 'utf8');
        res.json(defaultConfig);
    }
});

// Route to save the configuration
router.post('/saveConfig', async (req, res) => {
    await configController.ensureConfigDirExists(req);
    const config = req.body;
    for ( key in config ) {
        configController.setSetting(key, config[key]);
    }
    res.json({ message: 'Configuration saved successfully' }).status(200);
});

router.post('/saveIssueColor', async (req, res) => {
    const { issueKey, color } = req.body;
    const config = configController.loadConfig();
    config.issueColors[issueKey.toLowerCase()] = color;
    configController.setSetting('issueColors', config.issueColors);
    res.json({ message: 'Issue color saved successfully' }).status(200);

});

module.exports = router;