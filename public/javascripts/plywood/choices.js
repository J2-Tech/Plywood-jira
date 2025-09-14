import { showLoading, hideLoading } from './ui.js';
import { refreshWorklog } from './calendar.js';
import { toggleTimerModal, showTimerModal, hideTimerModal } from './timer.js';
import { getContrastingTextColor } from './colorUtils.js';

/**
 * General function to show a modal.
 * @param {string} modalClass - The class of the modal to show.
 */
export function showModal(modalClass) {
    const modal = document.querySelector(modalClass);
    if (modal) {
        modal.style.display = 'block';
    }
}

/**
 * General function to hide a modal.
 * @param {string} modalClass - The class of the modal to hide.
 */
export function hideModal(modalClass) {
    const modal = document.querySelector(modalClass);
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Function to show the update modal.
 * @param {Object} event - The event object.
 */
export function showUpdateModal(event) {
    const modal = document.querySelector('.modal-update');
    const form = modal.querySelector('form');
    
    console.log('Showing update modal for event:', event);
    console.log('Event extended props:', event.extendedProps);
    
    // Helper function to safely get extended property with fallback
    const getExtendedProp = (propName) => {
        // Try direct access first
        if (event.extendedProps && event.extendedProps[propName] !== undefined) {
            return event.extendedProps[propName];
        }
        // Try nested extendedProps structure
        if (event.extendedProps && event.extendedProps.extendedProps && event.extendedProps.extendedProps[propName] !== undefined) {
            return event.extendedProps.extendedProps[propName];
        }
        // Try direct on event object
        if (event[propName] !== undefined) {
            return event[propName];
        }
        // Try _def properties for FullCalendar internal structure
        if (event._def && event._def.extendedProps && event._def.extendedProps[propName] !== undefined) {
            return event._def.extendedProps[propName];
        }
        return undefined;
    };
    
    const worklogId = getExtendedProp('worklogId') || event.id;
    const issueId = getExtendedProp('issueId');
    const issueKey = getExtendedProp('issueKey');
    const issueSummary = getExtendedProp('issueSummary');
    const author = getExtendedProp('author');
    const comment = getExtendedProp('comment');
    
    // If we're missing critical data, try to refresh the event first
    if (!worklogId || !issueId || !issueKey) {
        console.warn('Event missing critical properties, attempting to refresh from server');
        
        // Try to extract IDs from available data
        const eventId = event.id || worklogId;
        const fallbackIssueId = issueId || getExtendedProp('issueId');
        
        if (eventId && fallbackIssueId) {
            console.log(`Refreshing event ${eventId} for issue ${fallbackIssueId} before showing modal`);
            
            // Refresh the event and try again
            fetch(`/events/${eventId}?issueId=${fallbackIssueId}&_nocache=${Date.now()}`)
                .then(response => response.json())
                .then(refreshedData => {
                    console.log('Refreshed event data:', refreshedData);
                    
                    // Update the event with fresh data
                    if (refreshedData.extendedProps) {
                        Object.keys(refreshedData.extendedProps).forEach(key => {
                            event.setExtendedProp(key, refreshedData.extendedProps[key]);
                        });
                    }
                    
                    // Try showing the modal again with refreshed data
                    showUpdateModal(event);
                })
                .catch(error => {
                    console.error('Failed to refresh event data:', error);
                    alert('Error: Could not load event details. Please refresh the page and try again.');
                });
            return;
        } else {
            console.error('Event missing required properties and cannot be refreshed. WorklogId:', worklogId, 'IssueId:', issueId);
            console.error('Full event object:', event);
            alert('Error: Event data is incomplete. Please refresh the page and try again.');
            return;
        }
    }
    
    form.querySelector('input[name="worklogId"]').value = worklogId;
    form.querySelector('input[name="issueId"]').value = issueId;
    
    // Set the issue key in the hidden input for easy access
    const issueKeyInput = form.querySelector('input[name="issueKey"]');
    if (issueKeyInput) {
        issueKeyInput.value = issueKey;
    }
    
    const jiraUrl = document.querySelector('meta[name="jira-url"]').getAttribute('content');
    const issueUrl = `https://${jiraUrl}/browse/${issueKey}`;

    const issueLabel = form.querySelector('#issue-label');
    issueLabel.textContent = `${issueKey} - ${issueSummary}`;
    issueLabel.href = issueUrl;

    // Set the author
    const authorLabel = form.querySelector('#author-label');
    authorLabel.textContent = `Author: ${author || 'Unknown'}`;

    // Convert the start and end time to datetime-local format
    form.querySelector('input[name="startTime"]').value = formatDateForInput(event.start);
    form.querySelector('input[name="endTime"]').value = formatDateForInput(event.end);
    
    // Set the color - this comes from the issue configuration, not the worklog
    const colorValue = event.backgroundColor || getExtendedProp('issueColor') || '#2a75fe';
    form.querySelector('input[name="issueKeyColor"]').value = colorValue;
    
    // Save the color to localStorage for future use
    if (colorValue) {
        localStorage.setItem('lastUsedColor', colorValue);
    }

    form.querySelector('textarea[name="comment"]').value = comment || '';
    modal.style.display = "block";
}

/**
 * Function to show the create modal.
 * @param {Date} start - The start date/time.
 * @param {Date} end - The end date/time.
 */
export function showCreateModal(start, end) {
    const modal = document.querySelector('.modal-create');
    const form = modal.querySelector('form');
    
    // Clear form first
    form.reset();
    
    // Clear issue selection
    const issueSelect = form.querySelector('#issue-create');
    if (issueSelect && window.choicesCreate) {
        window.choicesCreate.removeActiveItems();
    }
    
    // Clear any existing icon display
    const iconDisplay = modal.querySelector('.selected-issue-icon');
    if (iconDisplay) {
        iconDisplay.style.display = 'none';
    }
    
    const startTimeInput = form.querySelector('input[name="startTime"]');
    const endTimeInput = form.querySelector('input[name="endTime"]');
    const colorInput = form.querySelector('input[name="issueKeyColor"]');

    // Reset color to default
    if (colorInput) {
        colorInput.value = '#2a75fe';
    }

    // Set times - convert to local datetime-local format
    if (startTimeInput && endTimeInput) {
        startTimeInput.value = formatDateForInput(start);
        endTimeInput.value = formatDateForInput(end);
    }
    
    modal.style.display = "block";
    
}

/**
 * Toggles the visibility of the config modal.
 */
export function toggleConfigModal() {
    const modal = document.getElementById('configModal');
    if (modal.style.display === 'none' || modal.style.display === '') {
        window.loadConfig().then(() => {
            modal.style.display = 'block';
        });
    } else {
        modal.style.display = 'none';
        if (window.calendar) {
            window.calendar.refetchEvents();
        }
    }
}

/**
 * Show color picker for an event.
 * @param {Object} event - The FullCalendar event object.
 * @param {Object} jsEvent - The JavaScript event object.
 */
export function showColorPicker(event, jsEvent) {
    const colorPickerModal = document.getElementById('colorPickerModal');
    const colorPickerInput = document.getElementById('colorPickerInput');
    const issueKeyDisplay = document.getElementById('issueKeyDisplay');

    // Get the issue key from the event
    const issueKey = event.extendedProps?.issueKey || event._def?.extendedProps?.issueKey;
    if (!issueKey) {
        console.error('No issue key found for color picker');
        return;
    }

    colorPickerInput.value = event.backgroundColor || '#000000';
    issueKeyDisplay.textContent = issueKey;

    colorPickerModal.style.left = `${jsEvent.clientX}px`;
    colorPickerModal.style.top = `${jsEvent.clientY}px`;
    colorPickerModal.style.display = 'flex';

    // Save the event and issue key for later use
    window.currentEvent = event;
    window.currentIssueKey = issueKey;
}

/**
 * Hide the color picker modal.
 */
export function hideColorPickerModal() {
    const colorPickerModal = document.getElementById('colorPickerModal');
    colorPickerModal.style.display = 'none';
}

// Update the saveColor function
export function saveColor() {
    showLoading();
    const colorPickerInput = document.getElementById('colorPickerInput');
    const newColor = colorPickerInput.value;
    const event = window.currentEvent;
    const issueKey = window.currentIssueKey;

    if (!event || !issueKey) {
        console.error('Event or issue key is undefined');
        hideColorPickerModal();
        hideLoading();
        return;
    }
    
    console.log(`Saving color ${newColor} for issue ${issueKey}`);
    
    // Calculate contrasting text color
    const textColor = getContrastingTextColor(newColor);
    console.log(`Calculated text color ${textColor} for background ${newColor}`);
    
    // Save the color to the issue configuration
    saveColorForIssue(issueKey, newColor)
        .then((data) => {
            console.log('Color saved successfully to issue config:', data);
            
            // Update the current event immediately with both background and text color
            event.setProp('backgroundColor', newColor);
            event.setProp('borderColor', newColor);
            event.setProp('textColor', textColor);
            event.setExtendedProp('issueColor', newColor);
            event.setExtendedProp('calculatedTextColor', textColor);
            
            // Update any open modals with the new color
            updateModalColors(issueKey, newColor);
            
            // Update all calendar events for this issue with the new color
            updateCalendarEventsColor(issueKey, newColor);
            
            // Clear cached choices to ensure fresh data on next search
            clearCachedChoicesForIssue(issueKey);
            
            // Clear server-side color cache
            return fetch('/config/refreshColors?_t=' + Date.now(), {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                }
            });
        })
        .then(() => {
            console.log('Server caches cleared successfully');
            
            // Force calendar refresh with updated colors
            if (window.calendar) {
                console.log('Refreshing calendar with new colors...');
                window.calendar.refetchEvents();
            }
        })
        .catch(error => {
            console.error("Error saving color or refreshing:", error);
            alert(`Failed to save color: ${error.message}`);
        })
        .finally(() => {
            hideColorPickerModal();
            hideLoading();
            
            // Clean up
            window.currentEvent = null;
            window.currentIssueKey = null;
        });
}

