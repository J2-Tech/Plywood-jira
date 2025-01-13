import { hideModal } from './modal.js';
import { applyTheme, getCurrentProject, changeProject } from './ui.js';
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
        selectedProject: document.getElementById('projectSelection').value,
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

    return fetch('/config/saveConfig', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
    }).then(response => {
        if (response.ok) {
            window.previousConfig = config;
            localStorage.setItem('themeSelection', config.themeSelection);
            localStorage.setItem('currentProject', config.selectedProject);
            
            hideModal('#configModal');
            applyTheme(config.themeSelection);
            window.showIssueTypeIcons = config.showIssueTypeIcons;
            window.roundingInterval = config.roundingInterval;
            window.saveTimerOnIssueSwitch = config.saveTimerOnIssueSwitch;
            
            if (window.calendar) {
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
        .then(async config => {
            // Set default values if undefined
            config = {
                showIssueTypeIcons: true,
                themeSelection: localStorage.getItem('themeSelection') || 'auto',
                roundingInterval: 15,
                issueColors: {},
                selectedProject: localStorage.getItem('currentProject') || 'all',
                ...config  // Merge with saved config
            };

            // Store config globally
            window.previousConfig = config;

            // Update form inputs if they exist
            const showIssueTypeIconsInput = document.getElementById('showIssueTypeIcons');
            const themeSelectionInput = document.getElementById('themeSelection');
            const roundingIntervalInput = document.getElementById('rounding-interval');
            const timerRoundingIntervalInput = document.getElementById('timer-rounding-interval');
            const saveTimerOnIssueSwitchInput = document.getElementById('save-timer-on-issue-switch');

            if (showIssueTypeIconsInput) showIssueTypeIconsInput.checked = config.showIssueTypeIcons;
            if (themeSelectionInput) themeSelectionInput.value = config.themeSelection;
            if (roundingIntervalInput) roundingIntervalInput.value = config.roundingInterval || 15;
            if (timerRoundingIntervalInput) timerRoundingIntervalInput.value = config.roundingInterval || 15;
            if (saveTimerOnIssueSwitchInput) saveTimerOnIssueSwitchInput.checked = config.saveTimerOnIssueSwitch;

            // Clear and populate issue colors
            const issueTypeColors = document.getElementById('issueTypeColors');
            if (issueTypeColors) {
                issueTypeColors.innerHTML = ''; // Clear existing colors
                Object.entries(config.issueColors || {}).forEach(([issueType, color]) => {
                    addIssueType(issueType, color);
                });
            }

            // Set global variables
            window.saveTimerOnIssueSwitch = config.saveTimerOnIssueSwitch;
            window.roundingInterval = config.roundingInterval || 15;
            window.showIssueTypeIcons = config.showIssueTypeIcons;
            
            return config;
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

export async function loadProjects(targetElement, selectedValue = 'all') {
    const response = await fetch('/projects');
    const data = await response.json();
    targetElement.innerHTML = '<option value="all">All Projects</option>';
    
    data.values.forEach(project => {
        const option = document.createElement('option');
        option.value = project.key;
        option.textContent = `${project.key} - ${project.name}`;
        targetElement.appendChild(option);
    });

    targetElement.value = selectedValue;
}

export async function initializeProjectSelectors() {
    const headerProjectSelect = document.getElementById('headerProjectSelection');
    const configProjectSelect = document.getElementById('projectSelection');
    
    // Get current project using the getter from ui.js
    const savedProject = localStorage.getItem('currentProject') || 'all';
    
    if (headerProjectSelect) {
        await loadProjects(headerProjectSelect, savedProject);
        headerProjectSelect.addEventListener('change', (event) => {
            changeProject(event.target.value);
        });
    }
    
    if (configProjectSelect) {
        await loadProjects(configProjectSelect, savedProject);
        configProjectSelect.addEventListener('change', (event) => {
            changeProject(event.target.value);
        });
    }
}

window.saveConfig = saveConfig;
window.loadConfig = loadConfig;
window.addIssueType = addIssueType;
window.toggleSection = toggleSection;
