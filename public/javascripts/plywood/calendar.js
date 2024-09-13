import { showLoading, hideLoading } from './ui.js';
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
    var totalTime = 0;

    events.forEach((event) => {
        var duration = new Date(event.end) - new Date(event.start);
        totalTime = totalTime + duration;
    });

    var timeElement = document.getElementById("total-time-value");
    timeElement.innerHTML = moment.duration(totalTime).format("H [hour and] m [min]");
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
            var visibleEvents = window.calendar.getEvents().filter((event) => {
                const s = info.start,
                    e = info.end;
                if (event.start > e || event.end < s) return false;
                return true;
            });
            updateTotalTime(visibleEvents);
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
                    start: info.event.start,
                    duration: (info.event.end - info.event.start) / 1000,
                    comment: info.event.extendedProps.comment // Ensure comment is included
                }),
            })
                .then(function (response) {
                    hideLoading();
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
                    start: info.event.start,
                    duration: (info.event.end - info.event.start) / 1000,
                    comment: info.event.extendedProps.comment // Ensure comment is included
                }),
            })
                .then(function (response) {
                    hideLoading();
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
            
        },
        unselectCancel: ".unselectable, .choices__item",
        select: function (info) {
            showCreateModal(info.start, info.end);
        },
    });
    window.calendar.render();
}

window.initializeCalendar = initializeCalendar;