/**
 * Update all calendar events for a specific issue with a new color
 * @param {string} issueKey - The issue key that was updated
 * @param {string} newColor - The new color value
 */
function updateCalendarEventsColor(issueKey, newColor) {
    if (!window.calendar) return;
    
    const events = window.calendar.getEvents();
    let updatedCount = 0;
    
    // Calculate contrasting text color once
    const textColor = getContrastingTextColor(newColor);
    
    events.forEach(event => {
        if (event.extendedProps && 
            event.extendedProps.issueKey && 
            event.extendedProps.issueKey.toUpperCase() === issueKey.toUpperCase()) {
            
            // Update the event's colors
            event.setProp('backgroundColor', newColor);
            event.setProp('borderColor', newColor);
            event.setProp('textColor', textColor);
            event.setExtendedProp('calculatedTextColor', textColor);
            updatedCount++;
            
            console.log(`Updated calendar event ${event.id} with background ${newColor} and text ${textColor} for issue ${issueKey}`);
        }
    });
    
    if (updatedCount > 0) {
        console.log(`Updated ${updatedCount} calendar events with new colors (bg: ${newColor}, text: ${textColor}) for issue ${issueKey}`);
    }
}

/**
 * Update color inputs in open modals when an issue color is changed
 * @param {string} issueKey - The issue key that was updated
 * @param {string} newColor - The new color value
 */
