import { hideModal } from './modal.js';
import { applyTheme } from './ui.js';
import { showLoading, hideLoading } from './ui.js';

/**
 * Save configuration settings.
 */
export function saveConfig() {
    const config = {
        showIssueTypeIcons: document.getElementById('showIssueTypeIcons').checked,
        themeSelection: document.getElementById('themeSelection').value,
        roundingInterval: parseInt(document.getElementById('rounding-interval').value, 10),
        saveTimerOnIssueSwitch: document.getElementById('save-timer-on-issue-switch').checked,
        issueColors: {}
    };

    // Gather issue colors from the DOM
    const issueTypeColors = document.getElementById('issueTypeColors').children;
    for (const issueTypeColor of issueTypeColors) {
        const issueType = issueTypeColor.querySelector('input[type="text"]').value;
        const color = issueTypeColor.querySelector('input[type="color"]').value;
        if (issueType) {
            config.issueColors[issueType] = color;
        }
    }

    // Detect removed colors
    const previousConfig = window.previousConfig || {};
    const removedColors = Object.keys(previousConfig.issueColors || {}).filter(issueType => !(issueType in config.issueColors));

    fetch('/config/saveConfig', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
    }).then(response => {
        if (response.ok) {
            hideModal('#configModal');
            if (config.themeSelection !== document.body.className) {
                applyTheme(config.themeSelection);
            }
            if (config.showIssueTypeIcons !== window.showIssueTypeIcons) {
                window.showIssueTypeIcons = config.showIssueTypeIcons;
                window.calendar.refetchEvents();
            }
            window.roundingInterval = config.roundingInterval;
            syncRoundingInterval();

            // Refresh relevant issues
            removedColors.forEach(issueType => {
                refreshAllWorklogsOfIssueType(issueType);
            });
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
            window.roundingInterval = config.roundingInterval || 15;
            syncRoundingInterval();

            const issueTypeColors = document.getElementById('issueTypeColors');
            issueTypeColors.innerHTML = '';

            for (const [issueType, color] of Object.entries(config.issueColors)) {
                addIssueType(issueType, color);
            }

            applyTheme(config.themeSelection);
            window.previousConfig = config;
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

/**
 * Syncs the rounding interval inputs.
 */
function syncRoundingInterval() {
    const configRoundingIntervalInput = document.getElementById('rounding-interval');
    const timerRoundingIntervalInput = document.getElementById('timer-rounding-interval');
    if (configRoundingIntervalInput) {
        configRoundingIntervalInput.value = window.roundingInterval;
    }
    if (timerRoundingIntervalInput) {
        timerRoundingIntervalInput.value = window.roundingInterval;
    }
}

/**
 * Refresh all worklogs of a specific issue type.
 * @param {string} issueType - The issue type to refresh.
 */
function refreshAllWorklogsOfIssueType(issueType) {
    const events = window.calendar.getEvents();
    events.forEach(event => {
        if (event.extendedProps.issueType.toLowerCase() === issueType.toLowerCase()) {
            refreshWorklog(event.extendedProps.issueId, event.extendedProps.worklogId);
        }
    });
}

window.saveConfig = saveConfig;
window.loadConfig = loadConfig;
window.addIssueType = addIssueType;
window.toggleSection = toggleSection;