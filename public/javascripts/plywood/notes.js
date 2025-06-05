// Notes panel functionality
import { showLoading, hideLoading } from './ui.js';
import { showModal, hideModal } from './modal.js';

let currentSprintId = null;
let isGlobalNotes = true;  // Default to global notes if no sprint is active
let saveTimeout = null;
const AUTOSAVE_DELAY = 3000; // 3 second delay for auto-save (increased for better UX)
let typingTimeout = null;
const TYPING_DELAY = 500; // Delay before showing save indicator (for debouncing)

/**
 * Initialize notes panel functionality
 */
export function initializeNotesPanel() {
    // Set up panel events
    setupNotesPanel();
    
    // Check active sprint
    checkActiveSprintForNotes();
}

/**
 * Check if there's an active sprint and update the panel context
 */
async function checkActiveSprintForNotes() {
    try {
        // Default to global notes
        isGlobalNotes = true;
        currentSprintId = null;
        
        try {
            const response = await fetch('/sprints/current');
            
            if (response.ok) {
                const sprint = await response.json();
                if (sprint && sprint.id) {
                    currentSprintId = sprint.id;
                    isGlobalNotes = false;
                    console.log(`Active sprint found: ${sprint.name} (${sprint.id})`);
                }
            }
        } catch (error) {
            console.log('No active sprint found, using global notes');
            // Intentionally not re-throwing - we'll use global notes instead
        }
    } catch (error) {
        console.error('Error in checkActiveSprintForNotes:', error);
    }
}

// Removed setNotesContext function as we're using the dropdown selector now

/**
 * Setup the notes panel events
 */
function setupNotesPanel() {
    const panel = document.getElementById('notesSidePanel');
    const closeButton = document.getElementById('closeNotesPanel');
    const notesContent = document.getElementById('notesContent');
    
    // Close panel button
    closeButton.addEventListener('click', () => {
        toggleNotesPanel(false);
    });
    
    // Setup auto-save for textarea with debouncing
    notesContent.addEventListener('input', () => {
        // Clear any existing timeouts
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        // Set typing timeout to show saving indicator after a delay
        typingTimeout = setTimeout(() => {
            showSavingIndicator();
        }, TYPING_DELAY);
        
        // Set save timeout to save after longer delay
        saveTimeout = setTimeout(() => {
            saveNotes(notesContent.value);
        }, AUTOSAVE_DELAY);
    });
    
    // Initialize keyboard shortcut (Ctrl+N or Cmd+N) to toggle notes panel
    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
            event.preventDefault();
            toggleNotesPanel();
        }
    });
}

/**
 * Toggle the visibility of the notes panel
 */
export function toggleNotesPanel(forceState) {
    const panel = document.getElementById('notesSidePanel');
    const body = document.body;
    
    const willOpen = forceState !== undefined ? forceState : !panel.classList.contains('open');
    
    if (willOpen) {
        panel.classList.add('open');
        body.classList.add('notes-panel-open');
        
        // Check for direct open flags from localStorage set by notesList.js
        const notesType = localStorage.getItem('openNotesType');
        
        if (notesType === 'global') {
            // Open global notes directly
            console.log('Opening global notes from local storage flag');
            isGlobalNotes = true;
            currentSprintId = null;
            
            // Clear flags
            localStorage.removeItem('openNotesType');
            localStorage.removeItem('openSprintId');
            
            // Load the notes
            loadNotes();
        } 
        else if (notesType === 'sprint') {
            // Open sprint notes directly
            const sprintId = localStorage.getItem('openSprintId');
            
            if (sprintId) {
                console.log(`Opening sprint ${sprintId} notes from local storage flag`);
                isGlobalNotes = false;
                currentSprintId = sprintId;
                
                // Clear flags
                localStorage.removeItem('openNotesType');
                localStorage.removeItem('openSprintId');
                
                // Load the notes
                loadNotes();
            } else {
                // Fall back to normal behavior if no sprint ID
                checkActiveSprintForNotes().then(() => {
                    loadNotes();
                });
            }
        }
        else {
            // Default behavior - check for active sprint and load notes
            checkActiveSprintForNotes().then(() => {
                loadNotes();
            });
        }
    } else {
        panel.classList.remove('open');
        body.classList.remove('notes-panel-open');
        
        // Save any pending changes when closing
        const notesContent = document.getElementById('notesContent');
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveNotes(notesContent.value);
        }
    }
}