function updateModalColors(issueKey, newColor) {
    // Update create modal if open and has matching issue selected
    const createModal = document.querySelector('.modal-create');
    if (createModal && createModal.style.display === 'block') {
        const createIssueSelect = document.getElementById('issue-create');
        const createColorInput = document.getElementById('issue-key-color-create');
        
        if (createIssueSelect && createColorInput) {
            const selectedIssueKey = getSelectedIssueKey(createIssueSelect);
            if (selectedIssueKey && selectedIssueKey.toUpperCase() === issueKey.toUpperCase()) {
                createColorInput.value = newColor;
                console.log(`Updated create modal color input to ${newColor} for issue ${issueKey}`);
            }
        }
    }
    
    // Update update modal if open and has matching issue
    const updateModal = document.querySelector('.modal-update');
    if (updateModal && updateModal.style.display === 'block') {
        const updateColorInput = document.getElementById('issue-key-color');
        const issueLabel = document.getElementById('issue-label');
        
        if (updateColorInput && issueLabel) {
            const labelText = issueLabel.textContent || '';
            const labelIssueKey = labelText.split(' - ')[0];
            if (labelIssueKey && labelIssueKey.toUpperCase() === issueKey.toUpperCase()) {
                updateColorInput.value = newColor;
                console.log(`Updated update modal color input to ${newColor} for issue ${issueKey}`);
            }
        }
    }
    
    // Clear cached choices for this issue to force fresh fetch next time
    clearCachedChoicesForIssue(issueKey);
}

