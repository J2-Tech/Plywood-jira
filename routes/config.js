const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const configPath = path.join(__dirname, '..', 'config', 'settings.json');
const configDir = path.dirname(configPath);


// Default configuration
const defaultConfig = {
    showIssueTypeIcons: true,
    themeSelection: 'auto',
    issueColors: {}
};

// Ensure the config directory exists
function ensureConfigDirExists() {
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
}

// Route to get the configuration
router.get('/getConfig', (req, res) => {
    ensureConfigDirExists();
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
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
        res.json(defaultConfig);
    }
});

// Route to save the configuration
router.post('/saveConfig', (req, res) => {
    ensureConfigDirExists();
    const config = req.body;
    const normalizedConfig = { ...defaultConfig, ...config }; // Merge with default config

    fs.writeFile(configPath, JSON.stringify(normalizedConfig, null, 2), 'utf8', (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to save configuration file' });
        }
        res.json({ message: 'Configuration saved successfully' });
    });
});

module.exports = router;