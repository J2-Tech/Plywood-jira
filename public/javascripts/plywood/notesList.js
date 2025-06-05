// Notes list modal functionality
import { showLoading, hideLoading } from './ui.js';
import { showModal, hideModal } from './modal.js';

// Create note functions that will directly communicate with the notes panel
// This avoids circular dependencies and timing issues
function openGlobalNotesDirectly() {
    console.log("Opening global notes directly");
    hideModal('.modal-notes-list');
    
    try {
        // Set local storage flags to guide the notes.js module
        localStorage.setItem('openNotesType', 'global');
        localStorage.removeItem('openSprintId');
        
        // Use a timeout to ensure the modal is closed before opening the panel
        setTimeout(() => {
            // Call the global function to toggle notes panel
            if (window.toggleNotesPanel) {
                console.log("Calling window.toggleNotesPanel for global notes");
                window.toggleNotesPanel(true);
            } else {
                // Direct fallback - use onclick attribute from the button in layout.njk
                console.log("Using fallback method for opening notes panel");
                const notesPanelButton = document.getElementById('toggleNotesButton');
                if (notesPanelButton) {
                    notesPanelButton.click();
                } else {
                    console.error("Could not find notes panel button");
                    alert("Could not open notes panel - please refresh the page and try again");
                }
            }
        }, 100);
    } catch (error) {
        console.error("Error opening global notes:", error);
    }
}

function openSprintNotesDirectly(sprintId) {
    console.log("Opening sprint notes directly for sprint:", sprintId);
    hideModal('.modal-notes-list');
    
    try {
        // Set local storage flags to guide the notes.js module
        localStorage.setItem('openNotesType', 'sprint');
        localStorage.setItem('openSprintId', sprintId);
        
        // Use a timeout to ensure the modal is closed before opening the panel
        setTimeout(() => {
            // Call the global function to toggle notes panel
            if (window.toggleNotesPanel) {
                console.log("Calling window.toggleNotesPanel for sprint notes:", sprintId);
                window.toggleNotesPanel(true);
            } else {
                // Direct fallback - use onclick attribute from the button in layout.njk
                console.log("Using fallback method for opening notes panel");
                const notesPanelButton = document.getElementById('toggleNotesButton');
                if (notesPanelButton) {
                    notesPanelButton.click();
                } else {
                    console.error("Could not find notes panel button");
                    alert("Could not open notes panel - please refresh the page and try again");
                }
            }
        }, 100);
    } catch (error) {
        console.error("Error opening sprint notes:", error);
    }
}

/**
 * Toggle visibility of a notes content section
 * @param {string} contentId - ID of the content to toggle
 */
function toggleNotesContent(contentId) {
    let container;
    let icon;
    
    // Determine which container and toggle icon to use
    if (contentId === 'globalNotesContent') {
        container = document.getElementById('globalNotesContentContainer');
        icon = container.previousElementSibling.querySelector('.toggle-icon');
    } else if (contentId === 'sprintNotesList') {
        container = document.getElementById('sprintNotesContainer');
        icon = container.previousElementSibling.querySelector('.toggle-icon');
    } else {
        return;
    }
    
    // Toggle the collapsed class
    if (container.classList.contains('collapsed')) {
        container.classList.remove('collapsed');
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        container.classList.add('collapsed');
        if (icon) icon.style.transform = 'rotate(-90deg)';
    }
}

/**
 * Show the notes list modal
 */
export function showNotesListModal() {
    // Show the modal
    showModal('.modal-notes-list');
    
    // Set up the toggle function
    window.toggleNotesContent = toggleNotesContent;
    
    // Rotate all toggle icons to indicate collapsed state
    const toggleIcons = document.querySelectorAll('.toggle-icon');
    toggleIcons.forEach(icon => {
        icon.style.transform = 'rotate(-90deg)';
    });
    
    // Load all notes
    loadAllNotes();
}

/**
 * Load all notes (global and sprint)
 */