/**
 * Clear cached choices for a specific issue to force fresh data fetch
 * @param {string} issueKey - The issue key to clear from cache
 */
function clearCachedChoicesForIssue(issueKey) {
    console.log(`Clearing cached choices for issue ${issueKey}`);
    
    // Clear from create dropdown cache
    if (window.choicesCreate && window.choicesCreate._currentState && window.choicesCreate._currentState.choices) {
        const choices = window.choicesCreate._currentState.choices;
        const originalLength = choices.length;
        
        for (let i = choices.length - 1; i >= 0; i--) {
            const choice = choices[i];
            let choiceIssueKey = null;
            
            // Try to get issue key from choice (check customProperties first)
            if (choice.customProperties && choice.customProperties.issueKey) {
                choiceIssueKey = choice.customProperties.issueKey;
            } else if (choice.customProperties && choice.customProperties.key) {
                choiceIssueKey = choice.customProperties.key;
            } else if (choice.issueKey) {
                choiceIssueKey = choice.issueKey;
            } else if (choice.key) {
                choiceIssueKey = choice.key;
            } else if (choice.label) {
                const match = choice.label.match(/^([A-Z]+-\d+)/);
                if (match) choiceIssueKey = match[1];
            }
            
            if (choiceIssueKey && choiceIssueKey.toUpperCase() === issueKey.toUpperCase()) {
                console.log(`Removing cached choice for issue ${issueKey} from create dropdown:`, choice);
                choices.splice(i, 1);
            }
        }
        
        if (choices.length !== originalLength) {
            console.log(`Removed ${originalLength - choices.length} cached choices for issue ${issueKey} from create dropdown`);
            // Force re-render of choices
            window.choicesCreate._render();
        }
    }
    
    // Clear from timer dropdown cache
    if (window.choicesTimer && window.choicesTimer._currentState && window.choicesTimer._currentState.choices) {
        const choices = window.choicesTimer._currentState.choices;
        const originalLength = choices.length;
        
        for (let i = choices.length - 1; i >= 0; i--) {
            const choice = choices[i];
            let choiceIssueKey = null;
            
            // Try to get issue key from choice (check customProperties first)
            if (choice.customProperties && choice.customProperties.issueKey) {
                choiceIssueKey = choice.customProperties.issueKey;
            } else if (choice.customProperties && choice.customProperties.key) {
                choiceIssueKey = choice.customProperties.key;
            } else if (choice.issueKey) {
                choiceIssueKey = choice.issueKey;
            } else if (choice.key) {
                choiceIssueKey = choice.key;
            } else if (choice.label) {
                const match = choice.label.match(/^([A-Z]+-\d+)/);
                if (match) choiceIssueKey = match[1];
            }
            
            if (choiceIssueKey && choiceIssueKey.toUpperCase() === issueKey.toUpperCase()) {
                console.log(`Removing cached choice for issue ${issueKey} from timer dropdown:`, choice);
                choices.splice(i, 1);
            }
        }
        
        if (choices.length !== originalLength) {
            console.log(`Removed ${originalLength - choices.length} cached choices for issue ${issueKey} from timer dropdown`);
            // Force re-render of choices
            window.choicesTimer._render();
        }
    }
    
    // Also clear any browser/client-side caches related to issue colors
    if (window.localStorage) {
        // Clear any cached color data (adjust key pattern as needed)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes(`color_${issueKey}`) || key.includes(`issue_${issueKey}`))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => {
            console.log(`Removing cached localStorage item: ${key}`);
            localStorage.removeItem(key);
        });
    }
}

