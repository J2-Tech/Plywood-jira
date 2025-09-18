import { refreshEverything } from "./calendar.js";
import { loadProjects } from './config.js';

// State management
let currentProject = localStorage.getItem('currentProject') || 'all';

// Theme management
export function initializeTheme() {
    const savedTheme = localStorage.getItem('themeSelection') || 'auto';
    applyTheme(savedTheme);
}

export function applyTheme(theme) {
    const body = document.body;
    body.classList.remove('light-theme', 'dark-theme');
    localStorage.setItem('themeSelection', theme);

    if (theme === 'auto') {
        const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
        theme = prefersDarkScheme.matches ? 'dark' : 'light';

        prefersDarkScheme.addEventListener('change', (e) => {
            applyTheme('auto'); // Re-apply auto theme on system change
        });
    }

    body.classList.add(`${theme}-theme`);
}

// Project management
export function getCurrentProject() {
    return currentProject;
}

export function initializeProject() {
    currentProject = localStorage.getItem('currentProject') || 'all';
    return currentProject;
}

export async function changeProject(projectKey) {
    currentProject = projectKey;
    localStorage.setItem('currentProject', projectKey);
    
    const headerProjectSelect = document.getElementById('headerProjectSelection');
    if (headerProjectSelect) {
        headerProjectSelect.value = projectKey;
    }

    if (window.location.pathname === '/stats') {
        await loadStats();
    } else {
        window.calendar?.refetchEvents();
    }
}

let loadingCount = 0;
let loadingStatus = '';

/**
 * Show loading spinner.
 */
export function showLoading(status = 'Loading...') {
    loadingCount++;
    loadingStatus = status;
    
    const loadingElement = document.getElementById('loading');
    const container = document.getElementById('loading-container');
    
    if (loadingElement) {
        loadingElement.style.visibility = 'visible';
        loadingElement.title = loadingStatus;
    }
    
    if (container) {
        container.style.visibility = 'visible';
        container.title = loadingStatus;
    }
    
    // Update any status text elements
    const statusElements = document.querySelectorAll('.loading-status-text');
    statusElements.forEach(el => {
        el.textContent = loadingStatus;
    });
    
}

/**
 * Hide loading spinner.
 */
export function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1);
    
    if (loadingCount === 0) {
        const loadingElement = document.getElementById('loading');
        const container = document.getElementById('loading-container');
        
        if (loadingElement) {
            loadingElement.style.visibility = 'hidden';
        }
        
        if (container) {
            container.style.visibility = 'hidden';
        }
        
    } else {
    }
}

export function setLoadingStatus(status) {
    loadingStatus = status;
    
    const loadingElement = document.getElementById('loading');
    const container = document.getElementById('loading-container');
    
    if (loadingElement) {
        loadingElement.title = loadingStatus;
    }
    
    if (container) {
        container.title = loadingStatus;
    }
    
    // Update any status text elements
    const statusElements = document.querySelectorAll('.loading-status-text');
    statusElements.forEach(el => {
        el.textContent = loadingStatus;
    });
    
}

/**
 * Initialize other UI elements.
 */
function initializeMenu() {
    const menuButton = document.getElementById('menuButton');
    const menuContent = document.getElementById('menuContent');

    if (!menuButton || !menuContent) return;

    menuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        menuContent.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (menuContent.classList.contains('show') && 
            !menuContent.contains(e.target) && 
            !menuButton.contains(e.target)) {
            menuContent.classList.remove('show');
        }
    });
}

// Ensure initialization happens after DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMenu);
} else {
    initializeMenu();
}

