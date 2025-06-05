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

/**
 * Show loading spinner.
 */
export function showLoading() {
    document.getElementById("loading-container").style.display = "block";
    document.body.classList.add("loading"); // Add this line
}

/**
 * Hide loading spinner.
 */
export function hideLoading() {
    document.getElementById("loading-container").style.display = "none";
    document.body.classList.remove("loading"); // Add this line
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

    var weekendInput = document.getElementById("include-weekends");
    weekendInput.addEventListener("change", () => {
        window.calendar.setOption("weekends", weekendInput.checked);
        refreshEverything();
    });

    // Initialize project selector
    const headerProjectSelect = document.getElementById('headerProjectSelection');
    if (headerProjectSelect) {
        // Load saved project from localStorage or default to 'all'
        currentProject = localStorage.getItem('currentProject') || 'all';
        
        await loadProjects(headerProjectSelect, currentProject);
        
        headerProjectSelect.addEventListener('change', (event) => {
            changeProject(event.target.value);
        });
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
                    console.error('Error fetching issue options:', error);
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
                    console.error('Error fetching timer issue options:', error);
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
 * Search for issues based on search term - simplified to use only /issues/user endpoint
 * @param {string} searchTerm - The search term
 * @returns {Promise} - Promise that resolves to search results
 */
async function searchIssues(searchTerm) {
    if (!searchTerm || searchTerm.length < 3) {
        return Promise.resolve([]);
    }
    
    const project = getCurrentProject();
    
    try {
        showLoading();
        
        // Use current calendar dates if available, otherwise use a reasonable default range
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // Start of last month
        const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0); // End of next month
        
        const startDate = encodeURIComponent((window.calendar?.view?.activeStart || defaultStart).toISOString());
        const endDate = encodeURIComponent((window.calendar?.view?.activeEnd || defaultEnd).toISOString());
        const cacheBuster = Date.now();

        const response = await fetch(`/issues/user?start=${startDate}&end=${endDate}&query=${encodeURIComponent(searchTerm)}&project=${project}&_t=${cacheBuster}`);
        
        if (!response.ok) {
            console.error(`Issues API error: ${response.status}`);
            hideLoading();
            return [];
        }
        
        const data = await response.json();
        
        // Check for API error responses
        if (data.errorMessages || data.errors) {
            console.warn('Issues API returned errors:', data.errorMessages || data.errors);
            hideLoading();
            return [];
        }
        
        // Check if data is an array (expected format)
        if (!Array.isArray(data)) {
            console.warn('Issues endpoint returned unexpected format:', data);
            hideLoading();
            return [];
        }
        
        // Transform the data for Choices.js - consistent format for all modals
        const options = data.map((issue) => ({
            value: issue.issueId,
            label: `${issue.key} - ${issue.summary}`,
            customProperties: {
                key: issue.key,
                issueKey: issue.key,
                issueId: issue.issueId,
                summary: issue.summary
            }
        }));
        
        console.log(`Found ${options.length} issues for "${searchTerm}"`);
        hideLoading();
        return options;
        
    } catch (error) {
        console.error('Error searching issues:', error);
        hideLoading();
        return [];
    }
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
        
        // Store issue type icon for later use if available
        if (data.issueTypeIcon && modalType === 'create') {
            window.lastIssueTypeIcon = data.issueTypeIcon;
        }
        
    } catch (error) {
        console.error('Error fetching issue color:', error);
    }
}

/**
 * Setup form submission handlers
 */
function setupFormSubmissionHandlers() {
    // Remove the automatic form submission handlers that convert dates
    // These are now handled in the worklog.js handleSubmit function
    console.log('Form submission handlers initialized');
}

// Make functions available globally
window.searchIssues = searchIssues;
window.fetchAndSetIssueColor = fetchAndSetIssueColor;
window.setupFormSubmissionHandlers = setupFormSubmissionHandlers;
window.searchDebounce = searchDebounce;

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
        console.warn('No choices instance found for modal type:', modalType);
        return null;
    }
    
    console.log('Looking for issueId:', issueId, 'in modalType:', modalType);
    
    try {
        // Method 1: Check current state choices
        if (choicesInstance._currentState && choicesInstance._currentState.choices) {
            console.log('Available choices:', choicesInstance._currentState.choices);
            
            // Look for the choice by value (don't require selected=true since it might not be set yet)
            const choice = choicesInstance._currentState.choices.find(choice => 
                choice.value === issueId
            );
            
            if (choice) {
                console.log('Found choice:', choice);
                
                // First try direct properties
                if (choice.issueKey) {
                    console.log('Found issueKey directly:', choice.issueKey);
                    return choice.issueKey;
                }
                if (choice.key) {
                    console.log('Found key directly:', choice.key);
                    return choice.key;
                }
                
                // Then try customProperties if they exist
                if (choice.customProperties) {
                    console.log('CustomProperties:', choice.customProperties);
                    if (choice.customProperties.issueKey) {
                        return choice.customProperties.issueKey;
                    }
                    if (choice.customProperties.key) {
                        return choice.customProperties.key;
                    }
                }
                
                // Fallback: extract from label
                if (choice.label) {
                    console.log('Extracting from label:', choice.label);
                    const match = choice.label.match(/^([A-Z]+-\d+)/);
                    if (match) {
                        console.log('Extracted from label:', match[1]);
                        return match[1];
                    }
                }
            }
        }
        
        // Method 2: Try getValue() method
        if (typeof choicesInstance.getValue === 'function') {
            const selectedValue = choicesInstance.getValue(true);
            console.log('getValue(true) result:', selectedValue);
            
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
                console.log('Found in store:', storeChoice);
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
        console.warn('Error accessing Choices.js instance:', error);
    }
    
    console.warn('Could not find issue key for issueId:', issueId);
    return null;
}

window.applyTheme = applyTheme;
window.initializeUI = initializeUI;
window.initializeDropdown = initializeDropdown;
window.searchIssues = searchIssues;
window.fetchAndSetIssueColor = fetchAndSetIssueColor;
