import { showLoading, hideLoading, getCurrentProject } from './ui.js';
import { showUpdateModal, showCreateModal } from './modal.js';
import { optimisticallyUpdateEvent, rollbackOptimisticUpdate, confirmOptimisticUpdate, preserveEventData } from './optimisticUpdates.js';
import { getContrastingTextColor } from './colorUtils.js';
import { apiClient } from './apiClient.js';

window.calendar = null;

/**
 * Refresh calendar events.
 */
export function refreshEverything() {
    window.calendar.refetchEvents();
}

/**
 * Update total time displayed.
 * @param {Array} events - The calendar events.
 */
export function updateTotalTime(events) {
    let currentEvents = events || window.calendar.getEvents();
    let startRange = window.calendar.view.activeStart;
    let endRange = window.calendar.view.activeEnd;
    var visibleEvents = currentEvents.filter((event) => {
        const s = startRange,
            e = endRange;
        if ( new Date(event.start) > e || new Date(event.end) < s) return false;
        return true;
    });
    let totalTime = 0;

    visibleEvents.forEach((event) => {
        const start = new Date(event.start);
        const end = new Date(event.end);
        const duration = end - start;
        totalTime += duration;
    });

    const timeElement = document.getElementById("total-time-value");
    const duration = moment.duration(totalTime, 'milliseconds');
    const hours = Math.floor(duration.asHours());
    const minutes = duration.minutes();
    timeElement.innerHTML = `${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

/**
 * Refresh a single worklog by ID.
 * @param {string} issueId - The issue ID
 * @param {string} worklogId - The ID of the worklog to refresh.
 */
export function refreshWorklog(issueId, worklogId) {
    showLoading();
    
    // Check if event already exists to prevent duplicates
    let existingEvent = window.calendar.getEventById(worklogId);
    
    apiClient.get(`/events/${worklogId}?issueId=${issueId}&_nocache=${Date.now()}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            
            if (!existingEvent) {
                // Create new event if it doesn't exist
                existingEvent = window.calendar.addEvent(data, true);
                window.calendar.unselect();
            } else {
                // Update existing event with complete data
                existingEvent.setProp('start', data.start);
                existingEvent.setProp('end', data.end);
                existingEvent.setProp('backgroundColor', data.backgroundColor);
                existingEvent.setProp('borderColor', data.borderColor || data.backgroundColor);
                existingEvent.setProp('textColor', data.textColor);
                existingEvent.setProp('title', data.title);
                
                // Set extended properties from data.extendedProps
                if (data.extendedProps) {
                    Object.keys(data.extendedProps).forEach(key => {
                        existingEvent.setExtendedProp(key, data.extendedProps[key]);
                    });
                } else {
                    // Fallback: set properties directly from data
                    existingEvent.setExtendedProp('worklogId', data.id || worklogId);
                    existingEvent.setExtendedProp('issueId', data.issueId || issueId);
                    existingEvent.setExtendedProp('issueKey', data.issueKey);
                    existingEvent.setExtendedProp('issueSummary', data.issueSummary);
                    existingEvent.setExtendedProp('comment', data.comment);
                    existingEvent.setExtendedProp('author', data.author);
                    existingEvent.setExtendedProp('timeSpent', data.timeSpent);
                    existingEvent.setExtendedProp('timeSpentSeconds', data.timeSpentSeconds);
                    existingEvent.setExtendedProp('issueColor', data.backgroundColor);
                    existingEvent.setExtendedProp('issueType', data.issueType);
                    existingEvent.setExtendedProp('issueStatus', data.issueStatus);
                }
            }
            
            updateTotalTime();
            hideLoading();
        })
        .catch(error => {
            hideLoading();
            // If refresh fails, do a full calendar refresh as fallback
            window.calendar.refetchEvents();
        });
}

/**
 * Initialize the calendar.
 */