export async function initializeUI() {
    initializeTheme();
    await initializeProject();
    
    initializeMenu();
    
    // Add form submission handler for worklog forms
    setupFormSubmissionHandlers();
    
    var slider = document.getElementById("zoom-range");
    if (slider) {
        slider.oninput = function () {
        var timeVal = this.value;

        if (timeVal < 10) {
            timeVal = "0" + timeVal;
        }

        var zoomLabel = document.getElementById("zoom-output");
        switch (this.value) {
            case "1":
                window.calendar.setOption("slotDuration", "00:30:00");
                zoomLabel.innerHTML = "30 minutes / slot";
                break;
            case "2":
                window.calendar.setOption("slotDuration", "00:15:00");
                zoomLabel.innerHTML = "15 minutes / slot";
                break;
            case "3":
                window.calendar.setOption("slotDuration", "00:10:00");
                zoomLabel.innerHTML = "10 minutes / slot";
                break;
            case "4":
                window.calendar.setOption("slotDuration", "00:05:00");
                zoomLabel.innerHTML = "5 minutes / slot";
                break;
        }
    };
    }

    var weekendInput = document.getElementById("include-weekends");
    if (weekendInput) {
        weekendInput.addEventListener("change", () => {
            window.calendar.setOption("weekends", weekendInput.checked);
            refreshEverything();
        });
    }

    // Initialize project selector (skip on stats page as it's handled by stats.js)
    if (window.location.pathname !== '/stats') {
        const headerProjectSelect = document.getElementById('headerProjectSelection');
        if (headerProjectSelect) {
            // Load saved project from localStorage or default to 'all'
            currentProject = localStorage.getItem('currentProject') || 'all';
            
            await loadProjects(headerProjectSelect, currentProject);
            
            headerProjectSelect.addEventListener('change', (event) => {
                changeProject(event.target.value);
            });
        }
    }

    hideLoading();
    initializeMenu();
}

/**
 * Initialize dropdowns.
 */
export function initializeDropdown() {
    const createIssueSelect = document.getElementById('issue-create');
    if (createIssueSelect) {
        const choicesCreate = new Choices(createIssueSelect, {
            searchEnabled: true,
            searchFields: ['key', 'label'],
            itemSelectText: '',
            searchFloor: 3,
            shouldSort: true,
            shouldSortItems: true,
            placeholderValue: 'Select an issue...',
            noResultsText: 'No issues found',
        });

        // Make it globally available
        window.choicesCreate = choicesCreate;

        const fetchCreateOptions = searchDebounce((searchTerm) => {
            searchIssues(searchTerm)
                .then(options => {
                    choicesCreate.setChoices(options, 'value', 'label', true);
                })
                .catch(error => {
                });
        }, 300);

        createIssueSelect.addEventListener('search', (event) => {
            fetchCreateOptions(event.detail.value);
        });

        // Add change event listener to fetch and set issue color
        createIssueSelect.addEventListener('change', async (event) => {
            const selectedValue = event.detail.value;
            if (selectedValue) {
                await fetchAndSetIssueColor(selectedValue, 'create');
            }
        });
    }

    const timerIssueSelect = document.getElementById('issue-timer');
    if (timerIssueSelect) {
        const choicesTimer = new Choices(timerIssueSelect, {
            searchEnabled: true,
            searchFields: ['key', 'label'],
            itemSelectText: '',
            searchFloor: 3,
            shouldSort: true,
            shouldSortItems: true,
        });

        window.choicesTimer = choicesTimer;

        const fetchTimerOptions = searchDebounce((searchTerm) => {
            searchIssues(searchTerm)
                .then(options => {
                    choicesTimer.setChoices(options, 'value', 'label', true);
                })
                .catch(error => {
                });
        }, 300);

        timerIssueSelect.addEventListener('search', (event) => {
            fetchTimerOptions(event.detail.value);
        });
    }
}

/**
 * Debounce function for search.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The debounce delay in milliseconds.
 * @returns {Function} - The debounced function.
 */
function searchDebounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Fetch and set issue color for modals
 * @param {string} issueId - The issue ID
 * @param {string} modalType - The modal type ('create' or 'update')
 */
async function fetchAndSetIssueColor(issueId, modalType) {
    try {
        const response = await fetch(`/issues/${issueId}/color`);
        const data = await response.json();
        
        const colorInputId = modalType === 'create' ? 'issue-key-color-create' : 'issue-key-color';
        const colorInput = document.getElementById(colorInputId);
        
        if (colorInput && data.color) {
            colorInput.value = data.color;
        }
        
        // Fetch and cache issue type icon
        if (modalType === 'create') {
            try {
                // Use our proxy endpoint for issue type icons
                const iconData = await fetch(`/issuetypes/${issueId}/avatar`).then(res => res.json());
                
                if (iconData && iconData.avatarUrls) {
                    // Use our proxy URLs instead of original JIRA URLs
                    window.lastIssueTypeIcon = iconData.avatarUrls['24x24'] || iconData.avatarUrls['16x16'];
                    window.lastIssueTypeName = iconData.name;
                    
                    // Immediately display the icon in the create modal
                    displayIconInCreateModal(window.lastIssueTypeIcon, iconData.name);
                } else {
                }
            } catch (iconError) {
            }
        }
        
    } catch (error) {
    }
}

