import { hideModal } from './modal.js';
import { refreshEverything } from './calendar.js';
import { showLoading, hideLoading } from './ui.js';

/**
 * Create a new worklog.
 * @param {Object} worklogData - The data for the new worklog.
 * @returns {Promise} - A promise that resolves when the worklog is created.
 */
export function createWorkLog(worklogData) {
    return fetch('/worklog', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(worklogData),
    })
    .then(response => response.json())
    .catch(error => {
        console.error('Error creating worklog:', error);
        throw error;
    });
}

export function handleSubmit(event, url, method) {
    showLoading();
    event.preventDefault();
    const form = event.target.closest('form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Convert the start and end time back to UTC
    const startTime = new Date(data.startTime).toISOString();
    const endTime = new Date(data.endTime).toISOString();
    data.startTime = startTime;
    data.endTime = endTime;

    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).then(response => {
        window.calendar.unselect();
        if (response.ok) {
            hideModal('.modal-create');
            hideModal('.modal-update');
            refreshEverything();
        } else {
            console.error('Failed to submit form');
            hideLoading();
        }
    }).catch(error => {
        console.error('Error:', error);
    });
}

/**
 * Handles the deletion of a worklog.
 * @param {Event} event - The button click event.
 * @param {string} url - The URL to send the delete request to.
 */
export function handleDelete(event, url) {
    event.preventDefault();

    fetch(url, {
        method: 'DELETE'
    }).then(response => {
        if (response.ok) {
            hideModal('.modal-update');
            refreshEverything();
        } else {
            console.error('Failed to delete worklog');
        }
    }).catch(error => {
        console.error('Error:', error);
    });
}

window.createWorkLog = createWorkLog;
window.handleSubmit = handleSubmit;
window.handleDelete = handleDelete;