export function initializeCalendar() {
    var calendarElement = document.getElementById("calendar");
    
    // Check if we need to force a fresh load because of a color change
    const forceRefresh = sessionStorage.getItem('forceWorklogRefresh') === 'true';
    if (forceRefresh) {
        // Clear the flag
        sessionStorage.removeItem('forceWorklogRefresh');
        // Force clear server caches through a special endpoint
        fetch('/config/refreshColors?_t=' + Date.now(), {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        }).catch(() => {}); // Ignore errors
    }
    
    const theme = document.body.classList.contains('dark-theme') ? 'bootstrap' : 'standard';
    window.calendar = new FullCalendar.Calendar(calendarElement, {
        initialView: "timeGridWeek",
        nowIndicator: true,
        themeSystem: theme,
        customButtons: {
            refreshBtn: {
                text: "🔄",
                hint: "Refresh work logs",
                click: function () {
                    window.calendar.refetchEvents();
                },
            },
        },
        height: "calc(100vh - 60px)",
        eventColor: "#2a75fe",
        allDaySlot: false,
        weekends: document.getElementById("include-weekends").checked,
        headerToolbar: {
            left: "prev,today,next",
            center: "title",
            right: "refreshBtn,dayGridMonth,timeGridWeek,timeGridDay",
        },
        slotDuration: "00:15:00",
        slotLabelInterval: "01:00:00",
        selectable: true,
        selectMirror: true,
        businessHours: {
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: "08:00",
            endTime: "17:00",
        },
        scrollTime: "08:00",
        loading: function (bool) {
            if (bool) {
                showLoading();
            } else {
                hideLoading();
            }
        },
        events: {
            url: "/events",
            method: "GET",
            extraParams: function() {
                return {
                    project: getCurrentProject(),
                    _nocache: Date.now() // Add cache-busting parameter
                };
            },
            // Prevent caching of event data and apply contrasting text colors
            eventDataTransform: function(event) {
                // Make sure the event has the correct color
                if (event.backgroundColor) {
                    event.borderColor = event.backgroundColor;
                    
                    // Calculate contrasting text color
                    const textColor = getContrastingTextColor(event.backgroundColor);
                    event.textColor = textColor;
                    
                    // Store the calculated text color in extended props for later use
                    if (!event.extendedProps) {
                        event.extendedProps = {};
                    }
                    event.extendedProps.calculatedTextColor = textColor;
                    
                }
                return event;
            },
            failure: function (error) {
                
                // Enhanced authentication error detection
                const isAuthError = 
                    (error && error.response && error.response.status === 401) || 
                    (error && error.response && error.response.headers && error.response.headers.location && error.response.headers.location.includes("login")) ||
                    (error && error.message && (
                        error.message.includes("Authentication required") || 
                        error.message.includes("NetworkError") ||
                        error.message.includes("unauthorized") ||
                        error.message.includes("Unauthorized") ||
                        error.message.includes("401")
                    )) ||
                    (error && error.status === 401) ||
                    (error && error.authFailure);
                
                if (isAuthError) {
                    
                    // Try to refresh token via a separate request
                    fetch("/auth/refresh-token")
                        .then(response => {
                            if (response.ok) {
                                // Show success message and retry
                                if (typeof showNotification === 'function') {
                                    showNotification('Session refreshed. Reloading calendar...', 'info');
                                }
                                setTimeout(() => {
                                    window.calendar.refetchEvents(); // Retry loading events
                                }, 1000);
                            } else {
                                if (typeof showNotification === 'function') {
                                    showNotification('Session expired. Redirecting to login...', 'warning');
                                }
                                setTimeout(() => {
                                    window.location.href = "/auth/login";
                                }, 2000);
                            }
                        })
                        .catch(refreshError => {
                            if (typeof showNotification === 'function') {
                                showNotification('Session expired. Please log in again.', 'warning');
                            }
                            setTimeout(() => {
                                window.location.href = "/auth/login";
                            }, 2000);
                        });
                } else {
                    alert("There was an error while fetching events. Please refresh the page and try again.");
                    setTimeout(() => {
                        window.location.href = "/auth/login";
                    }, 2000);
                }
                hideLoading();
            },
            success: function (events) {
                hideLoading();
                updateTotalTime(events);
            },
        },
        eventContent: function(arg) {
            const event = arg.event;
            const props = event.extendedProps;
            
            // Check if issue type icons should be shown
            const showIssueTypeIcons = window.showIssueTypeIcons !== false && props.showIssueTypeIcons !== false;
            
            // Get the contrasting text color
            const textColor = props.calculatedTextColor || event.textColor || getContrastingTextColor(event.backgroundColor || '#2a75fe');
            
            // Create the main container
            const container = document.createElement('div');
            container.className = 'fc-event-content-container';
            container.style.color = textColor; // Apply the contrasting text color
            
            // Create header with issue key and icon
            const header = document.createElement('div');
            header.className = 'fc-event-header';
            header.style.color = textColor; // Apply text color to header
            
            // Add issue type icon if available and enabled
            if (showIssueTypeIcons && props.issueTypeIcon) {
                const icon = document.createElement('img');
                icon.src = props.issueTypeIcon;
                icon.className = 'fc-event-issue-icon';
                icon.alt = props.issueType || 'Issue type';
                icon.title = props.issueType || 'Issue type';
                
                // Handle icon load errors
                icon.onerror = function() {
                    this.style.display = 'none';
                };
                
                header.appendChild(icon);
            }
            
            // Add issue key
            const issueKey = document.createElement('span');
            issueKey.className = 'fc-event-issue-key';
            issueKey.textContent = props.issueKey || '';
            issueKey.style.color = textColor; // Ensure text color is applied
            header.appendChild(issueKey);
            
            container.appendChild(header);
            
            // Add issue summary - inline for month view, as separate div for other views
            if (props.issueSummary && props.issueSummary !== event.title) {
                const summary = document.createElement('span');
                summary.className = 'fc-event-summary';
                summary.textContent = props.issueSummary;
                summary.style.color = textColor; // Apply contrasting text color
                
                // Check if we're in month view
                const currentView = window.calendar?.view?.type;
                if (currentView === 'dayGridMonth') {
                    // For month view, add inline to header
                    header.appendChild(summary);
                } else {
                    // For other views, add as separate element after header
                    container.appendChild(summary);
                }
            }
            
            // Add comment if available
            if (props.comment && typeof props.comment === 'string' && props.comment.trim()) {
                const comment = document.createElement('div');
                comment.className = 'fc-event-comment';
                comment.textContent = props.comment;
                comment.style.color = textColor; // Apply contrasting text color
                container.appendChild(comment);
            }
            
            return { domNodes: [container] };
        },
        datesSet: function (info) {
            // Refresh events when calendar view changes
            window.calendar.refetchEvents();
        },
        editable: true, // Enable drag-and-drop and resizing
        eventResizableFromStart: false, // Only allow resize from end
        eventResize: function (info) {
            handleEventResize(info);
        },
        eventDrop: function (info) {
            handleEventDrop(info);
        },
        eventClick: function (info) {
            showUpdateModal(info.event);
        },
        eventDidMount: function (info) {
            var title = (info.event.extendedProps.issueKey || "") + " " + (info.event.extendedProps.issueSummary || "");
            if (title != " ") {
                tippy(info.el, {
                    content: title,
                    placement: "top",
                    arrow: true,
                    allowHTML: true,
                    container: "body",
                });
            }
    
            info.el.addEventListener('contextmenu', function(event) {
                event.preventDefault(); // Prevent the default context menu from appearing
                showColorPicker(info.event, event);
            });
        },
        unselectCancel: ".unselectable, .choices__item, color-picker",
        select: function (info) {
            showCreateModal(info.start, info.end);
        },
    });
    window.calendar.render();
}

