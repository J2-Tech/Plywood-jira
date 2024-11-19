const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const jiraAPIController = require('../controllers/jiraAPIController');

const configPath = path.join(__dirname, '..', 'config', 'settings.json');
const configDir = path.dirname(configPath);

// Default configuration
const defaultConfig = {
    showIssueTypeIcons: true,
    themeSelection: 'auto',
    roundingInterval: 15,
    issueColors: {}
};

exports.loadConfig = function () {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

exports.setSetting = function (key, value) {
    const config = exports.loadConfig();
    config[key] = value;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

exports.ensureConfigDirExists = async function(req) {
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir);
    }

    if (!fs.existsSync(configPath)) {
        const customFields = await jiraAPIController.getCustomFields(req);
        const issueTypes = await jiraAPIController.getIssueTypes(req);

        const issueColorField = await exports.findColorFieldName(req);

        const issueColors = {};
        for (const issueType of issueTypes) {
            const iconUrl = issueType.iconUrl;
            const color = await exports.getMainColorFromIcon(iconUrl);
            issueColors[issueType.name.toLowerCase()] = color;
        }

        const initialConfig = {
            ...defaultConfig,
            issueColorField,
            issueColors
        };

        fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2), 'utf8');
    }
}

exports.findColorFieldName = async function (req) {
    const fields = await jiraAPIController.getCustomFields(req);
    const colorField = fields.find(field => field.name === "Issue color");
    return colorField ? colorField.id : null;

}

exports.getMainColorFromIcon = async function (iconUrl) {
    try {
        const image = await loadImage(iconUrl);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, image.width, image.height);

        const imageData = ctx.getImageData(0, 0, image.width, image.height);
        const data = imageData.data;

        const colorCount = {};
        let maxCount = 0;
        let mainColor = '#000000';

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Ignore fully transparent pixels
            if (a === 0) continue;

            const color = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

            colorCount[color] = (colorCount[color] || 0) + 1;

            if (colorCount[color] > maxCount) {
                maxCount = colorCount[color];
                mainColor = color;
            }
        }

        return mainColor;
    } catch (error) {
        console.error('Failed to get main color from icon:', error);
        return '#000000'; // Default to black if there's an error
    }
}