async function loadAllNotes() {
    const notesListLoading = document.getElementById('notesListLoading');
    const notesListContent = document.getElementById('notesListContent');
    
    // Show loading
    if (notesListLoading) {
        notesListLoading.style.display = 'block';
    }
    if (notesListContent) {
        notesListContent.style.opacity = '0.5';
    }
    
    try {
        // Load global notes
        await loadGlobalNotes();
        
        // Load sprint notes
        await loadSprintNotes();
    } catch (error) {
        console.error('Error loading notes:', error);
    } finally {
        // Hide loading
        if (notesListLoading) {
            notesListLoading.style.display = 'none';
        }
        if (notesListContent) {
            notesListContent.style.opacity = '1';
        }
    }
}

/**
 * Load global notes
 */
async function loadGlobalNotes() {
    const globalNotesContent = document.getElementById('globalNotesContent');
    
    try {
        const response = await fetch('/notes/global');
        
        if (response.ok) {
            const data = await response.json();
              if (globalNotesContent) {
                if (data && data.content) {
                    // Show full content
                    globalNotesContent.textContent = data.content || 'No content';
                } else {
                    globalNotesContent.textContent = 'No content';
                }
            }
        } else {
            if (globalNotesContent) {
                globalNotesContent.textContent = 'Could not load global notes';
            }
        }
    } catch (error) {
        console.error('Error loading global notes:', error);
        if (globalNotesContent) {
            globalNotesContent.textContent = 'Error loading notes';
        }
    }
}

/**
 * Load all sprint notes
 */
async function loadSprintNotes() {
    const sprintNotesList = document.getElementById('sprintNotesList');
    
    if (!sprintNotesList) return;
    
    try {
        // Get all sprints
        const sprintsResponse = await fetch('/sprints');
        
        if (!sprintsResponse.ok) {
            sprintNotesList.innerHTML = '<p>Could not load sprints</p>';
            return;
        }
        
        const sprints = await sprintsResponse.json();
        
        if (!sprints || !Array.isArray(sprints) || sprints.length === 0) {
            sprintNotesList.innerHTML = '<p>No sprints available</p>';
            return;
        }
        
        // Get all sprint notes
        const notesResponse = await fetch('/sprints/notes/all');
        
        if (!notesResponse.ok) {
            sprintNotesList.innerHTML = '<p>Could not load sprint notes</p>';
            return;
        }
        
        const allNotes = await notesResponse.json();
        
        // Clear previous content
        sprintNotesList.innerHTML = '';
        
        // Get the current sprint if available
        let currentSprint = null;
        try {
            const currentSprintResponse = await fetch('/sprints/current');
            if (currentSprintResponse.ok) {
                currentSprint = await currentSprintResponse.json();
            }
        } catch (error) {
            console.log('No current sprint found');
        }
        
        // Add each sprint with notes
        sprints.forEach(sprint => {
            const sprintNotes = allNotes && allNotes.sprints && allNotes.sprints[sprint.id];
            const isCurrent = currentSprint && currentSprint.id === sprint.id;
            
            // Create sprint item element
            const sprintItem = document.createElement('div');
            sprintItem.className = 'sprint-notes-item';
            if (isCurrent) {
                sprintItem.classList.add('current-sprint');
            }
            
            // Determine color based on state
            let borderColor = '#888';
            if (sprint.state === 'active') {
                borderColor = '#28a745';
            } else if (sprint.state === 'closed') {
                borderColor = '#dc3545';
            } else if (sprint.state === 'future') {
                borderColor = '#17a2b8';
            }
            sprintItem.style.borderLeftColor = borderColor;            // Add content
            let notesContent = 'No notes for this sprint';
            if (sprintNotes && sprintNotes.content) {
                // Show full content in modal
                notesContent = sprintNotes.content;
            }
            
            const lastUpdated = sprintNotes && sprintNotes.updated
                ? new Date(sprintNotes.updated).toLocaleString()
                : 'Never';
            
            // For showing collapsed preview or hint
            const previewText = notesContent.length > 50 ? 
                notesContent.substring(0, 50) + '...' : 
                notesContent;
              sprintItem.innerHTML = `
                <div class="sprint-item-header collapsible" onclick="toggleSprintItem(${sprint.id})">
                    <div class="sprint-name">${sprint.name} ${isCurrent ? '(Current)' : ''}</div>
                    <div class="sprint-preview-text">${previewText}</div>
                    <span class="toggle-icon" id="sprintToggle${sprint.id}">▼</span>
                </div>
                <div class="sprint-item-content collapsed" id="sprintContent${sprint.id}">
                    <div class="sprint-notes-preview">${notesContent}</div>
                    <div class="sprint-notes-footer">
                        <span>State: ${sprint.state}</span>
                        <span>Last updated: ${lastUpdated}</span>
                    </div>
                    <button class="view-notes-btn" data-sprint-id="${sprint.id}" onclick="globalOpenSprintNotes('${sprint.id}'); return false;">📝 View Note</button>
                </div>
            `;
            
            sprintNotesList.appendChild(sprintItem);
        });
        
        // Add click event listeners for view/edit buttons
        setupViewNoteButtons();
    } catch (error) {
        console.error('Error loading sprint notes:', error);
        sprintNotesList.innerHTML = '<p>Error loading sprint notes</p>';
    }
}

