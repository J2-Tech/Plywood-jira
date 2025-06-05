// Sprint management and notes functionality
import { showLoading, hideLoading, getCurrentProject } from './ui.js';

let currentSprintId = null;
let currentSprint = null;
let sprintNotes = {};

/**
 * Initialize sprint functionality
 */
export function initializeSprint() {
    // Set up modal events
    setupSprintModal();
    
    // Load current sprint data for display in the header
    loadCurrentSprint().then(displayCurrentSprintIndicator);
    
    // Add sprint badge to project selector if needed
}

/**
 * Setup the sprint modal event handlers
 */
function setupSprintModal() {
    // Get DOM elements
    const modal = document.getElementById('sprintModal');
    const closeButtons = document.querySelectorAll('.sprint-modal-close');
    const addNoteButton = document.getElementById('addNoteButton');
    
    // Close modal on X or close button click
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    });
    
    // Close modal when clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Add note button click handler
    addNoteButton.addEventListener('click', addNewSprintNote);
    
    // Handle edit and delete note actions through event delegation
    const notesList = document.getElementById('sprintNotesList');
    notesList.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('note-edit-btn')) {
            editSprintNote(target.dataset.noteId);
        } else if (target.classList.contains('note-delete-btn')) {
            deleteSprintNote(target.dataset.noteId);
        }
    });
}

/**
 * Toggle the visibility of the sprint modal
 */
export function toggleSprintModal() {
    const modal = document.getElementById('sprintModal');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'block';
        loadSprintInfo();
    }
}

/**
 * Load current sprint information
 */
async function loadCurrentSprint() {
    try {
        showLoading();
        const response = await fetch('/sprints/current');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const sprint = await response.json();
        currentSprint = sprint;
        
        if (sprint && sprint.id) {
            currentSprintId = sprint.id;
        }
        
        hideLoading();
        return sprint;
    } catch (error) {
        console.error('Error loading current sprint:', error);
        hideLoading();
        return null;
    }
}

/**
 * Load sprint details and notes for the modal
 */
async function loadSprintInfo() {
    // Show loading indicators
    document.getElementById('currentSprintLoading').style.display = 'block';
    document.getElementById('sprintNotesLoading').style.display = 'block';
    document.getElementById('sprintDetails').style.display = 'none';
    document.getElementById('noActiveSprint').style.display = 'none';
    document.getElementById('sprintNotesList').style.display = 'none';
    document.getElementById('noSprintNotes').style.display = 'none';
    
    // First, make sure we have the current sprint
    if (!currentSprint) {
        await loadCurrentSprint();
    }
    
    // Display sprint information
    if (currentSprint && currentSprint.id) {
        // Update sprint details in the modal
        document.getElementById('sprintName').textContent = currentSprint.name;
        document.getElementById('sprintState').textContent = currentSprint.state;
        document.getElementById('sprintState').className = `sprint-badge ${currentSprint.state}`;
        
        // Format dates nicely
        const startDate = currentSprint.startDate ? new Date(currentSprint.startDate).toLocaleDateString() : 'Not started';
        const endDate = currentSprint.endDate ? new Date(currentSprint.endDate).toLocaleDateString() : 'Not scheduled';
        
        document.getElementById('sprintStartDate').textContent = startDate;
        document.getElementById('sprintEndDate').textContent = endDate;
        
        // Set goal if available
        if (currentSprint.goal) {
            document.getElementById('sprintGoal').textContent = currentSprint.goal;
        } else {
            document.getElementById('sprintGoal').textContent = 'No goal specified';
        }
        
        // Show the sprint details section
        document.getElementById('currentSprintLoading').style.display = 'none';
        document.getElementById('sprintDetails').style.display = 'block';
        
        // Load and display sprint notes
        await loadSprintNotes();
    } else {
        // No active sprint found
        document.getElementById('currentSprintLoading').style.display = 'none';
        document.getElementById('noActiveSprint').style.display = 'block';
        document.getElementById('sprintNotesLoading').style.display = 'none';
        document.getElementById('noSprintNotes').style.display = 'block';
    }
}

/**
 * Load notes for the current sprint
 */
