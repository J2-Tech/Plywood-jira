import { hideModal } from './modal.js';
import { applyTheme, getCurrentProject, changeProject } from './ui.js';

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
        const issueType = issueTypeColor.querySelector('input[type="text"]').value.toLowerCase(); // Convert to lowercase
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
            
            hideModal('#configModal');
            applyTheme(config.themeSelection);
            window.showIssueTypeIcons = config.showIssueTypeIcons;
            window.roundingInterval = config.roundingInterval;
            window.saveTimerOnIssueSwitch = config.saveTimerOnIssueSwitch;
            
            console.log('showIssueTypeIcons setting saved:', config.showIssueTypeIcons);
            
            if (window.calendar) {
                window.calendar.refetchEvents();
            }
        }
    });
}

/**
 * Load configuration settings.
 */
export function loadConfig() {
    return window.apiClient.get('/config/getConfig')
        .then(response => {
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    console.log('Authentication required - redirecting to login');
                    window.location.href = '/auth/login';
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(async config => {
            if (!config) {
                console.warn('No config received, using defaults');
                config = {};
            }
            
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

            // Set global variables - IMPORTANT: Set showIssueTypeIcons globally
            window.saveTimerOnIssueSwitch = config.saveTimerOnIssueSwitch;
            window.roundingInterval = config.roundingInterval || 15;
            window.showIssueTypeIcons = config.showIssueTypeIcons;
            
            console.log('showIssueTypeIcons setting loaded:', config.showIssueTypeIcons);
            
            return config;
        })
        .catch(error => {
            console.error('Error loading config:', error);
            
            // Handle authentication errors
            if (error.message && (error.message.includes('401') || error.message.includes('Authentication'))) {
                console.log('Authentication error in loadConfig - redirecting to login');
                window.location.href = '/auth/login';
                return {};
            }
            
            // Return default config on error
            const defaultConfig = {
                showIssueTypeIcons: true,
                themeSelection: localStorage.getItem('themeSelection') || 'auto',
                roundingInterval: 15,
                issueColors: {},
                selectedProject: localStorage.getItem('currentProject') || 'all'
            };
            
            console.warn('Using default config due to load error');
            return defaultConfig;
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


export async function loadProjects(targetElement, selectedValue = 'all') {
    let allProjects = [];
    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    try {
        while (hasMore) {
            // Use apiClient for automatic token refresh
            const response = await window.apiClient.get(`/projects?startAt=${startAt}&maxResults=${maxResults}`);
            
            if (!response.ok) {
                // Check for auth errors
                if (response.status === 401 || response.status === 403) {
                    const errorData = await response.json().catch(() => ({}));
                    if (errorData.authFailure) {
                        console.log('Authentication required - redirecting to login');
                        window.location.href = '/auth/login';
                        return;
                    }
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            allProjects = allProjects.concat(data.values);
            
            hasMore = startAt + maxResults < data.total;
            startAt += maxResults;
        }

        // Convert projects to Choices.js format
        const choices = [
            { value: 'all', label: 'All Projects' },
            ...allProjects.map(project => ({
                value: project.key,
                label: `${project.key} - ${project.name}`
            }))
        ];

        // Destroy existing Choices instance if it exists
        if (targetElement.choices) {
            targetElement.choices.destroy();
        }
        
        // Initialize new Choices.js instance
        const choicesInstance = new Choices(targetElement, {
            choices,
            searchEnabled: true,
            searchFields: ['label'],
            itemSelectText: '',
            shouldSort: true,
            shouldSortItems: true,
            position: 'bottom'
        });

        // Set selected value
        choicesInstance.setChoiceByValue(selectedValue);

        return choicesInstance;
        
    } catch (error) {
        console.error('Error loading projects:', error);
        
        // Handle authentication errors
        if (error.message && (error.message.includes('401') || error.message.includes('Authentication'))) {
            console.log('Authentication error in loadProjects - redirecting to login');
            window.location.href = '/auth/login';
            return;
        }
        
        // For other errors, show a fallback option
        const choices = [{ value: 'all', label: 'All Projects (Error loading)' }];
        
        // Destroy existing Choices instance if it exists
        if (targetElement.choices) {
            targetElement.choices.destroy();
        }
        
        // Initialize new Choices.js instance
        const choicesInstance = new Choices(targetElement, {
            choices,
            searchEnabled: false
        });
        
        choicesInstance.setChoiceByValue(selectedValue);
        return choicesInstance;
    }
}


// Make functions available globally
window.saveConfig = saveConfig;
window.loadConfig = loadConfig;
window.addIssueType = addIssueType;
window.toggleSection = toggleSection;