/**
 * Get the issue key from a select element
 * @param {HTMLSelectElement} selectElement - The select element
 * @returns {string|null} The issue key or null if not found
 */
function getSelectedIssueKey(selectElement) {
    if (!selectElement || !selectElement.value) return null;
    
    // Try to get from Choices.js instance
    const choicesInstance = selectElement.id === 'issue-create' ? window.choicesCreate : null;
    if (choicesInstance) {
        try {
            // Check if _currentState exists and has choices
            if (choicesInstance._currentState && choicesInstance._currentState.choices) {
                const selectedChoice = choicesInstance._currentState.choices.find(choice => 
                    choice.value === selectElement.value && choice.selected
                );
                
                if (selectedChoice && selectedChoice.customProperties && selectedChoice.customProperties.issueKey) {
                    return selectedChoice.customProperties.issueKey;
                }
                
                // Fallback: extract from label
                if (selectedChoice && selectedChoice.label) {
                    const match = selectedChoice.label.match(/^([A-Z]+-\d+)/);
                    return match ? match[1] : null;
                }
            }
            
            // Alternative approach - try to get from getValue() if available
            if (typeof choicesInstance.getValue === 'function') {
                const selectedValue = choicesInstance.getValue(true);
                if (selectedValue && selectedValue.customProperties && selectedValue.customProperties.issueKey) {
                    return selectedValue.customProperties.issueKey;
                }
                if (selectedValue && selectedValue.label) {
                    const match = selectedValue.label.match(/^([A-Z]+-\d+)/);
                    return match ? match[1] : null;
                }
            }
        } catch (error) {
            console.warn('Error accessing Choices.js instance:', error);
        }
    }
    
    // Fallback: try to extract from the selected option text directly
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    if (selectedOption && selectedOption.text) {
        const match = selectedOption.text.match(/^([A-Z]+-\d+)/);
        return match ? match[1] : null;
    }
    
    return null;
}

/**
 * Save color for a specific issue
 * @param {string} issueKey - The issue key
 * @param {string} color - The color hex value
 * @returns {Promise} - Promise that resolves when color is saved
 */
function saveColorForIssue(issueKey, color) {
    return fetch('/config/saveIssueColor', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            issueKey: issueKey,
            color: color
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const configRoundingIntervalInput = document.getElementById('rounding-interval');
    if (configRoundingIntervalInput) {
        configRoundingIntervalInput.value = window.roundingInterval;
        configRoundingIntervalInput.addEventListener('input', (event) => {
            window.roundingInterval = parseInt(event.target.value, 10);
            syncRoundingInterval();
        });
    }
});

function syncRoundingInterval() {
    const timerRoundingIntervalInput = document.getElementById('timer-rounding-interval');
    if (timerRoundingIntervalInput) {
        timerRoundingIntervalInput.value = window.roundingInterval;
    }
}

export function showAboutModal() {
    const modal = document.querySelector('.modal-about');
    modal.style.display = 'block';
}

