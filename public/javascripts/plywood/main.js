// main.js

import { initializeUI, initializeDropdown, applyTheme } from './ui.js';
import { initializeCalendar } from './calendar.js';
import { loadConfig } from './config.js';
import { toggleTimerModal } from './timer.js';

document.addEventListener("DOMContentLoaded", function () {
    initializeUI();
    initializeDropdown();
    initializeCalendar();
    loadConfig();
});