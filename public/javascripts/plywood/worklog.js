import { hideModal } from './modal.js';
import { refreshWorklog } from './calendar.js';
import { showLoading, hideLoading } from './ui.js';

/**
 * Clean worklog comment by removing any color information
 * @param {string} comment - The original comment
 * @returns {string} - Comment with color information removed
 */
function cleanWorklogComment(comment) {
    if (!comment) return '';
    
    // Remove color hex codes (e.g., #FF0000, #ff0000)
    let cleanedComment = comment.replace(/#[0-9A-Fa-f]{6}/g, '');
    
    // Remove color RGB values (e.g., rgb(255,0,0), rgba(255,0,0,1))
    cleanedComment = cleanedComment.replace(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+)?\s*\)/g, '');
    
    // Remove HSL values (e.g., hsl(0,100%,50%))
    cleanedComment = cleanedComment.replace(/hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(?:,\s*[\d.]+)?\s*\)/g, '');
    
    // Remove color keywords in brackets [COLOR:red] or similar patterns
    cleanedComment = cleanedComment.replace(/\[COLOR:[^\]]+\]/gi, '');
    
    // Remove any remaining color markers
    cleanedComment = cleanedComment.replace(/\bcolor\s*[:=]\s*[^\s,;]+/gi, '');
    
    // Clean up extra whitespace
    cleanedComment = cleanedComment.replace(/\s+/g, ' ').trim();
    
    return cleanedComment;
}

/**
 * Create a new worklog.
 * @param {Object} worklogData - The data for the new worklog.
 * @returns {Promise} - A promise that resolves when the worklog is created.
 */
