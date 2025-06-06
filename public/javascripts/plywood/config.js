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

            // Set global variables - IMPORTANT: Set showIssueTypeIcons globally
            window.saveTimerOnIssueSwitch = config.saveTimerOnIssueSwitch;
            window.roundingInterval = config.roundingInterval || 15;
            window.showIssueTypeIcons = config.showIssueTypeIcons;
            
            console.log('showIssueTypeIcons setting loaded:', config.showIssueTypeIcons);
            
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


export async function loadProjects(targetElement, selectedValue = 'all') {
    let allProjects = [];
    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    while (hasMore) {
        const response = await fetch(`/projects?startAt=${startAt}&maxResults=${maxResults}`);
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

    // Initialize Choices.js
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

/**
 * Show icon cache information
 */
async function showIconCacheInfo() {
    try {
        const response = await fetch('/cached-icons/info');
        const data = await response.json();
        
        const infoDiv = document.getElementById('iconCacheInfo');
        const detailsDiv = document.getElementById('iconCacheDetails');
        
        let html = `<h4>Icon Cache Status</h4>`;
        html += `<p><strong>Total cached icons:</strong> ${data.totalCached}</p>`;
        
        if (data.icons && data.icons.length > 0) {
            html += `<div style="max-height: 200px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; margin-top: 10px;">`;
            html += `<table style="width: 100%; font-size: 12px;">`;
            html += `<thead><tr><th>Issue Type</th><th>Cached</th><th>Age</th></tr></thead>`;
            html += `<tbody>`;
            
            data.icons.forEach(icon => {
                const ageHours = Math.round(icon.age / (1000 * 60 * 60));
                const ageText = ageHours < 24 ? `${ageHours}h` : `${Math.round(ageHours / 24)}d`;
                
                html += `<tr>`;
                html += `<td>${icon.issueTypeId}</td>`;
                html += `<td>${new Date(icon.cached).toLocaleString()}</td>`;
                html += `<td>${ageText}</td>`;
                html += `</tr>`;
            });
            
            html += `</tbody></table>`;
            html += `</div>`;
        }
        
        detailsDiv.innerHTML = html;
        infoDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Error fetching icon cache info:', error);
        alert('Failed to fetch cache information');
    }
}

/**
 * Clean up icon cache
 */
async function cleanupIconCache() {
    try {
        showLoading();
        
        const response = await fetch('/cached-icons/cleanup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            alert('Icon cache cleanup completed successfully');
            // Refresh cache info if it's currently shown
            const infoDiv = document.getElementById('iconCacheInfo');
            if (infoDiv && infoDiv.style.display !== 'none') {
                await showIconCacheInfo();
            }
        } else {
            alert('Failed to cleanup cache: ' + (result.error || 'Unknown error'));
        }
        
    } catch (error) {
        console.error('Error cleaning up icon cache:', error);
        alert('Failed to cleanup cache: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Make functions available globally
window.showIconCacheInfo = showIconCacheInfo;
window.cleanupIconCache = cleanupIconCache;

window.saveConfig = saveConfig;
window.loadConfig = loadConfig;
window.addIssueType = addIssueType;
window.toggleSection = toggleSection;
