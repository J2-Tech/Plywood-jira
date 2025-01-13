// main.js

import { initializeUI, initializeDropdown, applyTheme } from './ui.js';
import { initializeCalendar } from './calendar.js';
import { loadConfig } from './config.js';

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
        }

        // Apply theme after everything is initialized
        const savedTheme = localStorage.getItem('themeSelection') || config.themeSelection;
        if (savedTheme) {
            applyTheme(savedTheme);
        }
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}