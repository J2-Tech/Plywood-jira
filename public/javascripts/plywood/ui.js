import { refreshEverything } from "./calendar.js";

/**
 * Show loading spinner.
 */
export function showLoading() {
    document.getElementById("loading").style.display = "block";
    document.body.classList.add("loading"); // Add this line
}

/**
 * Hide loading spinner.
 */
export function hideLoading() {
    document.getElementById("loading").style.display = "none";
    document.body.classList.remove("loading"); // Add this line
}

/**
 * Initialize other UI elements.
 */
export function initializeUI() {
    var slider = document.getElementById("zoom-range");
    slider.oninput = function () {
        var timeVal = this.value;

        if (timeVal < 10) {
            timeVal = "0" + timeVal;
        }

        var zoomLabel = document.getElementById("zoom-output");
        switch (this.value) {
            case "1":
                calendar.setOption("slotDuration", "00:30:00");
                zoomLabel.innerHTML = "30 minutes / slot";
                break;
            case "2":
                calendar.setOption("slotDuration", "00:15:00");
                zoomLabel.innerHTML = "15 minutes / slot";
                break;
            case "3":
                calendar.setOption("slotDuration", "00:10:00");
                zoomLabel.innerHTML = "10 minutes / slot";
                break;
            case "4":
                calendar.setOption("slotDuration", "00:05:00");
                zoomLabel.innerHTML = "5 minutes / slot";
                break;
        }
    };

    var weekendInput = document.getElementById("include-weekends");
    weekendInput.addEventListener("change", () => {
        calendar.setOption("weekends", weekendInput.checked);
        refreshEverything();
    });

    hideLoading();
}

/**
 * Initialize dropdowns.
 */
export function initializeDropdown() {
    const createIssueSelect = document.getElementById('issue-create');
    const choicesCreate = new Choices(createIssueSelect, {
        searchEnabled: true,
        searchFields: ['key', 'label'],
        itemSelectText: '',
        searchFloor: 3,
        shouldSort: true,
        shouldSortItems: true,
    });

    const fetchCreateOptions = searchDebounce((searchTerm) => {
        searchIssues(searchTerm)
            .then(options => {
                choicesCreate.setChoices(options, 'value', 'label', true);
            });
    }, 300);

    createIssueSelect.addEventListener('search', (event) => {
        fetchCreateOptions(event.detail.value);
    });

    const timerIssueSelect = document.getElementById('issue-timer');
    const choicesTimer = new Choices(timerIssueSelect, {
        searchEnabled: true,
        searchFields: ['key', 'label'],
        itemSelectText: '',
        searchFloor: 3,
        shouldSort: true,
        shouldSortItems: true,
    });

    const fetchTimerOptions = searchDebounce((searchTerm) => {
        searchIssues(searchTerm)
            .then(options => {
                choicesTimer.setChoices(options, 'value', 'label', true);
            });
    }, 300);

    timerIssueSelect.addEventListener('search', (event) => {
        fetchTimerOptions(event.detail.value);
    });
}

/**
 * Debounce function for search.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The debounce delay in milliseconds.
 * @returns {Function} - The debounced function.
 */
function searchDebounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Search issues.
 * @param {string} query - The search query.
 * @returns {Promise<Array>} - The search results.
 */
function searchIssues(query) {
    const startDate = encodeURIComponent(new Date(calendar.view.activeStart).toISOString());
    const endDate = encodeURIComponent(new Date(calendar.view.activeEnd).toISOString());

    showLoading();
    return fetch(`/issues/user?start=${startDate}&end=${endDate}&query=${query}`)
        .then((res) => res.json())
        .then((data) => {
            const options = data.map((issue) => ({
                value: issue.id,
                label: `${issue.key} - ${issue.summary}`,
                key: issue.key,
            }));
            hideLoading();
            return options;
        })
        .catch((error) => {
            handleError(error);
            hideLoading();
        });
}

export function applyTheme(theme) {
    const body = document.body;
    body.classList.remove('light-theme', 'dark-theme');

    if (theme === 'auto') {
        const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
        theme = prefersDarkScheme.matches ? 'dark' : 'light';

        // Listen for changes in the system theme
        prefersDarkScheme.addEventListener('change', (e) => {
            const newTheme = e.matches ? 'dark' : 'light';
            body.classList.remove('light-theme', 'dark-theme');
            body.classList.add(`${newTheme}-theme`);
        });
    }

    body.classList.add(`${theme}-theme`);
}

window.applyTheme = applyTheme;
window.initializeUI = initializeUI;
window.initializeDropdown = initializeDropdown;
window.searchIssues = searchIssues;
