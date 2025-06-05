// Notes panel resizing functionality
let isResizing = false;
let startX = 0;
let startWidth = 0;
let resizeLine = null;

function initializeNotesResizing() {
    const notesPanel = document.getElementById('notesPanel');
    const resizeHandle = document.getElementById('notesResizeHandle');
    
    if (!notesPanel || !resizeHandle) {
        console.log('Notes panel or resize handle not found');
        return;
    }
    
    console.log('Initializing notes panel resizing');
    
    // Load saved width from localStorage
    const savedWidth = localStorage.getItem('notes-panel-width');
    if (savedWidth && savedWidth !== 'null') {
        const width = parseInt(savedWidth, 10);
        if (width >= 250 && width <= 600) {
            notesPanel.style.width = width + 'px';
        }
    }
    
    // Mouse down on resize handle
    resizeHandle.addEventListener('mousedown', (e) => {
        console.log('Resize handle mousedown');
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(window.getComputedStyle(notesPanel).width, 10);
        
        // Add visual feedback
        document.body.classList.add('resizing');
        resizeHandle.classList.add('dragging');
        
        // Create resize line for visual feedback
        resizeLine = document.createElement('div');
        resizeLine.className = 'resize-line';
        resizeLine.style.left = e.clientX + 'px';
        document.body.appendChild(resizeLine);
        
        e.preventDefault();
        e.stopPropagation();
    });
    
    // Mouse move for resizing
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const deltaX = startX - e.clientX; // Negative when moving right
        const newWidth = startWidth + deltaX;
        const minWidth = 250;
        const maxWidth = 600;
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        
        // Update resize line position
        if (resizeLine) {
            resizeLine.style.left = (startX - deltaX) + 'px';
        }
        
        // Update panel width in real-time
        notesPanel.style.width = constrainedWidth + 'px';
        
        e.preventDefault();
    });
    
    // Mouse up to end resizing
    document.addEventListener('mouseup', (e) => {
        if (!isResizing) return;
        
        console.log('Resize ended');
        isResizing = false;
        
        // Remove visual feedback
        document.body.classList.remove('resizing');
        resizeHandle.classList.remove('dragging');
        
        // Remove resize line
        if (resizeLine) {
            document.body.removeChild(resizeLine);
            resizeLine = null;
        }
        
        // Save width to localStorage
        const currentWidth = parseInt(window.getComputedStyle(notesPanel).width, 10);
        localStorage.setItem('notes-panel-width', currentWidth);
        console.log('Saved width:', currentWidth);
        
        e.preventDefault();
    });
    
    // Handle escape key to cancel resize
    document.addEventListener('keydown', (e) => {
        if (isResizing && e.key === 'Escape') {
            // Reset to original width
            notesPanel.style.width = startWidth + 'px';
            
            // End resize mode
            isResizing = false;
            document.body.classList.remove('resizing');
            resizeHandle.classList.remove('dragging');
            
            if (resizeLine) {
                document.body.removeChild(resizeLine);
                resizeLine = null;
            }
        }
    });
}

// Enhanced API error handling
async function makeAPICall(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (response.status === 401) {
            // Handle authentication error
            handleAuthError();
            throw new Error('Authentication required');
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API call failed: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`API call failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Check for auth errors in response data
        if (data.authFailure || data.status === 401) {
            handleAuthError();
            throw new Error('Authentication required');
        }
        
        return data;
    } catch (error) {
        console.error('API call error:', error);
        
        if (error.message.includes('Authentication') || error.message.includes('401')) {
            handleAuthError();
        }
        
        throw error;
    }
}

function handleAuthError() {
    console.log('Authentication error detected, redirecting to login...');
    
    // Show user-friendly message
    showNotification('Session expired. Please log in again.', 'warning');
    
    // Redirect to login after a short delay
    setTimeout(() => {
        window.location.href = '/auth/login';
    }, 2000);
}

function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(notification);
    }
    
    // Set colors based on type
    const colors = {
        info: '#2196F3',
        success: '#4CAF50',
        warning: '#FF9800',
        error: '#F44336'
    };
    
    notification.textContent = message;
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

// Replace all existing fetch calls with makeAPICall

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    initializeNotesResizing();
    
    // Add global error handler
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        
        if (event.reason && (
            event.reason.message.includes('Authentication') ||
            event.reason.message.includes('401') ||
            event.reason.message.includes('token')
        )) {
            handleAuthError();
        } else {
            showNotification('An error occurred. Please try again.', 'error');
        }
        
        event.preventDefault(); // Prevent the error from crashing the app
    });
    
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        showNotification('An unexpected error occurred.', 'error');
    });
});