/**
 * Display icon in the create modal when an issue is selected
 * @param {string} iconUrl - The icon URL
 * @param {string} iconName - The icon name
 */
function displayIconInCreateModal(iconUrl, iconName) {
    if (!window.showIssueTypeIcons || !iconUrl) return;
    
    // Find the create modal and the issue select container
    const createModal = document.querySelector('.modal-create');
    if (!createModal) return;
    
    const issueSelectContainer = createModal.querySelector('#issue-create').closest('.choices');
    if (!issueSelectContainer) return;
    
    // Find or create the icon display element
    let iconDisplay = createModal.querySelector('.selected-issue-icon');
    if (!iconDisplay) {
        iconDisplay = document.createElement('div');
        iconDisplay.className = 'selected-issue-icon';
        iconDisplay.style.cssText = 'display: flex; align-items: center; margin-top: 8px; padding: 4px; background: rgba(0,0,0,0.05); border-radius: 4px;';
        
        // Insert after the issue select container
        issueSelectContainer.parentNode.insertBefore(iconDisplay, issueSelectContainer.nextSibling);
    }
    
    // Create or update the icon image
    let iconImg = iconDisplay.querySelector('img');
    if (!iconImg) {
        iconImg = document.createElement('img');
        iconImg.style.cssText = 'width: 20px; height: 20px; margin-right: 8px;';
        iconDisplay.insertBefore(iconImg, iconDisplay.firstChild);
    }
    
    // Create or update the icon label
    let iconLabel = iconDisplay.querySelector('.icon-label');
    if (!iconLabel) {
        iconLabel = document.createElement('span');
        iconLabel.className = 'icon-label';
        iconLabel.style.cssText = 'font-size: 14px; color: #666;';
        iconDisplay.appendChild(iconLabel);
    }
    
    // Set the icon and label
    iconImg.src = iconUrl;
    iconImg.alt = iconName || 'Issue Type';
    iconImg.title = iconName || 'Issue Type';
    iconLabel.textContent = `Issue Type: ${iconName || 'Unknown'}`;
    
    // Handle icon load errors
    iconImg.onerror = function() {
        iconDisplay.style.display = 'none';
    };
    
    // Show the icon display
    iconDisplay.style.display = 'flex';
}

/**
 * Update issue display with cached icon
 * @param {HTMLElement} element - The element to update
 * @param {string} issueTypeId - Issue type ID
 * @param {string} issueTypeName - Issue type name
 * @param {string} localIconUrl - Local cached icon URL
 */
function updateIssueDisplayWithCachedIcon(element, issueTypeId, issueTypeName, localIconUrl) {
    if (!element || !window.showIssueTypeIcons) return;
    
    // Find or create avatar element
    let avatarElement = element.querySelector('.issue-type-avatar');
    if (!avatarElement) {
        avatarElement = document.createElement('img');
        avatarElement.className = 'issue-type-avatar';
        avatarElement.style.cssText = 'width: 16px; height: 16px; margin-right: 4px; vertical-align: middle;';
        element.insertBefore(avatarElement, element.firstChild);
    }
    
    if (localIconUrl) {
        avatarElement.src = localIconUrl;
        avatarElement.alt = issueTypeName || 'Issue Type';
        avatarElement.title = issueTypeName || 'Issue Type';
        avatarElement.style.display = 'inline';
        
        // Handle load errors by hiding the icon
        avatarElement.onerror = function() {
            console.warn(`Failed to load cached icon: ${localIconUrl}`);
            this.style.display = 'none';
        };
    } else {
        // Hide icon if no cached version available
        avatarElement.style.display = 'none';
    }
}

/**
 * Get objectives issues for inclusion in search results
 */
async function getObjectivesIssues() {
    try {
        // Check if objectives manager exists and has objectives loaded
        if (window.objectivesManager && window.objectivesManager.objectives) {
            return window.objectivesManager.objectives.map(objective => ({
                value: objective.issueKey, // Use issueKey as value for objectives
                label: `${objective.issueKey} - ${objective.issueSummary || ''}`,
                customProperties: {
                    key: objective.issueKey,
                    issueKey: objective.issueKey,
                    issueId: objective.issueKey, // For objectives, we use issueKey as issueId
                    summary: objective.issueSummary || '',
                    issueType: 'Objective',
                    isObjective: true,
                    objectiveId: objective.id
                }
            }));
        }
        return [];
    } catch (error) {
        console.error('Error getting objectives issues:', error);
        return [];
    }
}

