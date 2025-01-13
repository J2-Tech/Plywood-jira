import { refreshEverything } from "./calendar.js";
import { loadProjects } from './config.js';

let currentProject = 'all';

export function getCurrentProject() {
    return currentProject;
}

export async function changeProject(projectKey) {
    currentProject = projectKey;
    
    // Save to localStorage for persistence
    localStorage.setItem('currentProject', projectKey);
    
    // Save to config
    await fetch('/config/saveConfig', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            selectedProject: projectKey
        }),
    });

    // Sync both dropdowns
    const headerProjectSelect = document.getElementById('headerProjectSelection');
    const configProjectSelect = document.getElementById('projectSelection');
    
    if (headerProjectSelect) {
        headerProjectSelect.value = projectKey;
    }
    if (configProjectSelect) {
        configProjectSelect.value = projectKey;
    }

    // Refresh calendar or stats based on current page
    if (window.location.pathname === '/stats') {
        loadStats(); // Make sure loadStats is available globally
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
    // Existing initialization code...
    
    initializeMenu();
    
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
    const choicesCreate = new Choices(createIssueSelect, {
        searchEnabled: true,
        searchFields: ['key', 'label'],
        itemSelectText: '',
        searchFloor: 3,
        shouldSort: true,
        shouldSortItems: true,
    });

    const fetchCreateOptions = searchDebounce((searchTerm) => {
        searchIssues(searchTerm)
            .then(options => {
                choicesCreate.setChoices(options, 'value', 'label', true);
            });
    }, 300);

    createIssueSelect.addEventListener('search', (event) => {
        fetchCreateOptions(event.detail.value);
    });

    const timerIssueSelect = document.getElementById('issue-timer');
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
            });
    }, 300);

    timerIssueSelect.addEventListener('search', (event) => {
        fetchTimerOptions(event.detail.value);
    });
}

/**
 * Debounce function for search.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The debounce delay in milliseconds.
 * @returns {Function} - The debounced function.
 */
function searchDebounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Search issues.
 * @param {string} query - The search query.
 * @returns {Promise<Array>} - The search results.
 */
function searchIssues(query) {
    const startDate = encodeURIComponent(new Date(window.calendar.view.activeStart).toISOString());
    const endDate = encodeURIComponent(new Date(window.calendar.view.activeEnd).toISOString());
    const project = encodeURIComponent(getCurrentProject());

    showLoading();
    return fetch(`/issues/user?start=${startDate}&end=${endDate}&query=${query}&project=${project}`)
        .then((res) => res.json())
        .then((data) => {
            const options = data.map((issue) => ({
                value: issue.id,
                label: `${issue.key} - ${issue.summary}`,
                key: issue.key,
            }));
            hideLoading();
            return options;
        })
        .catch((error) => {
            handleError(error);
            hideLoading();
        });
}

export function applyTheme(theme) {
    const body = document.body;
    body.classList.remove('light-theme', 'dark-theme');

    if (theme === 'auto') {
        const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
        theme = prefersDarkScheme.matches ? 'dark' : 'light';

        // Listen for changes in the system theme
        prefersDarkScheme.addEventListener('change', (e) => {
            const newTheme = e.matches ? 'dark' : 'light';
            body.classList.remove('light-theme', 'dark-theme');
            body.classList.add(`${newTheme}-theme`);
        });
    }

    body.classList.add(`${theme}-theme`);
}

window.applyTheme = applyTheme;
window.initializeUI = initializeUI;
window.initializeDropdown = initializeDropdown;
window.searchIssues = searchIssues;