export function hideAboutModal() {
    const modal = document.querySelector('.modal-about');
    modal.style.display = 'none';
}

// Make all modal functions available globally
window.showModal = showModal;
window.hideModal = hideModal;
window.showUpdateModal = showUpdateModal;
window.showCreateModal = showCreateModal;
window.toggleConfigModal = toggleConfigModal;
window.showColorPicker = showColorPicker;
window.hideColorPickerModal = hideColorPickerModal;
window.saveColor = saveColor;
window.showAboutModal = showAboutModal;
window.hideAboutModal = hideAboutModal;
window.toggleTimerModal = toggleTimerModal;
window.showTimerModal = showTimerModal;
window.hideTimerModal = hideTimerModal;
window.saveColorForIssue = saveColorForIssue;
window.clearCachedChoicesForIssue = clearCachedChoicesForIssue;

/**
 * Debug helper function for client-side diagnosis of color issues
 * @param {string} issueKey - The issue key to check
 */
function debugIssueColor(issueKey) {
    if (!issueKey) {
        console.error('No issue key provided for debugging');
        return;
    }
    
    console.log(`Debugging issue color for ${issueKey}...`);
    
    // First check local DOM for any elements with this issue
    const eventsWithThisIssue = [];
    if (window.calendar) {
        const events = window.calendar.getEvents();
        events.forEach(event => {
            if (event.extendedProps && 
                event.extendedProps.issueKey && 
                event.extendedProps.issueKey.toLowerCase() === issueKey.toLowerCase()) {
                
                eventsWithThisIssue.push({
                    title: event.title,
                    backgroundColor: event.backgroundColor,
                    id: event.id
                });
            }
        });
    }
    
    console.log(`Client-side events for issue ${issueKey}:`, eventsWithThisIssue);
    
    // Then check with server
    fetch(`/config/debugIssueColor/${issueKey}?_t=${Date.now()}`, {
        headers: {
            'Cache-Control': 'no-cache'
        },
        cache: 'no-store'
    })
    .then(response => response.json())
    .then(data => {
        console.log(`Server-side color info for ${issueKey}:`, data);
        
        // Analyze any discrepancies
        if (eventsWithThisIssue.length > 0) {
            const clientColor = eventsWithThisIssue[0].backgroundColor;
            if (clientColor !== data.determinedColor) {
                console.warn(`Color mismatch! Client: ${clientColor}, Server: ${data.determinedColor}`);
            }
        }
    })
    .catch(error => {
        console.error('Error getting debug color info:', error);
    });
}

// Make the debug function available globally
window.debugIssueColor = debugIssueColor;

/**
 * Helper function to format Date object for datetime-local input
 * @param {Date} date - The date to format
 * @returns {string} - Formatted date string for datetime-local input
 */
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Helper function to convert datetime-local input value to ISO string
 * @param {string} datetimeLocalValue - The datetime-local input value
 * @returns {string} - ISO string with timezone
 */
function convertToISOString(datetimeLocalValue) {
    if (!datetimeLocalValue) return '';
    
    // Create a new Date object from the datetime-local value
    // datetime-local values are in format: "2023-12-25T14:30"
    const date = new Date(datetimeLocalValue);
    
    // Return ISO string which includes timezone information
    return date.toISOString();
}

/**
 * Handle successful worklog update from modal
 * @param {Object} updatedData - The updated worklog data from server
 * @param {string} worklogId - The worklog ID that was updated
 */
export function handleWorklogUpdateSuccess(updatedData, worklogId) {
    console.log('Handling successful worklog update - refreshing calendar');
    
    // Simply refresh all calendar events
    if (window.calendar) {
        window.calendar.refetchEvents();
    }
    
    // Close the update modal
    const updateModal = document.querySelector('.modal-update');
    if (updateModal) {
        updateModal.style.display = 'none';
        console.log('Update modal closed');
    }
}

// Make the function available globally
window.handleWorklogUpdateSuccess = handleWorklogUpdateSuccess;