/**
 * Enhanced search function that includes icon caching and objectives
 */
async function searchIssues(searchTerm) {
    if (!searchTerm || searchTerm.length < 3) {
        return Promise.resolve([]);
    }
    
    const project = getCurrentProject();
    
    try {
        showLoading();
        
        // Get objectives issues first
        const objectivesIssues = await getObjectivesIssues();
        
        // Filter objectives that match the search term
        const matchingObjectives = objectivesIssues.filter(objective => {
            const searchLower = searchTerm.toLowerCase();
            return objective.customProperties.key.toLowerCase().includes(searchLower) ||
                   objective.customProperties.summary.toLowerCase().includes(searchLower);
        });
        
        // Use current calendar dates if available, otherwise use a reasonable default range
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // Start of last month
        const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0); // End of next month
        
        const startDate = encodeURIComponent((window.calendar?.view?.activeStart || defaultStart).toISOString());
        const endDate = encodeURIComponent((window.calendar?.view?.activeEnd || defaultEnd).toISOString());
        const cacheBuster = Date.now();

        const response = await fetch(`/issues/user?start=${startDate}&end=${endDate}&query=${encodeURIComponent(searchTerm)}&project=${project}&_t=${cacheBuster}`);
        
        if (!response.ok) {
            hideLoading();
            return matchingObjectives; // Return objectives even if API fails
        }
        
        const data = await response.json();
        
        // Check for API error responses
        if (data.errorMessages || data.errors) {
            hideLoading();
            return matchingObjectives; // Return objectives even if API fails
        }
        
        // Check if data is an array (expected format)
        if (!Array.isArray(data)) {
            hideLoading();
            return matchingObjectives; // Return objectives even if API fails
        }
        
        // Transform the data for Choices.js - enhanced with icon caching
        const apiOptions = await Promise.all(data.map(async (issue) => {
            let localIconUrl = null;
            
            // Try to get cached icon for the issue type
            if (issue.issueTypeIcon && window.showIssueTypeIcons) {
                try {
                    const iconResponse = await fetch(`/issues/${issue.issueId}/icon`);
                    const iconData = await iconResponse.json();
                    if (iconData.localIconUrl) {
                        localIconUrl = iconData.localIconUrl;
                    }
                } catch (iconError) {
                }
            }
            
            return {
                value: issue.issueId,
                label: `${issue.key} - ${issue.summary}`,
                customProperties: {
                    key: issue.key,
                    issueKey: issue.key,
                    issueId: issue.issueId,
                    summary: issue.summary,
                    issueType: issue.issueType,
                    localIconUrl: localIconUrl,
                    isObjective: false
                }
            };
        }));
        
        // Combine objectives and API results, with objectives first
        const allOptions = [...matchingObjectives, ...apiOptions];
        
        // Remove duplicates based on issue key
        const uniqueOptions = [];
        const seenKeys = new Set();
        
        for (const option of allOptions) {
            const key = option.customProperties.key;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueOptions.push(option);
            }
        }
        
        hideLoading();
        return uniqueOptions;
        
    } catch (error) {
        hideLoading();
        // Return objectives even if API fails
        const objectivesIssues = await getObjectivesIssues();
        const matchingObjectives = objectivesIssues.filter(objective => {
            const searchLower = searchTerm.toLowerCase();
            return objective.customProperties.key.toLowerCase().includes(searchLower) ||
                   objective.customProperties.summary.toLowerCase().includes(searchLower);
        });
        return matchingObjectives;
    }
}

/**
 * Setup form submission handlers
 */
function setupFormSubmissionHandlers() {
    // Remove the automatic form submission handlers that convert dates
    // These are now handled in the worklog.js handleSubmit function
}

/**
 * Toggle notes panel visibility
 */
export function toggleNotesPanel() {
    // Use the new notes module function
    if (window.toggleNotesPanel) {
        window.toggleNotesPanel();
    } else {
    }
}

