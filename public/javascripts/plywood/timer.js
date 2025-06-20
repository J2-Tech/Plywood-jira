import { createWorkLog } from './worklog.js';
import { refreshWorklog } from './calendar.js';
import { showLoading, hideLoading } from './ui.js';

const minSaveMinutes = 5; // Minimum time to save a worklog in minutes
window.roundingInterval = 1;
let timerInterval;
let timerStartTime;
let previousIssueId;

/**
 * Toggles between starting and saving the timer.
 */
export function toggleStartSaveTimer() {
    const button = document.getElementById('start-save-timer-btn');
    if (button.textContent === '🔴') {
        startTimer();
    } else if (button.textContent === '💾') {
        stopTimer();
    }
}

/**
 * Starts the timer.
 */
function startTimer() {
    document.getElementById('confirmation-message').textContent = '';
    previousIssueId = document.getElementById('issue-timer').value;
    if (!previousIssueId) {
        document.getElementById('confirmation-message').textContent = 'Please select an issue.';
        return;
    }

    timerStartTime = new Date();
    applyRoundingDown(timerStartTime);

    const localStartTime = new Date(timerStartTime.getTime() - timerStartTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('start-time-timer').value = localStartTime;
    timerInterval = setInterval(updateTimerDisplay, 1000);
    document.getElementById('start-save-timer-btn').textContent = '💾';
    document.getElementById('start-save-timer-btn').classList.add('primary');
    document.getElementById('open-timer-modal-btn').classList.add('primary');

    document.getElementById('timer-duration').style.display = 'inline';
}

/**
 * Stops the timer and saves the worklog.
 */
function stopTimer() {
    const timerEndTime = new Date();
    applyRoundingUp(timerEndTime);

    const duration = timerEndTime - timerStartTime;
    if (duration < minSaveMinutes * 60 * 1000) {
        document.getElementById('confirmation-message').textContent = 'The minimum time for a worklog is 5 minutes.';
        return;
    }

    const localEndTime = new Date(timerEndTime.getTime() - timerEndTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('end-time-timer').value = localEndTime;
    showLoading();
    clearInterval(timerInterval);

    const issueId = previousIssueId;
    const comment = document.getElementById('comment-timer').value;

    const workLogData = {
        startTime: timerStartTime.toISOString(),
        endTime: timerEndTime.toISOString(),
        issueId: issueId,
        comment: comment,
    };

    createWorkLog(workLogData).then(response => {
        if (response.errors || !response.success) {
            const errorMessage = response.errors ? response.errors.join(', ') : (response.error || 'Unknown error occurred');
            document.getElementById('confirmation-message').textContent = 'Error creating worklog: ' + errorMessage;
        } else {
            document.getElementById('confirmation-message').textContent = 'Worklog created successfully!';
            // Use the same simplified refresh logic as the modal
            refreshWorklog(response.issueId, response.id);
            
            // Close the timer modal after successful creation
            setTimeout(() => {
                hideTimerModal();
                console.log('Timer modal closed after successful worklog creation');
            }, 1500); // Wait a bit to show the success message
        }
        hideLoading();
    }).catch(error => {
        console.error('Error creating worklog via timer:', error);
        let errorMessage = error.message;
        
        // Handle specific error cases
        if (error.message.includes('permission') || error.message.includes('403')) {
            errorMessage = 'You do not have permission to create worklogs for this issue.';
        } else if (error.message.includes('404')) {
            errorMessage = 'The issue could not be found.';
        }
        
        document.getElementById('confirmation-message').textContent = 'Error creating worklog: ' + errorMessage;
        hideLoading();
    });

    resetTimerUI();
}

/**
 * Cancels the timer.
 */
export function cancelTimer() {
    clearInterval(timerInterval);
    resetTimerUI();
}

/**
 * Handles issue switch event.
 */
export function handleTimerIssueSwitch(event) {
    if (window.saveTimerOnIssueSwitch && document.getElementById('start-save-timer-btn').textContent === '💾') {
        stopTimer();
    }
}

/**
 * Resets the timer UI to its initial state.
 */
function resetTimerUI() {
    document.getElementById('start-save-timer-btn').textContent = '🔴';
    document.getElementById('start-save-timer-btn').classList.remove('primary');
    document.getElementById('timer-display').textContent = '0m';
    document.getElementById('timer-duration').textContent = '0m';
    document.getElementById('timer-duration').style.display = 'none';
    document.getElementById('open-timer-modal-btn').classList.remove('primary');
    window.choicesTimer.enable();
    document.getElementById('confirmation-message').textContent = '';
    document.getElementById('start-time-timer').value = '';
    document.getElementById('end-time-timer').value = '';
}

/**
 * Formats the duration into a human-readable string.
 * @param {number} duration - The duration in milliseconds.
 * @returns {string} - The formatted duration string.
 */
export function formatDuration(duration) {
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    let formatted = '';
    if (hours > 0) {
        formatted += `${hours}h `;
    }
    if (minutes > 0) {
        formatted += `${minutes}m `;
    }
    if (seconds > 0) {
        formatted += `${seconds}s`;
    }
    return formatted.trim();
}

/**
 * Toggles the visibility of the timer modal.
 */
export function toggleTimerModal() {
    const modal = document.getElementById('timerModal');
    if (modal.style.display === 'none' || modal.style.display === '') {
        showTimerModal();
    } else {
        hideTimerModal();
    }
}

export function showTimerModal() {
    const modal = document.getElementById('timerModal');
    modal.style.display = 'block';
}

export function hideTimerModal() {
    const modal = document.getElementById('timerModal');
    modal.style.display = 'none';
}

/**
 * Updates the timer display.
 */
function updateTimerDisplay() {
    const timerEndTime = new Date();
    applyRoundingUp(timerEndTime);

    const localEndTime = new Date(timerEndTime.getTime() - timerEndTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const duration = timerEndTime - timerStartTime;
    const formattedDuration = formatDuration(duration);

    
    document.getElementById('end-time-timer').value = localEndTime;
    document.getElementById('timer-display').textContent = formattedDuration;
    document.getElementById('timer-duration').textContent = formattedDuration;
}

/**
 * Applies rounding down to the given date based on the rounding interval.
 * @param {Date} date - The date to apply rounding to.
 */
function applyRoundingDown(date) {
    const roundCheckbox = document.getElementById('round-timer-checkbox');
    if (roundCheckbox && roundCheckbox.checked) {
        const intervalMs = window.roundingInterval * 60 * 1000;
        date.setTime(Math.floor(date.getTime() / intervalMs) * intervalMs);
    }
}

/**
 * Applies rounding up to the given date based on the rounding interval.
 * @param {Date} date - The date to apply rounding to.
 */
function applyRoundingUp(date) {
    const roundCheckbox = document.getElementById('round-timer-checkbox');
    if (roundCheckbox && roundCheckbox.checked) {
        const intervalMs = window.roundingInterval * 60 * 1000;
        date.setTime(Math.ceil(date.getTime() / intervalMs) * intervalMs);
    }
}

/**
 * Syncs the rounding interval inputs.
 */
function syncRoundingInterval() {
    const configRoundingIntervalInput = document.getElementById('rounding-interval');
    const timerRoundingIntervalInput = document.getElementById('timer-rounding-interval');
    if (configRoundingIntervalInput) {
        configRoundingIntervalInput.value = window.roundingInterval;
    }
    if (timerRoundingIntervalInput) {
        timerRoundingIntervalInput.value = window.roundingInterval;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const issueTimerSelect = document.getElementById('issue-timer');
    if (issueTimerSelect) {
        issueTimerSelect.addEventListener('change', handleTimerIssueSwitch);
    }

    const configRoundingIntervalInput = document.getElementById('rounding-interval');
    const timerRoundingIntervalInput = document.getElementById('timer-rounding-interval');

    if (configRoundingIntervalInput) {
        configRoundingIntervalInput.value = window.roundingInterval;
        configRoundingIntervalInput.addEventListener('input', (event) => {
            window.roundingInterval = parseInt(event.target.value, 10);
            syncRoundingInterval();
        });
    }

    if (timerRoundingIntervalInput) {
        timerRoundingIntervalInput.value = window.roundingInterval;
        timerRoundingIntervalInput.addEventListener('input', (event) => {
            window.roundingInterval = parseInt(event.target.value, 10);
            syncRoundingInterval();
        });
    }
});

window.toggleTimerModal = toggleTimerModal;
window.toggleStartSaveTimer = toggleStartSaveTimer;
window.handleTimerIssueSwitch = handleTimerIssueSwitch;
window.startTimer = startTimer;
window.stopTimer = stopTimer;
window.cancelTimer = cancelTimer;