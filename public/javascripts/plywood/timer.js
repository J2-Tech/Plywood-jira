import { createWorkLog } from './worklog.js';
import { refreshWorklog } from './calendar.js';
import { showLoading, hideLoading } from './ui.js';

const minSaveMinutes = 5; // Minimum time to save a worklog in minutes
window.roundingInterval = 1;
let timerInterval;
let timerStartTime;
let previousIssueId;
let timerInitialEndTime; // Store the initial end time when timer starts with adjacent worklog

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
async function startTimer() {
    document.getElementById('confirmation-message').textContent = '';
    previousIssueId = document.getElementById('issue-timer').value;
    if (!previousIssueId) {
        document.getElementById('confirmation-message').textContent = 'Please select an issue.';
        return;
    }

    // Check for existing worklog at current time
    const currentTime = new Date();
    const now = currentTime.getTime();
    
    // Try to find a worklog that ends within the rounding interval
    try {
        console.log('Looking for existing worklogs to adjust timer start time...');
        const response = await fetch(`/events?start=${new Date(now - 24 * 60 * 60 * 1000).toISOString()}&end=${new Date(now + 24 * 60 * 60 * 1000).toISOString()}`);
        if (response.ok) {
            const events = await response.json();
            const intervalMs = window.roundingInterval * 60 * 1000;
            console.log(`Found ${events.length} events, rounding interval: ${window.roundingInterval} minutes`);
            
            // Sort events by end time (most recent first)
            const sortedEvents = events.sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime());
            
            // Find the most recent worklog that ends within the rounding interval
            let adjustedStartTime = now;
            let foundAdjacentWorklog = false;
            for (const event of sortedEvents) {
                const eventEnd = new Date(event.end).getTime();
                const timeDiff = now - eventEnd;
                
                const timeDiffMinutes = Math.round(timeDiff / 60000);
                console.log(`Checking event ending at ${new Date(eventEnd).toISOString()}, time diff: ${timeDiffMinutes} minutes`);
                
                // If worklog ended recently (within rounding interval) - look both before and slightly after now
                if (timeDiff >= -intervalMs && timeDiff <= intervalMs) {
                    // Set start time to end of this worklog
                    adjustedStartTime = eventEnd;
                    foundAdjacentWorklog = true;
                    console.log(`Found adjacent worklog, adjusting start time from ${new Date(now)} to ${new Date(adjustedStartTime)}`);
                    break;
                }
            }
            
            if (!foundAdjacentWorklog) {
                console.log('No adjacent worklog found, using current time');
            }
            
            // Apply rounding to the adjusted start time
            timerStartTime = new Date(adjustedStartTime);
            applyRoundingDown(timerStartTime);
            
            // If we found an adjacent worklog (start time was adjusted), set initial end time to start + rounding interval
            if (foundAdjacentWorklog) {
                const initialEndTime = new Date(timerStartTime.getTime() + intervalMs);
                applyRoundingUp(initialEndTime);
                timerInitialEndTime = initialEndTime; // Store for use in updateTimerDisplay
                
                // Set the end time in the UI
                const localEndTime = new Date(initialEndTime.getTime() - initialEndTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                document.getElementById('end-time-timer').value = localEndTime;
            } else {
                timerInitialEndTime = null; // No initial end time if no adjacent worklog
            }
        } else {
            timerStartTime = new Date();
            applyRoundingDown(timerStartTime);
        }
    } catch (error) {
        console.error('Error fetching events for timer:', error);
        // On error, use current time
        timerStartTime = new Date();
        applyRoundingDown(timerStartTime);
    }

    const localStartTime = new Date(timerStartTime.getTime() - timerStartTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('start-time-timer').value = localStartTime;
    
    // Only set initial end time if we didn't already set it for adjacent worklog
    if (!timerInitialEndTime) {
        const intervalMs = window.roundingInterval * 60 * 1000;
        const initialEndTime = new Date(timerStartTime.getTime() + intervalMs);
        const localEndTime = new Date(initialEndTime.getTime() - initialEndTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        document.getElementById('end-time-timer').value = localEndTime;
    }
    timerInterval = setInterval(updateTimerDisplay, 1000);
    document.getElementById('start-save-timer-btn').textContent = '💾';
    document.getElementById('start-save-timer-btn').classList.add('primary');
    document.getElementById('open-timer-modal-btn').classList.add('primary');
}

/**
 * Stops the timer and saves the worklog.
 */
function stopTimer() {
    // Use initial end time if set (from adjacent worklog), otherwise use current time
    let timerEndTime;
    if (timerInitialEndTime) {
        timerEndTime = timerInitialEndTime;
    } else {
        timerEndTime = new Date();
        applyRoundingUp(timerEndTime);
    }

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
            
            // Force a full calendar refresh to ensure the worklog appears
            setTimeout(() => {
                if (window.calendar) {
                    window.calendar.refetchEvents();
                }
            }, 500);
            
            // Don't close the modal - let the user decide when to close it
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
 * Stops the timer and saves the worklog without closing the modal.
 */
function stopTimerWithoutClosingModal() {
    // Use initial end time if set (from adjacent worklog), otherwise use current time
    let timerEndTime;
    if (timerInitialEndTime) {
        timerEndTime = timerInitialEndTime;
    } else {
        timerEndTime = new Date();
        applyRoundingUp(timerEndTime);
    }

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
            
            // Force a full calendar refresh to ensure the worklog appears
            setTimeout(() => {
                if (window.calendar) {
                    window.calendar.refetchEvents();
                }
            }, 500);
            
            // Don't close the modal - let it stay open
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
        // Save the current worklog and restart timer on new issue
        const currentIssueId = previousIssueId;
        const currentComment = document.getElementById('comment-timer').value;
        
        // Stop and save current timer
        stopTimerWithoutClosingModal();
        
        // After a short delay, start timer with new issue
        setTimeout(async () => {
            // Reset the issue dropdown to new value and restart timer
            previousIssueId = document.getElementById('issue-timer').value;
            
            // Clear the comment field
            document.getElementById('comment-timer').value = '';
            
            // Start timer on new issue
            await startTimer();
        }, 100);
    }
}

/**
 * Resets the timer UI to its initial state.
 */
function resetTimerUI() {
    document.getElementById('start-save-timer-btn').textContent = '🔴';
    document.getElementById('start-save-timer-btn').classList.remove('primary');
    document.getElementById('timer-display').textContent = '0m';
    document.getElementById('open-timer-modal-btn').classList.remove('primary');
    window.choicesTimer.enable();
    document.getElementById('confirmation-message').textContent = '';
    document.getElementById('start-time-timer').value = '';
    document.getElementById('end-time-timer').value = '';
    timerInitialEndTime = null; // Reset initial end time
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
    // Mark that a modal with issue selection is open
    document.body.classList.add('modal-with-issue-selection-open');
    
    const modal = document.getElementById('timerModal');
    modal.style.display = 'block';
}

export function hideTimerModal() {
    const modal = document.getElementById('timerModal');
    modal.style.display = 'none';
    
    // Check if any modal with issue selection is still open
    const createModal = document.querySelector('.modal-create');
    const updateModal = document.querySelector('.modal-update');
    
    const isCreateOpen = createModal && createModal.style.display === 'block';
    const isUpdateOpen = updateModal && updateModal.style.display === 'block';
    
    if (!isCreateOpen && !isUpdateOpen) {
        document.body.classList.remove('modal-with-issue-selection-open');
    }
}

/**
 * Updates the timer display.
 */
function updateTimerDisplay() {
    // If we have an initial end time (from adjacent worklog), use it, otherwise calculate from current time
    let timerEndTime;
    if (timerInitialEndTime) {
        // Use the initial end time we set when starting the timer
        timerEndTime = timerInitialEndTime;
    } else {
        // Normal case: use current time
        timerEndTime = new Date();
        applyRoundingUp(timerEndTime);
    }

    const localEndTime = new Date(timerEndTime.getTime() - timerEndTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const duration = timerEndTime - timerStartTime;
    const formattedDuration = formatDuration(duration);

    
    document.getElementById('end-time-timer').value = localEndTime;
    document.getElementById('timer-display').textContent = formattedDuration;
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