export function createWorkLog(worklogData) {
    // Clean the comment to remove any color information
    const cleanedData = {
        ...worklogData,
        comment: cleanWorklogComment(worklogData.comment)
    };
    
    return fetch('/worklog', {
        method: 'POST',
        headers:
        {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanedData),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .catch(error => {
        throw error;
    });
}

/**
 * Update an existing worklog
 * @param {string} worklogId - The worklog ID
 * @param {Object} worklogData - The updated worklog data
 * @returns {Promise} - Promise that resolves when worklog is updated
 */
export function updateWorkLog(worklogId, worklogData) {
    // Clean the comment to remove any color information
    const cleanedData = {
        ...worklogData,
        comment: cleanWorklogComment(worklogData.comment)
    };
    
    return fetch(`/worklog/${worklogId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(cleanedData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        // Don't automatically refresh the worklog here as it can corrupt data
        // Let the calling code handle the refresh appropriately
        return result;
    });
}

export async function handleSubmit(event, url, method) {
    event.preventDefault();
    showLoading();
    
    const form = event.target.closest('form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Ensure comment is always a string
    if (data.comment && typeof data.comment !== 'string') {
        data.comment = String(data.comment);
    }
    
    // Debug: Log the form data to see what we're working with

    // Validate required fields
    if (!data.issueId) {
        alert('Please select an issue');
        hideLoading();
        return;
    }
    
    if (!data.startTime || !data.endTime) {
        alert('Please set start and end times');
        hideLoading();
        return;
    }

    // Convert times to UTC
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        alert('Invalid date format');
        hideLoading();
        return;
    }
    
    if (endTime <= startTime) {
        alert('End time must be after start time');
        hideLoading();
        return;
    }
    
    data.startTime = startTime.toISOString();
    data.endTime = endTime.toISOString();
    
    // Handle color - save to issue configuration if changed from default
    const defaultColor = '#2a75fe';
    const selectedColor = data.issueKeyColor || defaultColor;
    
    // Get the issue key to save color to issue configuration
    let issueKey = null;
    
    // Enhanced issue key extraction
    if (method === 'POST') {
        // For create modal, get issue key from selection
        const issueSelect = form.querySelector('#issue-create');
        if (issueSelect && window.choicesCreate) {
            issueKey = getIssueKeyFromChoices(window.choicesCreate, data.issueId);
        }
    } else {
        // For update modal, get issue key from hidden input or form data
        const issueKeyInput = form.querySelector('input[name="issueKey"]');
        if (issueKeyInput) {
            issueKey = issueKeyInput.value;
        } else {
            // Extract from issue label
            const issueLabel = form.querySelector('#issue-label');
            if (issueLabel) {
                const match = issueLabel.textContent.match(/^([A-Z]+-\d+)/);
                if (match) {
                    issueKey = match[1];
                }
            }
        }
    }
    
    
    // Remove issueKeyColor from worklog data - colors are now determined by issue configuration
    delete data.issueKeyColor;
    
    // Submit the worklog with issue key in the data for server-side color handling
    if (issueKey) {
        data.issueKey = issueKey;
    }
    
    // Submit the worklog
    submitWorklog(url, method, data, issueKey, selectedColor);
}

/**
 * Helper function to extract issue key from Choices.js instance
 * @param {Object} choicesInstance - The Choices.js instance
 * @param {string} issueId - The selected issue ID
 * @returns {string|null} The issue key or null if not found
 */
function getIssueKeyFromChoices(choicesInstance, issueId) {
    try {
        
        // Method 1: Check current state choices
        if (choicesInstance._currentState && choicesInstance._currentState.choices) {
            const choice = choicesInstance._currentState.choices.find(choice => 
                choice.value === issueId
            );
            
            if (choice) {
                
                // Try customProperties first
                if (choice.customProperties) {
                    if (choice.customProperties.issueKey) {
                        return choice.customProperties.issueKey;
                    }
                    if (choice.customProperties.key) {
                        return choice.customProperties.key;
                    }
                }
                
                // Try direct properties
                if (choice.issueKey) {
                    return choice.issueKey;
                }
                if (choice.key) {
                    return choice.key;
                }
                
                // Extract from label as last resort
                if (choice.label) {
                    const match = choice.label.match(/^([A-Z]+-\d+)/);
                    if (match) {
                        return match[1];
                    }
                }
            }
        }
        
        // Method 2: Check the store
        if (choicesInstance._store && choicesInstance._store.choices) {
            const storeChoice = choicesInstance._store.choices.find(choice => 
                choice.value === issueId
            );
            if (storeChoice) {
                if (storeChoice.customProperties && storeChoice.customProperties.issueKey) {
                    return storeChoice.customProperties.issueKey;
                }
                if (storeChoice.label) {
                    const match = storeChoice.label.match(/^([A-Z]+-\d+)/);
                    if (match) return match[1];
                }
            }
        }
        
        return null;
        
    } catch (error) {
        return null;
    }
}

/**
 * Submit the worklog to the server
 * @param {string} url - The API endpoint
 * @param {string} method - HTTP method
 * @param {Object} data - Form data
 * @param {string} issueKey - The issue key
 * @param {string} selectedColor - The selected color
 */
async function submitWorklog(url, method, data, issueKey, selectedColor) {
    try {
        // First, save the color to the issue configuration if it's not the default
        const defaultColor = '#2a75fe';
        if (selectedColor !== defaultColor && issueKey) {
            try {
                const colorResponse = await fetch('/config/saveIssueColor', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        issueKey: issueKey,
                        color: selectedColor
                    })
                });
                
                if (!colorResponse.ok) {
                }
            } catch (error) {
            }
        }

        // Now submit the worklog
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            // Handle API errors properly
            throw new Error(result.error || `HTTP error! status: ${response.status}`);
        }
        
        
        // Handle calendar updates based on method
        if (method === 'POST') {
            // For new worklogs, refresh the specific worklog
            if (result.id && result.issueId) {
                await refreshWorklog(result.issueId, result.id);
            } else {
                // Fallback to full refresh
                window.calendar?.refetchEvents();
            }
            
            // Close create modal
            hideModal('.modal-create');
            
        } else if (method === 'PUT') {
            // For updates, use the calendar modal update handler from calendar.js
            if (window.handleModalWorklogUpdate && data.worklogId) {
                // Include the color in the result data for proper update
                result.issueKeyColor = selectedColor;
                result.worklogId = data.worklogId;
                result.startTime = data.startTime;
                result.endTime = data.endTime;
                result.comment = (data.comment && typeof data.comment === 'string') ? data.comment : '';
                
                // Call the calendar's modal update handler
                window.handleModalWorklogUpdate(result, data.worklogId);
            } else {
                // Fallback to refreshing the specific worklog
                await refreshWorklog(result.issueId || data.issueId, data.worklogId);
                
                // Close update modal
                hideModal('.modal-update');
            }
        }
        
        
    } catch (error) {
        
        // Show user-friendly error message
        let errorMessage = error.message;
        
        // Handle specific error cases
        if (error.message.includes('permission') || error.message.includes('403')) {
            errorMessage = 'You do not have permission to perform this operation on this issue.';
        } else if (error.message.includes('404')) {
            errorMessage = 'The worklog or issue could not be found.';
        } else if (error.message.includes('400')) {
            // For 400 errors, the message from the server should be descriptive enough
            errorMessage = error.message.replace('HTTP error! status: 400', '').trim() || 'Bad request - please check your input.';
        }
        
        alert(`Error: ${errorMessage}`);
    } finally {
        hideLoading();
    }
}

/**
 * Handles the deletion of a worklog.
 * @param {Event} event - The button click event.
 * @param {string} url - The URL to send the delete request to.
 */
export function handleDelete(event, url) {
    event.preventDefault();

    if (!confirm('Are you sure you want to delete this worklog?')) {
        return;
    }
    
    showLoading();
    
    fetch(url, {
        method: 'DELETE'
    }).then(async response => {
        const result = await response.json();
        
        if (!response.ok) {
            // Handle API errors properly
            let errorMessage = result.error || `Server error: ${response.status}`;
            
            // Handle specific error cases
            if (response.status === 403 || errorMessage.includes('permission')) {
                errorMessage = 'You do not have permission to delete this worklog.';
            } else if (response.status === 404) {
                errorMessage = 'The worklog could not be found.';
            }
            
            throw new Error(errorMessage);
        }
        
        
        // Close the modal first
        hideModal('.modal-update');
        
        // Refresh the calendar
        if (window.calendar) {
            window.calendar.refetchEvents();
        }
        
        hideLoading();
        
    }).catch(error => {
        hideLoading();
        alert(`Error: ${error.message}`);
    });
}

// Make functions available globally
window.createWorkLog = createWorkLog;
window.updateWorkLog = updateWorkLog;
window.cleanWorklogComment = cleanWorklogComment;
window.handleSubmit = handleSubmit;
window.handleDelete = handleDelete;