// Add keyboard shortcut for notes
document.addEventListener('keydown', function(e) {
    // Ctrl+N or Cmd+N to toggle notes
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        toggleNotesPanel();
    }
});

// Restore notes panel state on page load
document.addEventListener('DOMContentLoaded', function() {
    const notesVisible = localStorage.getItem('notes-panel-visible') === 'true';
    if (notesVisible) {
        setTimeout(() => {
            toggleNotesPanel();
        }, 100);
    }
});

// Make functions available globally
window.searchIssues = searchIssues;
window.fetchAndSetIssueColor = fetchAndSetIssueColor;
window.setupFormSubmissionHandlers = setupFormSubmissionHandlers;
window.searchDebounce = searchDebounce;
window.toggleNotesPanel = toggleNotesPanel;

/**
 * Convert datetime-local inputs to ISO format before form submission
 * @param {HTMLFormElement} form - The form element
 */
function convertDateTimeInputsToISO(form) {
    const startTimeInput = form.querySelector('input[name="startTime"]');
    const endTimeInput = form.querySelector('input[name="endTime"]');
    
    if (startTimeInput && startTimeInput.value) {
        const startDate = new Date(startTimeInput.value);
        startTimeInput.value = startDate.toISOString();
    }
    
    if (endTimeInput && endTimeInput.value) {
        const endDate = new Date(endTimeInput.value);
        endTimeInput.value = endDate.toISOString();
    }
}

/**
 * Get issue key from the selected option
 * @param {string} issueId - The selected issue ID
 * @param {string} modalType - 'create' or 'update'
 * @returns {string|null} The issue key or null if not found
 */
function getIssueKeyFromSelection(issueId, modalType) {
    const choicesInstance = modalType === 'create' ? window.choicesCreate : window.choicesTimer;
    if (!choicesInstance) {
        return null;
    }
    
    
    try {
        // Method 1: Check current state choices
        if (choicesInstance._currentState && choicesInstance._currentState.choices) {
            
            // Look for the choice by value (don't require selected=true since it might not be set yet)
            const choice = choicesInstance._currentState.choices.find(choice => 
                choice.value === issueId
            );
            
            if (choice) {
                
                // First try direct properties
                if (choice.issueKey) {
                    return choice.issueKey;
                }
                if (choice.key) {
                    return choice.key;
                }
                
                // Then try customProperties if they exist
                if (choice.customProperties) {
                    if (choice.customProperties.issueKey) {
                        return choice.customProperties.issueKey;
                    }
                    if (choice.customProperties.key) {
                        return choice.customProperties.key;
                    }
                }
                
                // Fallback: extract from label
                if (choice.label) {
                    const match = choice.label.match(/^([A-Z]+-\d+)/);
                    if (match) {
                        return match[1];
                    }
                }
            }
        }
        
        // Method 2: Try getValue() method
        if (typeof choicesInstance.getValue === 'function') {
            const selectedValue = choicesInstance.getValue(true);
            
            if (selectedValue) {
                // Handle case where getValue returns an object
                if (typeof selectedValue === 'object') {
                    if (selectedValue.issueKey) {
                        return selectedValue.issueKey;
                    }
                    if (selectedValue.key) {
                        return selectedValue.key;
                    }
                    if (selectedValue.customProperties && selectedValue.customProperties.issueKey) {
                        return selectedValue.customProperties.issueKey;
                    }
                    if (selectedValue.label) {
                        const match = selectedValue.label.match(/^([A-Z]+-\d+)/);
                        if (match) return match[1];
                    }
                }
            }
        }
        
        // Method 3: Check if we can find it in the store/cache
        if (choicesInstance._store && choicesInstance._store.choices) {
            const storeChoice = choicesInstance._store.choices.find(choice => 
                choice.value === issueId
            );
            if (storeChoice) {
                if (storeChoice.customProperties && storeChoice.customProperties.issueKey) {
                    return storeChoice.customProperties.issueKey;
                }
                if (storeChoice.label) {
                    const match = storeChoice.label.match(/^([A-Z]+-\d+)/);
                    if (match) return match[1];
                }
            }
        }
        
    } catch (error) {
    }
    
    return null;
}

window.applyTheme = applyTheme;
window.initializeUI = initializeUI;
window.initializeDropdown = initializeDropdown;
window.searchIssues = searchIssues;
window.fetchAndSetIssueColor = fetchAndSetIssueColor;
