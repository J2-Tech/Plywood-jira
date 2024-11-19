const fs = require('fs');
const path = require('path');
const jiraAPIController = require('../controllers/jiraAPIController');
const { JSDOM } = require('jsdom');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
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

exports.getMainColorFromIcon = async function (imageUrl) {
    const response = await fetch(imageUrl);
    const svgText = await response.text();
    const dom = new JSDOM(svgText);
    const svg = dom.window.document.querySelector('svg');

    const colorCount = {};
    let maxCount = 0;
    let mainColor = '#000000';

    function countColor(color) {
        if (color && color != 'none') {
            colorCount[color] = (colorCount[color] || 0) + 1;
            if (colorCount[color] > maxCount) {
                maxCount = colorCount[color];
                mainColor = color;
            }
        }
    }

    svg.querySelectorAll('*').forEach(element => {
        const fill = element.getAttribute('fill');
        countColor(fill);
    });

    return mainColor;
}