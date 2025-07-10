// main.js

import { initializeUI, initializeDropdown, applyTheme } from './ui.js';
import { initializeCalendar } from './calendar.js';
import { loadConfig } from './config.js';
import { initializeSprint } from './sprint.js';
import { initializeNotesPanel } from './notes.js';
import './notesList.js'; // Import notes list functionality

// Main application JavaScript

// Global app state
window.appState = {
    isNotesOpen: false
};

// Add loading state management
let isLoadingData = false;

async function initializeApp() {
    try {
        // First load config and apply saved settings
        const config = await loadConfig();
        
        // Initialize UI with saved config
        await initializeUI();
        initializeDropdown();
        
        // Initialize calendar only on main page
        if (window.location.pathname === '/') {
            initializeCalendar();
        }        // Initialize sprint functionality
        initializeSprint();
        
        // Initialize notes panel
        initializeNotesPanel();

        // Apply theme after everything is initialized
        const savedTheme = localStorage.getItem('themeSelection') || config.themeSelection;
        if (savedTheme) {
            applyTheme(savedTheme);
        }
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

async function loadCalendarData() {
    if (isLoadingData) {
        console.log('Already loading data, skipping duplicate request');
        return;
    }
    
    isLoadingData = true;
    showLoading();
    
    try {
        const view = calendar.view;
        const start = formatDateForAPI(view.activeStart);
        const end = formatDateForAPI(view.activeEnd);
        
        console.log(`Loading calendar data for ${start} to ${end}`);
        
        // Start both requests in parallel
        const worklogsPromise = fetchWorklogs(start, end);
        const projectsPromise = loadProjects();
        
        // Wait for both to complete
        const [worklogsData, projectsData] = await Promise.all([
            worklogsPromise,
            projectsPromise
        ]);
        
        // Process the results
        if (worklogsData && worklogsData.length > 0) {
            calendar.removeAllEvents();
            calendar.addEventSource(worklogsData);
            updateTotalTime(worklogsData);
            console.log(`Loaded ${worklogsData.length} worklog events`);
        } else {
            calendar.removeAllEvents();
            updateTotalTime([]);
            console.log('No worklog events found for the current period');
        }
        
        // Projects are handled by loadProjects() function
        
    } catch (error) {
        console.error('Error loading calendar data:', error);
        
        // Show user-friendly error message
        if (error.message && error.message.includes('401')) {
            showAuthError();
        } else {
            showErrorMessage('Failed to load calendar data. Please refresh the page.');
        }
    } finally {
        hideLoading();
        isLoadingData = false;
    }
}

async function fetchWorklogs(start, end) {
    const projectParam = getSelectedProject();
    const url = `/worklog?start=${start}&end=${end}&project=${projectParam}`;
    
    console.log(`Fetching worklogs from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Authentication required');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
}

async function loadProjects() {
    try {
        console.log('Loading projects...');
        
        const response = await fetch('/projects');
        
        if (!response.ok) {
            console.warn(`Projects request failed: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        const projects = data.values || [];
        
        console.log(`Loaded ${projects.length} projects`);
        
        // Update project selector
        updateProjectSelector(projects);
        
        return projects;
    } catch (error) {
        console.error('Error loading projects:', error);
        return [];
    }
}

function updateProjectSelector(projects) {
    const selectors = [
        document.getElementById('headerProjectSelection'),
        document.getElementById('projectSelection')
    ].filter(Boolean);
    
    selectors.forEach(selector => {
        // Store current selection
        const currentValue = selector.value;
        
        // Clear existing options except "All Projects"
        const allOption = selector.querySelector('option[value="all"]');
        selector.innerHTML = '';
        if (allOption) {
            selector.appendChild(allOption);
        } else {
            const newAllOption = document.createElement('option');
            newAllOption.value = 'all';
            newAllOption.textContent = 'All Projects';
            selector.appendChild(newAllOption);
        }
        
        // Add project options
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.key;
            option.textContent = `${project.key} - ${project.name}`;
            selector.appendChild(option);
        });
        
        // Restore selection or default to "all"
        if (currentValue && selector.querySelector(`option[value="${currentValue}"]`)) {
            selector.value = currentValue;
        } else {
            selector.value = 'all';
        }
    });
}

function showErrorMessage(message) {
    // Create or update error message element
    let errorElement = document.getElementById('error-message');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'error-message';
        errorElement.className = 'error-message';
        errorElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(errorElement);
    }
    
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }, 5000);
}

function showAuthError() {
    showErrorMessage('Authentication expired. Please refresh the page to log in again.');
}

// Update initialization to use optimized loading
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing calendar...');
    
    // Initialize calendar first
    initializeCalendar();
    
    // Start loading data immediately
    loadCalendarData();
    
    // ...existing initialization code...
});

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}