/**
 * Set up click handlers for all view note buttons
 */
function setupViewNoteButtons() {
    console.log("Setting up View Note buttons");
    
    // Setup global notes button using inline onclick
    const globalNotesBtn = document.querySelector('.view-notes-btn[data-type="global"]');
    if (globalNotesBtn) {
        console.log("Found global notes button");
        // Remove any existing click handlers to avoid duplicates
        globalNotesBtn.removeEventListener('click', globalNoteClickHandler);
        // Add new click handler
        globalNotesBtn.addEventListener('click', globalNoteClickHandler);
        // Also add inline onclick as a backup method
        globalNotesBtn.setAttribute('onclick', 'window.openGlobalNotesDirectly(); return false;');
    } else {
        console.warn("Could not find global notes button");
    }
    
    // Setup sprint notes buttons
    const sprintNotesBtns = document.querySelectorAll('.view-notes-btn[data-sprint-id]');
    console.log(`Found ${sprintNotesBtns.length} sprint note buttons`);
    
    sprintNotesBtns.forEach(btn => {
        const sprintId = btn.getAttribute('data-sprint-id');
        // Remove any existing click handlers to avoid duplicates
        btn.removeEventListener('click', sprintNoteClickHandler);
        // Add new click handler
        btn.addEventListener('click', sprintNoteClickHandler);
        // Also add inline onclick as a backup method
        btn.setAttribute('onclick', `window.openSprintNotesDirectly('${sprintId}'); return false;`);
    });
}

// Separate handlers to avoid memory leaks from closures
function globalNoteClickHandler(e) {
    e.stopPropagation(); // Prevent event bubbling
    e.preventDefault(); // Prevent default action
    console.log('Global notes button clicked');
    openGlobalNotesDirectly();
}

function sprintNoteClickHandler(e) {
    e.stopPropagation(); // Prevent event bubbling
    e.preventDefault(); // Prevent default action
    const sprintId = this.getAttribute('data-sprint-id');
    console.log('Sprint notes button clicked for sprint:', sprintId);
    openSprintNotesDirectly(sprintId);
}

/**
 * Toggle a sprint item's expanded/collapsed state
 * @param {number} sprintId - The ID of the sprint to toggle
 */
function toggleSprintItem(sprintId) {
    const content = document.getElementById(`sprintContent${sprintId}`);
    const toggle = document.getElementById(`sprintToggle${sprintId}`);
    
    if (content) {
        if (content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            if (toggle) toggle.style.transform = 'rotate(0deg)';
        } else {
            content.classList.add('collapsed');
            if (toggle) toggle.style.transform = 'rotate(-90deg)';
        }
    }
}

// Make function available globally
window.toggleSprintItem = toggleSprintItem;

// Export functions to window
window.showNotesListModal = showNotesListModal;
window.openGlobalNotesDirectly = openGlobalNotesDirectly;
window.openSprintNotesDirectly = openSprintNotesDirectly;
window.setupViewNoteButtons = setupViewNoteButtons; 
window.globalNoteClickHandler = globalNoteClickHandler;
window.sprintNoteClickHandler = sprintNoteClickHandler;

// Add these functions to the document for direct access from HTML
document.openGlobalNotesDirectly = openGlobalNotesDirectly;
document.openSprintNotesDirectly = openSprintNotesDirectly;