async function loadSprintNotes() {
    if (!currentSprintId) {
        document.getElementById('sprintNotesLoading').style.display = 'none';
        document.getElementById('noSprintNotes').style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch(`/sprints/${currentSprintId}/notes`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const notesData = await response.json();
        sprintNotes = notesData;
        
        // Display notes
        renderSprintNotes();
        
        document.getElementById('sprintNotesLoading').style.display = 'none';
        if (notesData.notes && notesData.notes.length > 0) {
            document.getElementById('sprintNotesList').style.display = 'block';
        } else {
            document.getElementById('noSprintNotes').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading sprint notes:', error);
        document.getElementById('sprintNotesLoading').style.display = 'none';
        document.getElementById('noSprintNotes').style.display = 'block';
    }
}

/**
 * Add a new sprint note
 */
async function addNewSprintNote() {
    if (!currentSprintId) return;
    
    const noteTextarea = document.getElementById('newNoteText');
    const noteText = noteTextarea.value.trim();
    
    if (!noteText) return;
    
    try {
        showLoading();
        
        const response = await fetch(`/sprints/${currentSprintId}/notes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: noteText })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const newNote = await response.json();
        
        // Add the new note to our local data
        if (!sprintNotes.notes) {
            sprintNotes.notes = [];
        }
        sprintNotes.notes.push(newNote);
        
        // Clear the textarea
        noteTextarea.value = '';
        
        // Re-render notes
        renderSprintNotes();
        
        // Make sure note list is visible and "no notes" message is hidden
        document.getElementById('noSprintNotes').style.display = 'none';
        document.getElementById('sprintNotesList').style.display = 'block';
        
        hideLoading();
    } catch (error) {
        console.error('Error adding sprint note:', error);
        hideLoading();
        alert('Failed to add note. Please try again.');
    }
}

/**
 * Edit a sprint note
 */
async function editSprintNote(noteId) {
    if (!currentSprintId) return;
    
    const noteToEdit = sprintNotes.notes.find(note => note.id === noteId);
    if (!noteToEdit) return;
    
    // Prompt for the updated text
    const updatedText = prompt('Edit note:', noteToEdit.text);
    if (updatedText === null || updatedText.trim() === '') return;
    
    try {
        showLoading();
        
        const response = await fetch(`/sprints/${currentSprintId}/notes/${noteId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: updatedText })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const updatedNote = await response.json();
        
        // Update the note in our local data
        const noteIndex = sprintNotes.notes.findIndex(note => note.id === noteId);
        if (noteIndex !== -1) {
            sprintNotes.notes[noteIndex] = updatedNote;
        }
        
        // Re-render notes
        renderSprintNotes();
        
        hideLoading();
    } catch (error) {
        console.error('Error updating sprint note:', error);
        hideLoading();
        alert('Failed to update note. Please try again.');
    }
}

/**
 * Delete a sprint note
 */
async function deleteSprintNote(noteId) {
    if (!currentSprintId) return;
    
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this note?')) return;
    
    try {
        showLoading();
        
        const response = await fetch(`/sprints/${currentSprintId}/notes/${noteId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        // Remove the note from our local data
        sprintNotes.notes = sprintNotes.notes.filter(note => note.id !== noteId);
        
        // Re-render notes
        renderSprintNotes();
        
        // Show "no notes" message if needed
        if (sprintNotes.notes.length === 0) {
            document.getElementById('sprintNotesList').style.display = 'none';
            document.getElementById('noSprintNotes').style.display = 'block';
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error deleting sprint note:', error);
        hideLoading();
        alert('Failed to delete note. Please try again.');
    }
}

/**
 * Render the sprint notes list
 */
function renderSprintNotes() {
    const notesList = document.getElementById('sprintNotesList');
    notesList.innerHTML = '';
    
    if (!sprintNotes.notes || sprintNotes.notes.length === 0) return;
    
    // Sort notes by creation date (newest first)
    const sortedNotes = [...sprintNotes.notes].sort((a, b) => {
        return new Date(b.created) - new Date(a.created);
    });
    
    sortedNotes.forEach(note => {
        const noteElement = document.createElement('li');
        noteElement.className = 'note-item';
        noteElement.dataset.noteId = note.id;
        
        const createdDate = new Date(note.created).toLocaleString();
        
        noteElement.innerHTML = `
            <div class="note-text">${formatNoteText(note.text)}</div>
            <div class="note-metadata">
                <span class="note-author">${note.author || 'Anonymous'}</span>
                <span class="note-date">${createdDate}</span>
            </div>
            <div class="note-actions">
                <button class="note-action-btn note-edit-btn" data-note-id="${note.id}">Edit</button>
                <button class="note-action-btn note-delete-btn" data-note-id="${note.id}">Delete</button>
            </div>
        `;
        
        notesList.appendChild(noteElement);
    });
}

/**
 * Format note text for display (handle line breaks, URLs, etc.)
 */
function formatNoteText(text) {
    if (!text) return '';
    
    // Convert URLs to links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    text = text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    
    // Convert line breaks to <br>
    return text.replace(/\n/g, '<br>');
}

/**
 * Display the current sprint indicator in the UI header
 */
function displayCurrentSprintIndicator(sprint) {
    if (!sprint || !sprint.id) return;
    
    // Create or update sprint info in header
    const footerLeft = document.querySelector('.footer-left');
    let sprintIndicator = document.querySelector('.current-sprint-indicator');
    
    if (!sprintIndicator) {
        sprintIndicator = document.createElement('div');
        sprintIndicator.className = 'current-sprint-indicator';
        sprintIndicator.onclick = toggleSprintModal;
        footerLeft.appendChild(sprintIndicator);
    }
    
    // Calculate days remaining
    let daysText = '';
    if (sprint.endDate) {
        const endDate = new Date(sprint.endDate);
        const today = new Date();
        const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
        daysText = daysRemaining > 0 ? `${daysRemaining} days left` : 'Ended';
    }
    
    // Update content
    sprintIndicator.innerHTML = `
        <div class="sprint-name">${sprint.name}</div>
        <div class="days-remaining">${daysText}</div>
    `;
}

// Export the toggle function for global access
window.toggleSprintModal = toggleSprintModal;
