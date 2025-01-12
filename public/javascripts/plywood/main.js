// main.js

import { initializeUI, initializeDropdown, applyTheme } from './ui.js';
import { initializeCalendar } from './calendar.js';
import { loadConfig, initializeProjectSelectors } from './config.js';
import { toggleTimerModal } from './timer.js';

document.addEventListener("DOMContentLoaded", async function () {
    await initializeProjectSelectors();
    await initializeUI();
    initializeDropdown();
    initializeCalendar();
    loadConfig();
});