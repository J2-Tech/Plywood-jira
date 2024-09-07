import { hideModal } from './modal.js';
import { applyTheme } from './ui.js';
/**
 * Save configuration settings.
 */
export function saveConfig() {
    const form = document.getElementById('configForm');
    const formData = new FormData(form);
    const config = {
        showIssueTypeIcons: formData.get('showIssueTypeIcons') === 'on',
        themeSelection: formData.get('themeSelection'),
        issueColors: {}
    };

    formData.forEach((value, key) => {
        if (key.startsWith('issueType-')) {
            const issueType = key.replace('issueType-', '');
            config.issueColors[issueType] = value;
        }
    });

    const loadingIndicator = document.getElementById('loading-container');
    loadingIndicator.style.display = 'block'; // Show loading indicator

    fetch('/config/saveConfig', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
    }).then(response => {
        loadingIndicator.style.display = 'none'; // Hide loading indicator
        if (response.ok) {
            hideModal('#configModal');
            applyTheme(config.themeSelection); // Apply the selected theme
        } else {
            console.error('Failed to save configuration.');
        }
    });
}

/**
 * Load configuration settings.
 */
export function loadConfig() {
    fetch('/config/getConfig')
        .then(response => response.json())
        .then(config => {
            document.getElementById('showIssueTypeIcons').checked = config.showIssueTypeIcons;
            document.getElementById('themeSelection').value = config.themeSelection || 'light';

            const issueTypeColors = document.getElementById('issueTypeColors');
            issueTypeColors.innerHTML = '';

            for (const [issueType, color] of Object.entries(config.issueColors)) {
                addIssueType(issueType, color);
            }

            applyTheme(config.themeSelection);
        });
}

/**
 * Add an issue type with a color.
 * @param {string} issueType - The issue type.
 * @param {string} color - The color associated with the issue type.
 */
export function addIssueType(issueType = '', color = '#000000') {
    const issueTypeColors = document.getElementById('issueTypeColors');
    const div = document.createElement('div');
    div.className = 'issue-type-color';

    const inputIssueType = document.createElement('input');
    inputIssueType.type = 'text';
    inputIssueType.placeholder = 'Issue Type';
    inputIssueType.value = issueType;

    const inputColor = document.createElement('input');
    inputColor.type = 'color';
    inputColor.value = color;

    // Set the name attributes correctly based on the issue type value
    const updateInputNames = () => {
        const issueTypeValue = inputIssueType.value.trim();
        inputIssueType.name = `issueType-${issueTypeValue}`;
        inputColor.name = `issueType-${issueTypeValue}`;
    };

    // Update names initially and on input change
    updateInputNames();
    inputIssueType.addEventListener('input', updateInputNames);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.classList.add("destructive");
    removeButton.textContent = '✖️';
    removeButton.onclick = () => div.remove();

    div.appendChild(inputIssueType);
    div.appendChild(inputColor);
    div.appendChild(removeButton);
    issueTypeColors.appendChild(div);
}

window.saveConfig = saveConfig;
window.loadConfig = loadConfig;
window.addIssueType = addIssueType;
