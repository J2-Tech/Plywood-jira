import { showLoading, hideLoading } from './ui.js';
import { refreshWorklog } from './calendar.js';
import { toggleTimerModal, showTimerModal, hideTimerModal } from './timer.js';

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
    form.querySelector('input[name="worklogId"]').value = event.extendedProps.worklogId;
    form.querySelector('input[name="issueId"]').value = event.extendedProps.issueId;

    const issueKey = event.extendedProps.issueKey;
    const issueSummary = event.extendedProps.issueSummary;
    const jiraUrl = document.querySelector('meta[name="jira-url"]').getAttribute('content');
    const issueUrl = `https://${jiraUrl}/browse/${issueKey}`;

    const issueLabel = form.querySelector('#issue-label');
    issueLabel.textContent = `${issueKey} - ${issueSummary}`;
    issueLabel.href = issueUrl;

    // Set the author
    const authorLabel = form.querySelector('#author-label');
    authorLabel.textContent = `Author: ${event.extendedProps.author}`;

    // Convert the start and end time to the client's timezone
    const startTime = new Date(event.start.getTime() - event.start.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const endTime = new Date(event.end.getTime() - event.end.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    form.querySelector('input[name="startTime"]').value = startTime;
    form.querySelector('input[name="endTime"]').value = endTime;
    form.querySelector('input[name="issueKeyColor"]').value = event.backgroundColor || '#000000';

    form.querySelector('textarea[name="comment"]').value = event.extendedProps.comment || ''; // Ensure comment is not undefined
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
    const startTimeInput = form.querySelector('input[name="startTime"]');
    const endTimeInput = form.querySelector('input[name="endTime"]');

    if (startTimeInput && endTimeInput) {
        startTimeInput.value = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        endTimeInput.value = new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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

    colorPickerInput.value = event.backgroundColor || '#000000';
    issueKeyDisplay.textContent = `${event.extendedProps.issueKey}`;

    colorPickerModal.style.left = `${jsEvent.clientX}px`;
    colorPickerModal.style.top = `${jsEvent.clientY}px`;
    colorPickerModal.style.display = 'flex';

    // Save the event to be used later
    window.currentEvent = event;
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
    const event = { ...window.currentEvent }; // Copy the current event

    if (!event || !event._def.extendedProps) {
        console.error('Event or extendedProps is undefined');
        hideColorPickerModal();
        hideLoading();
        return;
    }

    saveColorForIssue(event._def.extendedProps.issueKey, newColor)
        .then(() => {
            // After saving color, refresh all calendar events
            if (window.calendar) {
                window.calendar.refetchEvents();
            }
        })
        .finally(() => {
            hideColorPickerModal();
            hideLoading();
        });
}

// Update saveColorForIssue to return a promise
function saveColorForIssue(issueKey, color) {
    return fetch(`/config/saveIssueColor`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ issueKey, color })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to save issue color');
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