/**
 * Force a complete refresh of all calendar events
 * This is useful when color changes or other updates need to be reflected immediately
 */
export function forceRefreshAllEvents() {
    if (!window.calendar) return;
    
    
    // First refresh the issue colors from the server to ensure they're all up-to-date
    if (window.refreshIssueColors) {
        window.refreshIssueColors().catch(err => {
            // Continue with refresh anyway
        });
    }
    
    // Clear any client-side caches
    const colorCacheKeys = Object.keys(localStorage).filter(key => key.includes('color') || key.includes('issue'));
    colorCacheKeys.forEach(key => localStorage.removeItem(key));
    
    // Safely flush any browser caches, handling errors gracefully
    
    // Skip the HEAD request that was causing errors - it's not necessary
    // since we're going to do a full refetch anyway
    
    // Clear any FullCalendar internal caches
    if (window.calendar._eventSources && window.calendar._eventSources.length > 0) {
        window.calendar._eventSources.forEach(source => {
            if (source.refetch) {
                // Add cache busting parameter
                if (source.extraParams) {
                    const originalParams = source.extraParams;
                    source.extraParams = () => {
                        const params = typeof originalParams === 'function' 
                            ? originalParams() 
                            : originalParams || {};
                        params._nocache = Date.now();
                        return params;
                    };
                }
            }
        });
    }
    
    // Force a complete refetch of all events from the server with cache busting
    setTimeout(() => {
        window.calendar.refetchEvents();
        
        // Update the total time
        if (typeof window.updateTotalTime === 'function') {
            window.updateTotalTime();
        }
        
        // Force redraw
        window.calendar.updateSize();
        
    }, 100);
}

