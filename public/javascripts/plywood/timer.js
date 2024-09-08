import { createWorkLog } from './worklog.js';
import { refreshEverything } from './calendar.js';


let timerInterval;
let timerStartTime;
let isPaused = false;
let pausedDuration = 0;
let pauseStartTime;

/**
 * Toggles between starting, pausing, and resuming the timer.
 */
export function toggleStartPauseResumeTimer() {
    const button = document.getElementById('start-pause-resume-timer-btn');
    if (button.textContent === 'Start') {
        startTimer();
    } else if (button.textContent === '⏸️') {
        pauseTimer();
    } else if (button.textContent === '▶️') {
        resumeTimer();
    }
}

/**
 * Pauses the timer.
 */
export function pauseTimer() {
    clearInterval(timerInterval);
    pauseStartTime = new Date();
    isPaused = true;
    document.getElementById('start-pause-resume-timer-btn').textContent = '▶️';
    document.getElementById('start-pause-resume-timer-btn').className = '';
    document.getElementById('open-timer-modal-btn').classList.remove('primary');
}

/**
 * Resumes the timer.
 */
export function resumeTimer() {
    const now = new Date();
    pausedDuration += now - pauseStartTime;
    isPaused = false;
    document.getElementById('start-pause-resume-timer-btn').textContent = '⏸️';
    document.getElementById('start-pause-resume-timer-btn').className = 'primary';
    document.getElementById('open-timer-modal-btn').classList.add('primary');

    timerInterval = setInterval(() => {
        const now = new Date();
        const duration = now - timerStartTime - pausedDuration;
        document.getElementById('timer-display').textContent = formatDuration(duration);
        document.getElementById('timer-duration').textContent = formatDuration(duration);
    }, 1000);
}

/**
 * Starts the timer.
 */
export function startTimer() {
    timerStartTime = new Date();
    pausedDuration = 0;
    isPaused = false;
    document.getElementById('start-pause-resume-timer-btn').textContent = '⏸️';
    document.getElementById('start-pause-resume-timer-btn').className = 'primary';
    document.getElementById('stop-timer-btn').disabled = false;
    document.getElementById('confirmation-message').textContent = ''; // Clear confirmation message
    document.getElementById('open-timer-modal-btn').classList.add('primary');
    document.getElementById('timer-duration').style.display = 'inline-block'; // Show the timer duration

    timerInterval = setInterval(() => {
        const now = new Date();
        const duration = now - timerStartTime - pausedDuration;
        document.getElementById('timer-display').textContent = formatDuration(duration);
        document.getElementById('timer-duration').textContent = formatDuration(duration);
    }, 1000);
}

/**
 * Stops the timer.
 */
export function stopTimer() {
    const timerEndTime = new Date();
    const duration = timerEndTime - timerStartTime - pausedDuration;

    if (duration < 5 * 60 * 1000) { // Less than 5 minutes
        document.getElementById('confirmation-message').textContent = 'The minimum time for a worklog is 5 minutes.';
        return;
    }

    clearInterval(timerInterval);
    const issueId = document.getElementById('issue-timer').value;
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

    document.getElementById('start-pause-resume-timer-btn').textContent = 'Start';
    document.getElementById('start-pause-resume-timer-btn').className = 'success';
    document.getElementById('stop-timer-btn').disabled = true;
    document.getElementById('timer-display').textContent = '0m';
    document.getElementById('timer-duration').textContent = '0m';
    document.getElementById('timer-duration').style.display = 'none'; // Hide the timer duration
    document.getElementById('open-timer-modal-btn').classList.remove('primary');
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

window.toggleTimerModal = toggleTimerModal;
window.toggleStartPauseResumeTimer = toggleStartPauseResumeTimer;
window.stopTimer = stopTimer;
window.startTimer = startTimer;
window.pauseTimer = pauseTimer;
window.resumeTimer = resumeTimer;

