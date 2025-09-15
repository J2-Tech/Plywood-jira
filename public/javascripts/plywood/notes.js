// Notes panel functionality
import { showLoading, hideLoading } from './ui.js';
import { showModal, hideModal } from './modal.js';
import { objectivesManager } from './objectives.js';

let currentSprintId = null;
let isGlobalNotes = true;  // Default to global notes if no sprint is active

/**
 * Initialize notes panel functionality
 */
export function initializeNotesPanel() {
    // Set up panel events
    setupNotesPanel();
    
    // Check active sprint
    checkActiveSprintForNotes();
    
    // Initialize objectives manager
    objectivesManager.init();
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
                }
            }
        } catch (error) {
            // Intentionally not re-throwing - we'll use global notes instead
        }
    } catch (error) {
    }
}

/**
 * Setup the notes panel events
 */
function setupNotesPanel() {
    const panel = document.getElementById('notesSidePanel');
    const closeButton = document.getElementById('closeNotesPanel');
    
    // Close panel button
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            toggleNotesPanel(false);
        });
    }
    
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
        
        // Initialize Tiptap editor if not already done
        if (!window.tiptapEditor) {
            // Wait for Tiptap to initialize
            setTimeout(() => {
                if (window.initializeTiptapEditor) {
                    window.initializeTiptapEditor();
                }
                // Small delay to ensure editor is ready before loading content
                setTimeout(() => {
                    handleNotesOpening();
                }, 200);
            }, 100);
        } else {
            handleNotesOpening();
        }
    } else {
        panel.classList.remove('open');
        body.classList.remove('notes-panel-open');
        
        // Save any pending changes when closing
        if (window.tiptapEditor) {
            const content = window.getEditorContent();
            if (content && content !== '<p></p>') {
                saveNotes(content);
            }
        }
    }
}

/**
 * Handle opening notes (check for flags and load appropriate content)
 */
function handleNotesOpening() {
    // Check for direct open flags from localStorage set by notesList.js
    const notesType = localStorage.getItem('openNotesType');
    
    if (notesType === 'global') {
        // Open global notes directly
        isGlobalNotes = true;
        currentSprintId = null;
        
        // Clear flags
        localStorage.removeItem('openNotesType');
        localStorage.removeItem('openSprintId');
        
        // Load the notes
        loadNotes();
        
        // Update objectives context
        objectivesManager.updateContext(isGlobalNotes, currentSprintId);
    } 
    else if (notesType === 'sprint') {
        // Open sprint notes directly
        const sprintId = localStorage.getItem('openSprintId');
        
        if (sprintId) {
            isGlobalNotes = false;
            currentSprintId = sprintId;
            
            // Clear flags
            localStorage.removeItem('openNotesType');
            localStorage.removeItem('openSprintId');
            
            // Load the notes
            loadNotes();
            
            // Update objectives context
            objectivesManager.updateContext(isGlobalNotes, currentSprintId);
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
            // Update objectives context
            objectivesManager.updateContext(isGlobalNotes, currentSprintId);
        });
    }
}

/**
 * Load notes from the server
 */
async function loadNotes() {
    const notesLoading = document.getElementById('notesLoading');
    const notesPanelContext = document.getElementById('notesPanelContext');
    
    if (notesLoading) {
        notesLoading.style.display = 'block';
    }
    
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
                const content = data.content || '';
                
                // Load content into Tiptap editor
                if (window.loadNotesIntoEditor) {
                    window.loadNotesIntoEditor(content);
                }
            } else {
                // If the request fails, try global notes as fallback
                if (!isGlobalNotes && currentSprintId) {
                    const globalResponse = await fetch('/notes/global');
                    if (globalResponse.ok) {
                        const globalData = await globalResponse.json();
                        const content = globalData.content || '';
                        
                        if (window.loadNotesIntoEditor) {
                            window.loadNotesIntoEditor(content);
                        }
                        
                        isGlobalNotes = true;
                        currentSprintId = null;
                        if (notesPanelContext) {
                            notesPanelContext.textContent = ` (Global - Fallback)`;
                        }
                    } else {
                        if (window.loadNotesIntoEditor) {
                            window.loadNotesIntoEditor('');
                        }
                    }
                } else {
                    if (window.loadNotesIntoEditor) {
                        window.loadNotesIntoEditor('');
                    }
                }
            }
        } catch (error) {
            if (window.loadNotesIntoEditor) {
                window.loadNotesIntoEditor('');
            }
        }
        
        if (notesLoading) {
            notesLoading.style.display = 'none';
        }
    } catch (error) {
        if (notesLoading) {
            notesLoading.style.display = 'none';
        }
        if (window.loadNotesIntoEditor) {
            window.loadNotesIntoEditor('');
        }
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
                } catch (fallbackError) {
                }
            }
        }
    } catch (error) {
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

// Export functions to window
window.toggleNotesPanel = toggleNotesPanel;
window.openGlobalNotes = openGlobalNotes;
window.openSprintNotes = openSprintNotes;
window.saveNotes = saveNotes;
