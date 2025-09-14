// Global notes functions for direct access
// This script is loaded as a regular script (not a module) to ensure global availability

// Functions for opening notes
function globalOpenGlobalNotes() {
    console.log("Global function called: openGlobalNotesDirectly");
    if (window.openGlobalNotesDirectly) {
        window.openGlobalNotesDirectly();
    } else {
        console.error("openGlobalNotesDirectly not available");
        alert("Notes functionality not fully loaded. Please refresh the page and try again.");
    }
}

function globalOpenSprintNotes(sprintId) {
    console.log("Global function called: openSprintNotesDirectly for sprint:", sprintId);
    if (window.openSprintNotesDirectly) {
        window.openSprintNotesDirectly(sprintId);
    } else {
        console.error("openSprintNotesDirectly not available");
        alert("Notes functionality not fully loaded. Please refresh the page and try again.");
    }
}

// Make these functions available globally
window.globalOpenGlobalNotes = globalOpenGlobalNotes;
window.globalOpenSprintNotes = globalOpenSprintNotes;

// Function to get editor content
function getEditorContent() {
    if (window.tiptapNotesManager && window.tiptapNotesManager.getContent) {
        return window.tiptapNotesManager.getContent();
    }
    return '';
}

// Make getEditorContent available globally
window.getEditorContent = getEditorContent;

// Toggle notes panel for side-by-side layout
function toggleNotesPanel() {
    const notesPanel = document.getElementById('notesSidePanel');
    const mainContent = document.querySelector('.main-content') || document.querySelector('.calendar-container');
    
    if (!notesPanel) return;
    
    const isOpen = notesPanel.classList.contains('open');
    
    if (isOpen) {
        // Close panel
        notesPanel.classList.remove('open');
        if (mainContent) {
            mainContent.classList.remove('notes-open');
        }
        
        // Update CSS variable
        document.documentElement.style.removeProperty('--notes-panel-width');
    } else {
        // Open panel
        notesPanel.classList.add('open');
        if (mainContent) {
            mainContent.classList.add('notes-open');
        }
        
        // Set CSS variable for current width
        const currentWidth = notesPanel.style.width || '400px';
        document.documentElement.style.setProperty('--notes-panel-width', currentWidth);
    }
}
