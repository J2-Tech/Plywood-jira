import { hideModal } from './modal.js';
import { refreshWorklog } from './calendar.js';
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
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    data.startTime = new Date(startTime.getTime()).toISOString();
    data.endTime = new Date(endTime.getTime()).toISOString();

    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).then(async response => {
        if (response.ok) {
            hideModal('.modal-create');
            hideModal('.modal-update');
            const result = await response.json();
            refreshWorklog(result.issueId, result.id);
        } else {
            console.error('Failed to submit form');
        }
        hideLoading();
    }).catch(error => {
        console.error('Error:', error);
        hideLoading();
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
            // url = '/worklog/:worklogId?issueId=:issueId'
            // get last url segment as worklog id, and issueId query parameter for issue ID

            const issueId = url.split('?')[1].split('=')[1];
            const worklogId = url.split('/')[2].split('?')[0];
            window.calendar.getEvents().find(event => {
                if (event.extendedProps.worklogId === worklogId) {
                    event.remove();
                }
            });
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
