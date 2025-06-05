// Notes panel resizing functionality
let isNotesResizing = false;
let notesStartX = 0;
let notesStartWidth = 0;
let notesResizeLine = null;

function initializeNotesResizing() {
    const notesPanel = document.getElementById('notesSidePanel');
    
    if (!notesPanel) return;
    
    // Load saved width from localStorage
    const savedWidth = localStorage.getItem('notes-panel-width');
    if (savedWidth && savedWidth !== 'null') {
        const width = parseInt(savedWidth, 10);
        if (width >= 250 && width <= 1200) { // Increased max width
            notesPanel.style.width = width + 'px';
        }
    }
    
    // Mouse down on the left edge (resize handle)
    notesPanel.addEventListener('mousedown', (e) => {
        const rect = notesPanel.getBoundingClientRect();
        const isOnLeftEdge = e.clientX <= rect.left + 6; // 6px from left edge
        
        if (!isOnLeftEdge || !notesPanel.classList.contains('open')) return;
        
        e.preventDefault();
        isNotesResizing = true;
        notesStartX = e.clientX;
        notesStartWidth = parseInt(window.getComputedStyle(notesPanel).width, 10);
        
        // Add visual feedback
        document.body.classList.add('notes-resizing');
        notesPanel.classList.add('resizing');
        
        // Create resize line
        notesResizeLine = document.createElement('div');
        notesResizeLine.className = 'notes-resize-line';
        notesResizeLine.style.left = e.clientX + 'px';
        document.body.appendChild(notesResizeLine);
    });
    
    // Mouse move for resizing
    document.addEventListener('mousemove', (e) => {
        const notesPanel = document.getElementById('notesSidePanel');
        
        if (!isNotesResizing) {
            // Change cursor when hovering over resize area
            if (notesPanel && notesPanel.classList.contains('open')) {
                const rect = notesPanel.getBoundingClientRect();
                const isOnLeftEdge = e.clientX <= rect.left + 6 && e.clientX >= rect.left - 3;
                document.body.style.cursor = isOnLeftEdge ? 'col-resize' : '';
            }
            return;
        }
        
        const deltaX = notesStartX - e.clientX;
        const newWidth = notesStartWidth + deltaX;
        const minWidth = 250;
        const maxWidth = 1200; // Increased max width to at least twice the original
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        
        // Update resize line position
        if (notesResizeLine) {
            notesResizeLine.style.left = (notesStartX - deltaX) + 'px';
        }
        
        // Update panel width
        notesPanel.style.width = constrainedWidth + 'px';
        
        e.preventDefault();
    });
    
    // Mouse up to end resizing
    document.addEventListener('mouseup', (e) => {
        if (!isNotesResizing) return;
        
        isNotesResizing = false;
        document.body.classList.remove('notes-resizing');
        document.body.style.cursor = '';
        
        const notesPanel = document.getElementById('notesSidePanel');
        if (notesPanel) {
            notesPanel.classList.remove('resizing');
            
            // Save width to localStorage
            const currentWidth = parseInt(window.getComputedStyle(notesPanel).width, 10);
            localStorage.setItem('notes-panel-width', currentWidth);
        }
        
        // Remove resize line
        if (notesResizeLine) {
            document.body.removeChild(notesResizeLine);
            notesResizeLine = null;
        }
    });
    
    // Handle escape key to cancel resize
    document.addEventListener('keydown', (e) => {
        if (isNotesResizing && e.key === 'Escape') {
            const notesPanel = document.getElementById('notesSidePanel');
            if (notesPanel) {
                notesPanel.style.width = notesStartWidth + 'px';
            }
            
            // End resize mode
            isNotesResizing = false;
            document.body.classList.remove('notes-resizing');
            document.body.style.cursor = '';
            
            if (notesPanel) {
                notesPanel.classList.remove('resizing');
            }
            
            if (notesResizeLine) {
                document.body.removeChild(notesResizeLine);
                notesResizeLine = null;
            }
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeNotesResizing();
});

// Make function available globally if needed
window.initializeNotesResizing = initializeNotesResizing;