/**
 * Force refresh issue colors from the server
 * This ensures the server cache is cleared and all colors are up-to-date
 * @returns {Promise} Promise that resolves when colors are refreshed
 */
export function refreshIssueColors() {
    
    return apiClient.get(`/config/refreshColors?_t=${Date.now()}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to refresh issue colors');
            }
            return response.json();
        })
        .then(data => {
            return data;
        })
        .catch(error => {
            throw error;
        });
}

// Make this function available globally
window.refreshIssueColors = refreshIssueColors;

// Expose the function to the window object
window.forceRefreshAllEvents = forceRefreshAllEvents;

// Expose functions to window object
window.initializeCalendar = initializeCalendar;
window.updateTotalTime = updateTotalTime;

/**
 * Handle event resize
 * @param {Object} info - FullCalendar resize info
 */
export function handleEventResize(info) {
    
    const event = info.event;
    
    // Preserve all event data before making changes
    preserveEventData(event);
    
    // Calculate contrasting text color for the current background color
    const backgroundColor = event.backgroundColor || event.extendedProps.issueColor || '#2a75fe';
    const textColor = getContrastingTextColor(backgroundColor);
    
    // Prepare update data
    const updateData = {
        worklogId: event.extendedProps.worklogId,
        issueId: event.extendedProps.issueId,
        startTime: event.start.toISOString(),
        endTime: event.end.toISOString(),
        comment: (event.extendedProps.comment && typeof event.extendedProps.comment === 'string') ? event.extendedProps.comment : '',
        issueKeyColor: backgroundColor
    };
    
    
    // Apply optimistic update with proper text color
    const rollbackData = optimisticallyUpdateEvent(event, {
        start: event.start,
        end: event.end,
        backgroundColor: backgroundColor,
        textColor: textColor
    });
    
    // Show loading indicator
    showLoading();
    
    // Send update to server using API client
    apiClient.put(`/worklog/${updateData.worklogId}`, updateData)
        .then(function (response) {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            
            // Confirm optimistic update
            confirmOptimisticUpdate(event.id);
            
            // Ensure event data is preserved and correct with proper text color
            preserveEventData(event, {
                worklogId: data.worklogId || updateData.worklogId,
                issueId: data.issueId || updateData.issueId,
                comment: data.comment || updateData.comment,
                issueColor: data.issueKeyColor || updateData.issueKeyColor,
                calculatedTextColor: textColor
            });
            
            // Update visual properties to ensure consistency
            event.setProp('backgroundColor', backgroundColor);
            event.setProp('borderColor', backgroundColor);
            event.setProp('textColor', textColor);
            
            // Update total time without refreshing individual worklog
            updateTotalTime();
            
            hideLoading();
        })
        .catch((error) => {
            
            // Rollback the optimistic update
            rollbackOptimisticUpdate(event.id);
            
            // Revert the event size
            info.revert();
            hideLoading();
        });
}

/**
 * Handle event drop (drag and drop)
 * @param {Object} info - FullCalendar drop info
 */
export function handleEventDrop(info) {
    
    const event = info.event;
    
    // Preserve all event data before making changes
    preserveEventData(event);
    
    // Calculate contrasting text color for the current background color
    const backgroundColor = event.backgroundColor || event.extendedProps.issueColor || '#2a75fe';
    const textColor = getContrastingTextColor(backgroundColor);
    
    // Prepare update data
    const updateData = {
        worklogId: event.extendedProps.worklogId,
        issueId: event.extendedProps.issueId,
        startTime: event.start.toISOString(),
        endTime: event.end.toISOString(),
        comment: (event.extendedProps.comment && typeof event.extendedProps.comment === 'string') ? event.extendedProps.comment : '',
        issueKeyColor: backgroundColor
    };
    
    
    // Apply optimistic update with proper text color
    const rollbackData = optimisticallyUpdateEvent(event, {
        start: event.start,
        end: event.end,
        backgroundColor: backgroundColor,
        textColor: textColor
    });
    
    // Show loading indicator
    showLoading();
    
    // Send update to server using API client
    apiClient.put(`/worklog/${updateData.worklogId}`, updateData)
        .then(function (response) {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            
            // Confirm optimistic update
            confirmOptimisticUpdate(event.id);
            
            // Ensure event data is preserved and correct with proper text color
            preserveEventData(event, {
                worklogId: data.worklogId || updateData.worklogId,
                issueId: data.issueId || updateData.issueId,
                comment: data.comment || updateData.comment,
                issueColor: data.issueKeyColor || updateData.issueKeyColor,
                calculatedTextColor: textColor
            });
            
            // Update visual properties to ensure consistency
            event.setProp('backgroundColor', backgroundColor);
            event.setProp('borderColor', backgroundColor);
            event.setProp('textColor', textColor);
            
            // Update total time without refreshing individual worklog
            updateTotalTime();
            
            hideLoading();
        })
        .catch((error) => {
            
            // Rollback the optimistic update
            rollbackOptimisticUpdate(event.id);
            
            // Revert the event position
            info.revert();
            hideLoading();
        });
}

/**
 * Handle successful worklog update from modal form
 * This is called when a worklog is updated via the update modal
 * @param {Object} updatedData - The updated worklog data from server
 * @param {string} worklogId - The worklog ID that was updated
 */
export function handleModalWorklogUpdate(updatedData, worklogId) {
    
    // Simply refresh all calendar events instead of trying to update individual ones
    if (window.calendar) {
        window.calendar.refetchEvents();
    }
    
    // Hide the update modal
    const updateModal = document.querySelector('.modal-update');
    if (updateModal) {
        updateModal.style.display = 'none';
    }
}

// Make functions globally available (remove duplicates)
window.handleEventDrop = handleEventDrop;
window.handleEventResize = handleEventResize;
window.refreshEverything = refreshEverything;
window.refreshWorklog = refreshWorklog;
window.refreshIssueColors = refreshIssueColors;
window.forceRefreshAllEvents = forceRefreshAllEvents;
window.initializeCalendar = initializeCalendar;
window.updateTotalTime = updateTotalTime;

// Make the function available globally
window.handleModalWorklogUpdate = handleModalWorklogUpdate;