/**
 * Load issue type avatar with fallback
 * @param {string} issueTypeId - The issue type ID
 * @param {string} size - The size (xsmall, small, medium, large)
 * @returns {string} - The avatar URL or fallback
 */
function getIssueTypeAvatarUrl(issueTypeId, size = 'medium') {
    if (!issueTypeId) {
        return `/avatars/issuetype/unknown?size=${size}&fallback=true`;
    }
    
    // Always use our proxy endpoint - it will handle downloading from JIRA
    return `/avatars/issuetype/${issueTypeId}?size=${size}`;
}

/**
 * Update issue display with avatar
 * @param {HTMLElement} element - The element to update
 * @param {Object} issueData - Issue data containing type information
 */
function updateIssueDisplayWithAvatar(element, issueData) {
    if (!element || !issueData) return;
    
    const issueTypeId = issueData.fields?.issuetype?.id;
    const issueTypeName = issueData.fields?.issuetype?.name || 'Unknown';
    
    // Find or create avatar element
    let avatarElement = element.querySelector('.issue-type-avatar');
    if (!avatarElement) {
        avatarElement = document.createElement('img');
        avatarElement.className = 'issue-type-avatar';
        avatarElement.style.cssText = 'width: 16px; height: 16px; margin-right: 4px; vertical-align: middle;';
        element.insertBefore(avatarElement, element.firstChild);
    }
    
    // Set avatar with our proxy URL
    const avatarUrl = getIssueTypeAvatarUrl(issueTypeId, 'small');
    avatarElement.src = avatarUrl;
    avatarElement.alt = issueTypeName;
    avatarElement.title = issueTypeName;
    
    // Handle avatar load errors with our fallback system
    avatarElement.onerror = function() {
        console.warn(`Avatar failed to load for issue type ${issueTypeId}, trying fallback`);
        
        // Try fallback URL if not already using it
        if (!this.src.includes('fallback=true')) {
            this.src = `/avatars/issuetype/${issueTypeId || 'unknown'}?size=small&fallback=true`;
        } else {
            console.error(`Even fallback avatar failed for issue type ${issueTypeId}`);
            // As last resort, hide the avatar
            this.style.display = 'none';
        }
    };
    
    // Add loading indicator
    avatarElement.onload = function() {
        console.log(`Avatar loaded successfully for issue type ${issueTypeId}`);
        this.style.opacity = '1';
    };
    
    // Start with reduced opacity while loading
    avatarElement.style.opacity = '0.7';
}

// Make the avatar functions available globally for debugging
window.getIssueTypeAvatarUrl = getIssueTypeAvatarUrl;
window.updateIssueDisplayWithAvatar = updateIssueDisplayWithAvatar;

/**
 * Format an individual issue for display in choices
 * @param {Object} issue - The issue object
 * @returns {string} - The HTML string for the issue choice
 */
function formatIssueChoice(issue) {
    const issueKey = issue.key;
    const summary = issue.fields.summary;
    const issueType = issue.fields.issuetype;
    const issueTypeId = issueType ? issueType.id : null;
    const issueTypeName = issueType ? issueType.name : 'Unknown';
    
    // Always use our proxy endpoint for issue type avatars
    const avatarUrl = issueTypeId ? `/avatars/issuetype/${issueTypeId}?size=small` : `/avatars/issuetype/unknown?size=small&fallback=true`;
    
    // Create HTML with issue type icon
    const html = `
        <div class="issue-choice">
            <img src="${avatarUrl}" 
                 alt="${issueTypeName}" 
                 title="${issueTypeName}"
                 class="issue-type-icon"
                 style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;"
                 onerror="this.src='/avatars/issuetype/${issueTypeId || 'unknown'}?size=small&fallback=true'">
            <span class="issue-key">${issueKey}</span>
            <span class="issue-summary"> - ${summary}</span>
        </div>
    `;
    
    return html;
}