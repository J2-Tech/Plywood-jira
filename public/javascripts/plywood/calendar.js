import { showLoading, hideLoading, getCurrentProject } from './ui.js';
import { showUpdateModal, showCreateModal } from './modal.js';

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
 * @param {string} worklogId - The ID of the worklog to refresh.
 */
export function refreshWorklog(issueId, worklogId) {
    showLoading();
    let event = window.calendar.getEventById(worklogId);
    fetch(`/events/${worklogId}?issueId=${issueId}`)
        .then(response => response.json())
        .then(data => {
            if (!event) {
                event = window.calendar.addEvent(data, true);
                window.calendar.unselect(); // Unselect the selected time range
            }
            // merge the original event with data
            event.setProp('start', data.start);
            event.setProp('end', data.end);
            event.setExtendedProp('comment', data.comment);
            event.setExtendedProp('issueKey', data.issueKey);
            event.setExtendedProp('issueSummary', data.issueSummary);
            event.setExtendedProp('issueId', data.issueId);
            event.setExtendedProp('worklogId', data.id);
            event.setExtendedProp('issueType', data.issueType);
            event.setExtendedProp('issueTypeIcon', data.issueTypeIcon);
            event.setProp('color', data.color);
            event.setProp('title', data.title);
            event.setProp('textColor', data.textColor);
            updateTotalTime();
            hideLoading();
        })
        .catch(error => {
            console.error('Error refreshing worklog:', error);
        });
}

/**
 * Initialize the calendar.
 */
export function initializeCalendar() {
    var calendarElement = document.getElementById("calendar");
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
                    project: getCurrentProject()
                };
            },
            failure: function (error) {
                if (error && error.response && error.response.headers && error.response.headers.location && error.response.headers.location == "/auth/login") {
                    window.location.href = "/auth/login";
                } else if (error && error.message && error.message == "NetworkError when attempting to fetch resource.") {
                    window.location.href = "/auth/login";
                } else {
                    alert("there was an error while fetching events!");
                }
                hideLoading();
            },
            success: function (events) {
                hideLoading();
                updateTotalTime(events);
            },
        },
        eventContent: function(arg) {
            return {html:arg.event.title};
        },
        datesSet: function (info) {
            //updateTotalTime();
        },
        eventResize: function (info) {
            showLoading();
            fetch("/worklog/" + info.event.extendedProps.worklogId, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    issueId: info.event.extendedProps.issueId,
                    startTime: new Date(info.event.start).toISOString(),
                    endTime: new Date(info.event.end).toISOString(),
                    comment: info.event.extendedProps.comment // Ensure comment is included
                }),
            })
            .then(function (response) {
                hideLoading();
                refreshWorklog(info.event.extendedProps.issueId, info.event.extendedProps.worklogId); // Refresh only the resized worklog
            })
            .catch((error) => {
                if (error && error.message && error.message == "NetworkError when attempting to fetch resource.") {
                    window.location.href = "/auth/login";
                }
                info.revert();
                hideLoading();
            });
        },
        eventDrop: function (info) {
            showLoading();
            fetch("/worklog/" + info.event.extendedProps.worklogId, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    issueId: info.event.extendedProps.issueId,
                    startTime: new Date(info.event.start).toISOString(),
                    endTime: new Date(info.event.end).toISOString(),
                    comment: info.event.extendedProps.comment // Ensure comment is included
                }),
            })
            .then(function (response) {
                hideLoading();
                refreshWorklog(info.event.extendedProps.issueId, info.event.extendedProps.worklogId); // Refresh only the dropped worklog
            })
            .catch((error) => {
                if (error && error.message && error.message == "NetworkError when attempting to fetch resource.") {
                    window.location.href = "/auth/login";
                }
                info.revert();
                hideLoading();
            });
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

window.initializeCalendar = initializeCalendar;
