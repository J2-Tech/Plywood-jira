/**
 * General function to show a modal.
 * @param {string} modalClass - The class of the modal to show.
 * @param {Date} [start] - The start date/time.
 * @param {Date} [end] - The end date/time.
 */
export function showModal(modalClass, start, end) {
    const modal = document.querySelector(modalClass);
    if (start && end) {
        const startInput = modal.querySelector('input[name*="start"]');
        startInput.value = start.toISOString();

        const durationInput = modal.querySelector('input[name*="duration"]');
        durationInput.value = (end - start) / 1000;
    }
    modal.style.display = "block";
}

/**
 * General function to hide a modal.
 * @param {string} modalClass - The class of the modal to hide.
 */
export function hideModal(modalClass) {
    
    const modal = document.querySelector(modalClass);
    modal.style.display = "none";
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
    form.querySelector('input[name="start"]').value = event.start.toISOString();
    form.querySelector('input[name="duration"]').value = (event.end - event.start) / 1000;

    const issueKey = event.extendedProps.issueKey;
    const issueSummary = event.extendedProps.issueSummary;
    const jiraUrl = document.querySelector('meta[name="jira-url"]').getAttribute('content');
    const issueUrl = `https://${jiraUrl}/browse/${issueKey}`;

    const issueLabel = form.querySelector('#issue-label');
    issueLabel.textContent = `${issueKey} - ${issueSummary}`;
    issueLabel.href = issueUrl;

    form.querySelector('textarea[name="comment"]').value = event.extendedProps.comment || ''; // Ensure comment is not undefined
    modal.style.display = "block";
}

/**
 * Function to show the create modal.
 * @param {Date} start - The start date/time.
 * @param {Date} end - The end date/time.
 */
export function showCreateModal(start, end) {
    showModal('.modal-create', start, end);
}

/**
 * Toggles the visibility of the config modal.
 */
export function toggleConfigModal() {
    const modal = document.getElementById('configModal');
    if (modal.style.display === 'none' || modal.style.display === '') {
        modal.style.display = 'block';
    } else {
        modal.style.display = 'none';
    }
}

window.hideModal = hideModal;
window.showModal = showModal;
window.showUpdateModal = showUpdateModal;
window.showCreateModal = showCreateModal;
window.toggleConfigModal = toggleConfigModal;
