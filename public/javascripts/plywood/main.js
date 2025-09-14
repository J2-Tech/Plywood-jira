// main.js

import { showLoading, hideLoading, initializeUI, initializeDropdown, applyTheme } from './ui.js';
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

// Date formatting utility function
function formatDateForAPI(date) {
    if (!date) return null;
    
    // Ensure we have a Date object
    var dateObj = date instanceof Date ? date : new Date(date);
    
    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
        console.error('Invalid date provided to formatDateForAPI:', date);
        return null;
    }
    
    // Format as YYYY-MM-DD
    var year = dateObj.getFullYear();
    var month = String(dateObj.getMonth() + 1).padStart(2, '0');
    var day = String(dateObj.getDate()).padStart(2, '0');
    
    return year + '-' + month + '-' + day;
}

// Helper function to get selected project
function getSelectedProject() {
    var projectSelector = document.getElementById('headerProjectSelection') || 
                         document.getElementById('projectSelection');
    return projectSelector ? projectSelector.value : 'all';
}

// Helper function to update total time display
function updateTotalTime(worklogsData) {
    // Calculate total time from worklogs
    var totalSeconds = 0;
    if (worklogsData && worklogsData.length > 0) {
        totalSeconds = worklogsData.reduce(function(total, worklog) {
            return total + (worklog.timeSpentSeconds || 0);
        }, 0);
    }
    
    // Convert to hours and minutes
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    
    // Update display elements
    var totalTimeElements = document.querySelectorAll('.total-time, #totalTime');
    totalTimeElements.forEach(function(element) {
        if (element) {
            element.textContent = hours + 'h ' + minutes + 'm';
        }
    });
}

// Initialize app when DOM is ready
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
        var view = calendar.view;
        var start = formatDateForAPI(view.activeStart);
        var end = formatDateForAPI(view.activeEnd);
        
        console.log('Loading calendar data for ' + start + ' to ' + end);
        
        // Only fetch worklogs - projects are handled by initializeUI
        var worklogsData = await fetchWorklogs(start, end);
        
        // Process the worklog results
        if (worklogsData && worklogsData.length > 0) {
            calendar.removeAllEvents();
            calendar.addEventSource(worklogsData);
            updateTotalTime(worklogsData);
            console.log('Loaded ' + worklogsData.length + ' worklog events');
        } else {
            calendar.removeAllEvents();
            updateTotalTime([]);
            console.log('No worklog events found for the current period');
        }
        
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
    var projectParam = getSelectedProject();
    var url = '/events?start=' + start + '&end=' + end + '&project=' + projectParam;
    
    console.log('Fetching worklogs from: ' + url);
    
    var response = await fetch(url);
    
    if (!response.ok) {
        if (response.status == 401) {
            throw new Error('Authentication required');
        }
        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    }
    
    var data = await response.json();
    
    // Ensure events have proper color properties
    if (data && Array.isArray(data)) {
        data.forEach(function(event) {
            // Ensure each event has proper color properties
            if (!event.backgroundColor || event.backgroundColor == 'transparent') {
                event.backgroundColor = event.issueKeyColor || '#2a75fe';
            }
            
            if (!event.borderColor) {
                event.borderColor = event.backgroundColor;
            }
            
            // Calculate contrasting text color if not provided
            if (!event.textColor) {
                event.textColor = calculateTextColor(event.backgroundColor);
            }
            
            // Ensure extendedProps exists for additional styling
            if (!event.extendedProps) {
                event.extendedProps = {};
            }
            
            // Store calculated colors in extendedProps for CSS access
            event.extendedProps.backgroundColor = event.backgroundColor;
            event.extendedProps.textColor = event.textColor;
            event.extendedProps.borderColor = event.borderColor;
        });
    }
    
    return data;
}

// Helper function to calculate contrasting text color
function calculateTextColor(backgroundColor) {
    if (!backgroundColor) return '#000000';
    
    // Remove hash if present
    var hex = backgroundColor.replace('#', '');
    
    // Handle 3-character hex codes
    if (hex.length == 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    
    // Parse RGB values
    var r = parseInt(hex.substr(0, 2), 16);
    var g = parseInt(hex.substr(2, 2), 16);
    var b = parseInt(hex.substr(4, 2), 16);
    
    // Calculate luminance
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return white text for dark backgrounds, black text for light backgrounds
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}