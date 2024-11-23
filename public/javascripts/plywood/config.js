import { hideModal } from './modal.js';
import { applyTheme } from './ui.js';
import { showLoading, hideLoading } from './ui.js';

/**
 * Save configuration settings.
 */
export function saveConfig() {
    showLoading();
    const form = document.getElementById('configForm');
    const formData = new FormData(form);
    const config = {
        showIssueTypeIcons: formData.get('showIssueTypeIcons') === 'on',
        themeSelection: formData.get('themeSelection'),
        issueColors: {},
        roundingInterval: parseInt(formData.get('roundingInterval'), 10) || 15, // Default to 15 minutes
        saveTimerOnIssueSwitch: formData.get('saveTimerOnIssueSwitch') === 'on'
    };

    formData.forEach((value, key) => {
        if (key.startsWith('issueType-')) {
            const issueType = key.replace('issueType-', '').toLowerCase();
            config.issueColors[issueType] = value;
        }
    });

    fetch('/config/saveConfig', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
    }).then(response => {
        hideLoading();
        if (response.ok) {
            hideModal('#configModal');
            if (config.themeSelection !== document.body.className) {
                applyTheme(config.themeSelection);
            }
            if (config.showIssueTypeIcons !== window.showIssueTypeIcons) {
                window.showIssueTypeIcons = config.showIssueTypeIcons;
                window.calendar.refetchEvents();
            }
        } else {
            console.error('Failed to save configuration.');
        }
    });
}

/**
 * Load configuration settings.
 */
export function loadConfig() {
    return fetch('/config/getConfig')
        .then(response => response.json())
        .then(config => {
            document.getElementById('showIssueTypeIcons').checked = config.showIssueTypeIcons;
            document.getElementById('themeSelection').value = config.themeSelection || 'light';
            document.getElementById('rounding-interval').value = config.roundingInterval || 15;
            document.getElementById('timer-rounding-interval').value = config.roundingInterval || 15;
            document.getElementById('save-timer-on-issue-switch').checked = config.saveTimerOnIssueSwitch;
            window.saveTimerOnIssueSwitch = config.saveTimerOnIssueSwitch;

            const issueTypeColors = document.getElementById('issueTypeColors');
            issueTypeColors.innerHTML = '';

            for (const [issueType, color] of Object.entries(config.issueColors)) {
                addIssueType(issueType, color);
            }

            applyTheme(config.themeSelection);
        });
}

/**
 * Add an issue type with a color.
 * @param {string} issueType - The issue type.
 * @param {string} color - The color associated with the issue type.
 */
export function addIssueType(issueType = '', color = '#000000') {
    const issueTypeColors = document.getElementById('issueTypeColors');
    const div = document.createElement('div');
    div.className = 'issue-type-color';

    const inputIssueType = document.createElement('input');
    inputIssueType.type = 'text';
    inputIssueType.placeholder = 'Issue Type';
    inputIssueType.value = issueType;

    const inputColor = document.createElement('input');
    inputColor.type = 'color';
    inputColor.value = color;

    // Set the name attributes correctly based on the issue type value
    const updateInputNames = () => {
        const issueTypeValue = inputIssueType.value.trim();
        inputIssueType.name = `issueType-${issueTypeValue}`;
        inputColor.name = `issueType-${issueTypeValue}`;
    };

    // Update names initially and on input change
    updateInputNames();
    inputIssueType.addEventListener('input', updateInputNames);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.classList.add("destructive");
    removeButton.textContent = '✖️';
    removeButton.onclick = () => div.remove();

    div.appendChild(inputIssueType);
    div.appendChild(inputColor);
    div.appendChild(removeButton);
    issueTypeColors.appendChild(div);
}

/**
 * Toggle the visibility of a section.
 * @param {string} sectionId - The ID of the section to toggle.
 */
function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const arrow = document.getElementById(`${sectionId}Arrow`);
    if (section.style.display === 'none' || section.style.display === '') {
        section.style.display = 'block';
        arrow.classList.add('expanded');
    } else {
        section.style.display = 'none';
        arrow.classList.remove('expanded');
    }
}

window.saveConfig = saveConfig;
window.loadConfig = loadConfig;
window.addIssueType = addIssueType;
window.toggleSection = toggleSection;