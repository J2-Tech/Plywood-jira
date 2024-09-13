import { createWorkLog } from './worklog.js';
import { refreshEverything } from './calendar.js';


const minSaveMinutes = 5; // Minimum time to save a worklog in minutes
let canSwitchIssue = true;
let timerInterval;
let timerStartTime;
let roundingInterval = 15; // Default rounding interval in minutes
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
export function startTimer() {
    
    previousIssueId = document.getElementById('issue-timer').value; // Capture the current issue ID
    
    if (previousIssueId === '') {
        document.getElementById('confirmation-message').textContent = 'Please select an issue.';
        return;
    }

    timerStartTime = new Date();
    document.getElementById('start-save-timer-btn').textContent = '💾';
    document.getElementById('start-save-timer-btn').className = 'primary';
    document.getElementById('confirmation-message').textContent = ''; // Clear confirmation message
    document.getElementById('open-timer-modal-btn').classList.add('primary');
    document.getElementById('timer-duration').style.display = 'inline-block'; // Show the timer duration

    if (window.saveTimerOnIssueSwitch) {
        canSwitchIssue = false;
        window.choicesTimer.disable();
    }

    timerInterval = setInterval(() => {
        const now = new Date();
        const duration = now - timerStartTime;
        document.getElementById('timer-display').textContent = formatDuration(duration);
        document.getElementById('timer-duration').textContent = formatDuration(duration);
        if (window.saveTimerOnIssueSwitch && !canSwitchIssue) {
            if (duration > minSaveMinutes * 60 * 1000) {
                canSwitchIssue = true;
                window.choicesTimer.enable();
            }
        } 
    }, 1000);
}


/**
 * Stops the timer and saves the worklog.
 */
export function stopTimer() {
    const timerEndTime = new Date();
    let duration = timerEndTime - timerStartTime;

    // Rounding logic
    const roundCheckbox = document.getElementById('round-timer-checkbox');
    if (roundCheckbox && roundCheckbox.checked) {
        const intervalMs = roundingInterval * 60 * 1000;
        const startRounded = Math.floor(timerStartTime.getTime() / intervalMs) * intervalMs;
        const endRounded = Math.ceil(timerEndTime.getTime() / intervalMs) * intervalMs;
        timerStartTime = new Date(startRounded);
        duration = endRounded - startRounded;
    }

    if (duration < minSaveMinutes * 60 * 1000) { // Less than minSaveMinutes
        document.getElementById('confirmation-message').textContent = 'The minimum time for a worklog is 5 minutes.';
        return;
    }

    clearInterval(timerInterval);
    const issueId = previousIssueId || document.getElementById('issue-timer').value; // Use the previous issue ID
    const comment = document.getElementById('comment-timer').value;

    const workLogData = {
        start: timerStartTime.toISOString(),
        duration: duration / 1000,
        issueId: issueId,
        comment: comment,
    };

    createWorkLog(workLogData).then(response => {
        if (response.errors) {
            document.getElementById('confirmation-message').textContent = 'Error creating worklog: ' + response.errors.join(', ');
        } else {
            document.getElementById('confirmation-message').textContent = 'Worklog created successfully!';
            refreshEverything();
        }
    }).catch(error => {
        document.getElementById('confirmation-message').textContent = 'Error creating worklog: ' + error.message;
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
    document.getElementById('start-save-timer-btn').className = '';
    document.getElementById('timer-display').textContent = '0m';
    document.getElementById('timer-duration').textContent = '0m';
    document.getElementById('timer-duration').style.display = 'none'; // Hide the timer duration
    document.getElementById('open-timer-modal-btn').classList.remove('primary');
    window.choicesTimer.enable(); // Re-enable the issue dropdown
    document.getElementById('confirmation-message').textContent = ''; // Clear confirmation message
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
        modal.style.display = 'block';
    } else {
        modal.style.display = 'none';
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const issueSelect = document.getElementById('issue-timer');
    issueSelect.addEventListener('change', handleTimerIssueSwitch);
});

window.toggleTimerModal = toggleTimerModal;
window.toggleStartSaveTimer = toggleStartSaveTimer;
window.handleTimerIssueSwitch = handleTimerIssueSwitch;
window.startTimer = startTimer;
window.stopTimer = stopTimer;
window.cancelTimer = cancelTimer;