/**
 * Show the saving indicator
 */
function showSavingIndicator() {
    const saveIndicator = document.getElementById('saveIndicator');
    if (!saveIndicator) return;
    
    // Only show if not already visible
    if (saveIndicator.classList.contains('hidden')) {
        saveIndicator.classList.remove('hidden');
        saveIndicator.classList.remove('fade-out');
    }
}

/**
 * Hide the saving indicator with a fade effect
 */
function hideSavingIndicator() {
    const saveIndicator = document.getElementById('saveIndicator');
    if (!saveIndicator) return;
    
    saveIndicator.classList.add('fade-out');
    
    setTimeout(() => {
        saveIndicator.classList.add('hidden');
    }, 1000);
}

/**
 * Load notes from the server
 */
async function loadNotes() {
    const notesLoading = document.getElementById('notesLoading');
    const notesContent = document.getElementById('notesContent');
    const notesPanelContext = document.getElementById('notesPanelContext');
    
    notesLoading.style.display = 'block';
    notesContent.style.display = 'none';
    
    try {
        let url;
        
        // Use current context variables - always use sprint notes if a sprint is active
        if (!isGlobalNotes && currentSprintId) {
            url = `/sprints/${currentSprintId}/notes`;
            if (notesPanelContext) {
                notesPanelContext.textContent = ` (Sprint)`;
            }
        } else {
            url = '/notes/global';
            if (notesPanelContext) {
                notesPanelContext.textContent = ` (Global)`;
            }
        }
        
        // Fetch notes
        try {
            const response = await fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                notesContent.value = data.content || '';
            } else {
                // If the request fails, try global notes as fallback
                if (!isGlobalNotes && currentSprintId) {
                    const globalResponse = await fetch('/notes/global');
                    if (globalResponse.ok) {
                        const globalData = await globalResponse.json();
                        notesContent.value = globalData.content || '';
                        isGlobalNotes = true;
                        currentSprintId = null;
                        if (notesPanelContext) {
                            notesPanelContext.textContent = ` (Global - Fallback)`;
                        }
                    } else {
                        notesContent.value = '';
                    }
                } else {
                    notesContent.value = '';
                }
            }
        } catch (error) {
            console.warn('Error fetching notes, using blank content:', error);
            notesContent.value = '';
        }
        
        notesLoading.style.display = 'none';
        notesContent.style.display = 'block';
    } catch (error) {
        console.error('Critical error in notes loading:', error);
        notesLoading.style.display = 'none';
        notesContent.style.display = 'block';
        notesContent.value = '';
    }
}

/**
 * Save notes to the server
 */
async function saveNotes(content) {
    try {
        let url;
        
        // Use current context variables
        if (!isGlobalNotes && currentSprintId) {
            url = `/sprints/${currentSprintId}/notes`;
        } else {
            url = '/notes/global';
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        
        if (!response.ok) {
            console.warn(`Notes save returned status: ${response.status}`);
            // If saving fails with sprint notes, try global notes as fallback
            if (!isGlobalNotes && currentSprintId) {
                try {
                    await fetch('/notes/global', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ content })
                    });
                    console.log('Saved to global notes as fallback');
                } catch (fallbackError) {
                    console.error('Failed to save to global notes fallback:', fallbackError);
                }
            }
        }
        
        // Hide saving indicator
        hideSavingIndicator();
    } catch (error) {
        console.error('Error saving notes:', error);
        // Don't show alert to user, just log the error
        hideSavingIndicator();
    }
}

/**
 * Open global notes
 */
export function openGlobalNotes() {
    isGlobalNotes = true;
    currentSprintId = null;
    toggleNotesPanel(true);
}

/**
 * Open notes for a specific sprint
 * @param {string} sprintId - The ID of the sprint
 */
export function openSprintNotes(sprintId) {
    if (sprintId) {
        isGlobalNotes = false;
        currentSprintId = sprintId;
        toggleNotesPanel(true);
    }
}

// Clean up by removing old functions we don't need anymore
// Removed: loadAvailableSprints, updateSprintSelector

// Export functions to window
window.toggleNotesPanel = toggleNotesPanel;
window.openGlobalNotes = openGlobalNotes;
window.openSprintNotes = openSprintNotes;
