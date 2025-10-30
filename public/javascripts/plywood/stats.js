import { showLoading, hideLoading, getCurrentProject, changeProject, initializeProject, applyTheme } from './ui.js';
import { loadProjects } from './config.js';

let currentChartType = 'issueTypes'; // 'issueTypes', 'issues', or 'projects'
let currentChartStyle = 'pie'; // Start with pie charts
let currentChart = null;
let lastData = null; // Store the last data to rerender chart
let statsRequestId = 0; // For debouncing/race control
let selectedIssueKeys = new Set();
let issueChoices = null;
let debounceTimer = null;

function debounce(fn, delay = 300) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fn(...args), delay);
    };
}

// Safely extract plain text from a comment that may be a string or an Atlassian document object
function getCommentText(value) {
	if (!value) return '';
	if (typeof value === 'string') return value;
	// Handle simple objects that may contain 'text' directly
	if (typeof value === 'object' && value.text && typeof value.text === 'string') {
		return value.text;
	}
	// Handle Atlassian Document Format: recursively collect text nodes
	function collectText(node) {
		if (!node) return '';
		if (typeof node === 'string') return node;
		if (Array.isArray(node)) return node.map(collectText).join(' ');
		let parts = [];
		if (node.text) parts.push(node.text);
		if (node.content) parts.push(collectText(node.content));
		return parts.join(' ').trim();
	}
	return collectText(value).trim();
}

function renderTimeSpentList(data, expandedKeys = null) {
    const container = document.getElementById('timeSpentList');
    // const pageSize = 20;
    // let currentPage = 0;

    // Calculate max time first
    const maxTime = Math.max(...data.map(issue => issue.totalTimeSpent));

    // Just render all items (no page split)
    container.innerHTML = '';
    const prevExpanded = expandedKeys || new Set(Array.from(document.querySelectorAll('.issue-content:not(.hidden)')).map(e => e.parentElement?.dataset.issueKey));
    data.forEach(issue => {
        const hours = Math.floor(issue.totalTimeSpent / 3600);
        const minutes = Math.floor((issue.totalTimeSpent % 3600) / 60);
        const percentage = (issue.totalTimeSpent / maxTime) * 100;
        
        const div = document.createElement('div');
        div.className = 'issue-stats-container';
        
        // Create expandable header with progress bar
        const header = document.createElement('div');
        header.className = 'issue-header';
        header.innerHTML = `
            <div class="issue-header-content">
                <span class="expand-button">▶</span>
                <h3>${issue.key} - ${issue.summary}</h3>
                <div class="time-info">
                    ${hours}h ${minutes}m
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
        `;

        // Create expandable content for worklogs
        const content = document.createElement('div');
        content.className = 'issue-content hidden';

        // Defensive: Only show worklogs if well-formed array
        let commentsList = Array.isArray(issue.comments) ? issue.comments : [];
        if (!Array.isArray(issue.comments)) {
            console.warn('Malformed comments for issue', issue.key, issue.comments);
        }
        // Filter by comments-only if enabled
        const commentsOnly = document.getElementById('globalWithComments')?.checked;

        // Sorting controls per-issue
        const sortWrap = document.createElement('div');
        sortWrap.className = 'sort-controls';
        sortWrap.innerHTML = `
            <div class="sort-row">
                <label>Sort logs by
                    <select class="issue-sort">
                        <option value="time" selected>Time logged</option>
                        <option value="date">Date</option>
                    </select>
                </label>
                <button type="button" class="sort-order" title="Toggle sort order">↓</button>
            </div>
        `;
        content.appendChild(sortWrap);

    const listFragment = document.createDocumentFragment();
        const validComments = commentsList
            .filter(c => c && typeof c === 'object')
            .filter(c => !commentsOnly || (getCommentText(c.comment || '').length > 0));

        // Saturation scaling per-issue
        const maxDur = validComments.reduce((m, c) => Math.max(m, c.timeSpent || 0), 0) || 1;
        const minDur = validComments.reduce((m, c) => Math.min(m, c.timeSpent || 0), maxDur);

        let sortBy = 'time';
        let descending = true;
        const renderComments = () => {
            // Clear previously rendered comments (keep sort controls)
            [...content.querySelectorAll('.comment-item')].forEach(el => el.remove());

            const sorted = [...validComments].sort((a, b) => {
                if (sortBy === 'date') {
                    return (descending ? 1 : -1) * (new Date(b.created) - new Date(a.created));
                }
                return (descending ? 1 : -1) * ((b.timeSpent || 0) - (a.timeSpent || 0));
            });

            sorted.forEach(comment => {
                const frac = maxDur === minDur ? 0 : ((comment.timeSpent || 0) - minDur) / (maxDur - minDur);
                const el = createCommentElement(comment, false, frac);
                el.dataset.duration = String(comment.timeSpent || 0);
                listFragment.appendChild(el);
            });
            content.appendChild(listFragment);
        };

        const sortSelect = sortWrap.querySelector('.issue-sort');
        sortSelect.addEventListener('change', () => { sortBy = sortSelect.value; renderComments(); });
        const orderBtn = sortWrap.querySelector('.sort-order');
        orderBtn.addEventListener('click', () => {
            descending = !descending;
            orderBtn.textContent = descending ? '↓' : '↑';
            renderComments();
        });

        // Initial render
        renderComments();

        if (validComments.length === 0) {
            const noComments = document.createElement('div');
            noComments.className = 'no-comments';
            noComments.textContent = 'No worklog comments';
            content.appendChild(noComments);
        }
        
        div.appendChild(header);
        div.appendChild(content);
        container.appendChild(div);
        
        // Add click handler for expansion
        header.addEventListener('click', () => {
            const button = header.querySelector('.expand-button');
            const willExpand = content.classList.contains('hidden');
            button.textContent = willExpand ? '▼' : '▶';
            content.classList.toggle('hidden');
        });
        // Restore expanded state
        if (prevExpanded && prevExpanded.has(issue.key)) {
            content.classList.remove('hidden');
            header.querySelector('.expand-button').textContent = '▼';
        }
    });
}

function createCommentElement(comment, showIssueInfo = true, intensity = 0) {
    const author = comment.author || '';
    const rawComment = (comment && Object.prototype.hasOwnProperty.call(comment, 'comment')) ? comment.comment : '';
    const created = comment.created ? new Date(comment.created).toLocaleString() : '';
    const duration = typeof comment.timeSpent === 'number' ? comment.timeSpent : 0;

    // Derive safe, readable text from raw comment (handles strings and ADF objects)
    let readableText = '';
    if (typeof rawComment === 'string') {
        readableText = rawComment;
    } else if (rawComment && typeof rawComment === 'object') {
        try {
            readableText = getCommentText(rawComment) || '';
        } catch (e) {
            console.warn('Could not parse comment object', rawComment, e);
            readableText = '';
        }
    } else if (rawComment != null) {
        readableText = '';
    }

    const hasText = typeof readableText === 'string' && readableText.trim().length > 0;

    // Build using existing CSS classes for consistent spacing/separation
    const container = document.createElement('div');
    container.className = 'comment-item' + (hasText ? '' : ' compact');
    // Heatmap by saturation (0..1) using medium blue hue
    const heatEnabled = document.getElementById('globalHeatmap')?.checked;
    if (heatEnabled) {
        applyCommentHeat(container, intensity);
    }

    // Author/header line
    const authorEl = document.createElement('div');
    authorEl.className = 'comment-author';
    authorEl.textContent = `${author} — ${created}`;
    container.appendChild(authorEl);

    // Duration line
    const durEl = document.createElement('div');
    durEl.className = 'comment-duration';
    durEl.textContent = `${Math.floor(duration/3600)}h ${(Math.floor(duration/60)%60)}m`;
    container.appendChild(durEl);

    if (hasText) {
        const textEl = document.createElement('div');
        textEl.className = 'comment-text';
        textEl.textContent = readableText;
        container.appendChild(textEl);
    }

    // Right-aligned time (redundant with header, but keeps previous layout option). Keep minimal; can omit if noisy
    // const timeEl = document.createElement('div');
    // timeEl.className = 'comment-time';
    // timeEl.textContent = created;
    // container.appendChild(timeEl);

    return container;
}

function initializeDateInputs() {
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 30); // Default to last 30 days
    
    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    document.getElementById('endDate').value = today.toISOString().split('T')[0];
}

async function loadStats(options = {}) {
    const requestId = ++statsRequestId;
    showLoading();
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const project = getCurrentProject(); // This should now have the correct value
    const issuesSelect = document.getElementById('issueFilter');
    const showChildren = document.getElementById('showSubtasks')?.checked;
    const commentsOnly = document.getElementById('globalWithComments')?.checked;
    const selectedIssues = (window.issueChoices && typeof window.issueChoices.getValue === 'function')
        ? window.issueChoices.getValue(true)
        : Array.from(issuesSelect?.selectedOptions || []).map(o => o.value);
    const issuesParam = selectedIssues.join(',');
    
    // Track expanded issue keys (before refresh)
    let expandedKeys = options.expandedKeys;
    if (!expandedKeys) {
      expandedKeys = new Set(Array.from(document.querySelectorAll('.issue-content:not(.hidden)')).map(e => e.parentElement?.dataset.issueKey));
    }

    try {
        const qs = new URLSearchParams({ start, end, project });
        if (issuesParam) qs.set('issues', issuesParam);
        if (issuesParam) qs.set('includeChildren', String(!!showChildren));
        if (commentsOnly) qs.set('commentsOnly', 'true');
        const response = await fetch(`/stats/data?${qs.toString()}`);
        const data = await response.json();
        lastData = data;
        // Populate issue filter options with available issues (preserve selections)
        populateIssueFilter(data, issuesSelect, selectedIssues);
        // Pass expanded keys to preserve expansion
        if (requestId === statsRequestId) {
            renderTimeSpentList(data, expandedKeys);
            await renderAnalysisChart(data);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    } finally {
        hideLoading();
    }
}

function populateIssueFilter(data, selectEl, preserveKeys = []) {
    if (!selectEl) return;
    if (window.issueChoices && window.issueChoices.setChoices) {
        const existingValues = new Set(window.issueChoices._store.choices.map(c => c.value));
        const newChoices = [];
        data.forEach(issue => {
            if (!existingValues.has(issue.key)) {
                newChoices.push({ value: issue.key, label: `${issue.key} — ${issue.summary}`});
            }
        });
        if (newChoices.length) {
            window.issueChoices.setChoices(newChoices, 'value', 'label', true);
        }
        if (preserveKeys && preserveKeys.length) {
            preserveKeys.forEach(v => window.issueChoices.setChoiceByValue(v));
        }
    } else {
        const existing = new Set(Array.from(selectEl.options).map(o => o.value));
        data.forEach(issue => {
            if (!existing.has(issue.key)) {
                const opt = document.createElement('option');
                opt.value = issue.key;
                opt.textContent = `${issue.key} — ${issue.summary}`;
                selectEl.appendChild(opt);
            }
        });
        if (preserveKeys && preserveKeys.length) {
            Array.from(selectEl.options).forEach(o => {
                o.selected = preserveKeys.includes(o.value);
            });
        }
    }
}

// Add color cache
const colorCache = {
    issues: new Map(),
    types: new Map(),
    projects: new Map(),
    lastSettingsUpdate: 0
};

// Function to check if cache is valid
function isColorCacheValid() {
    const settings = window.previousConfig;
    return settings && colorCache.lastSettingsUpdate === settings.lastUpdate;
}

async function getCachedColor(key, type) {
    // Invalidate cache if settings changed
    if (!isColorCacheValid()) {
        colorCache.issues.clear();
        colorCache.types.clear();
        colorCache.projects.clear();
        colorCache.lastSettingsUpdate = window.previousConfig?.lastUpdate || Date.now();
    }

    const cache = colorCache[type];
    if (cache.has(key)) {
        return cache.get(key);
    }

    // Fetch color based on type
    let color;
    switch(type) {
        case 'issues':
            // Fetch color from issue configuration, not individual worklogs
            color = await fetch(`/issues/${key}/color`).then(r => r.json()).then(d => d.color);
            break;
        case 'types':
            const settings = window.previousConfig || {};
            color = settings.issueColors?.[key.toLowerCase()] || 
                   `hsl(${Math.random() * 360}, 70%, 50%)`;
            break;
        case 'projects':
            try {
                const response = await fetch(`/projects/${key}/avatar`);
                if (!response.ok) throw new Error();
                color = (await response.json()).color;
            } catch {
                const hue = Array.from(key).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
                color = `hsl(${hue}, 70%, 50%)`;
            }
            break;
    }

    cache.set(key, color);
    return color;
}

/**
 * Calculate color similarity using RGB distance
 * @param {string} color1 - First color (hex or hsl)
 * @param {string} color2 - Second color (hex or hsl)
 * @returns {number} - Distance between colors (0-441, lower means more similar)
 */
function calculateColorSimilarity(color1, color2) {
    const rgb1 = colorToRgb(color1);
    const rgb2 = colorToRgb(color2);
    
    if (!rgb1 || !rgb2) return 441; // Maximum distance if conversion fails
    
    // Calculate Euclidean distance in RGB space
    const rDiff = rgb1.r - rgb2.r;
    const gDiff = rgb1.g - rgb2.g;
    const bDiff = rgb1.b - rgb2.b;
    
    return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

/**
 * Convert color string to RGB object
 * @param {string} color - Color in hex or hsl format
 * @returns {Object} - RGB object with r, g, b properties
 */
function colorToRgb(color) {
    if (!color) return null;
    
    // Handle hex colors
    if (color.startsWith('#')) {
        const hex = color.slice(1);
        if (hex.length === 6) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
    }
    
    // Handle HSL colors
    if (color.startsWith('hsl')) {
        const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (match) {
            const h = parseInt(match[1]) / 360;
            const s = parseInt(match[2]) / 100;
            const l = parseInt(match[3]) / 100;
            
            return hslToRgb(h, s, l);
        }
    }
    
    // Handle RGB colors
    if (color.startsWith('rgb')) {
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return {
                r: parseInt(match[1]),
                g: parseInt(match[2]),
                b: parseInt(match[3])
            };
        }
    }
    
    return null;
}

/**
 * Convert HSL to RGB
 * @param {number} h - Hue (0-1)
 * @param {number} s - Saturation (0-1)
 * @param {number} l - Lightness (0-1)
 * @returns {Object} - RGB object
 */
function hslToRgb(h, s, l) {
    let r, g, b;
    
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

/**
 * Generate alternative color that's sufficiently different
 * @param {string} originalColor - The original color
 * @param {Array} existingColors - Array of existing colors to avoid
 * @returns {string} - New color that's different enough
 */
function generateAlternativeColor(originalColor, existingColors) {
    const maxAttempts = 20;
    const minDistance = 80; // Minimum color distance to consider "different enough"
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Generate a new color by adjusting hue
        const hue = (Math.random() * 360);
        const saturation = 60 + Math.random() * 30; // 60-90%
        const lightness = 40 + Math.random() * 20;  // 40-60%
        
        const newColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        
        // Check if this color is different enough from all existing colors
        const isSufficientlyDifferent = existingColors.every(existingColor => 
            calculateColorSimilarity(newColor, existingColor) >= minDistance
        );
        
        if (isSufficientlyDifferent) {
            return newColor;
        }
    }
    
    // Fallback: return a color based on attempt number if we can't find a good one
    const fallbackHue = (Math.random() * 360);
    return `hsl(${fallbackHue}, 70%, 50%)`;
}

/**
 * Remove similar colors from array and replace with different ones
 * @param {Array} colors - Array of colors to check
 * @returns {Array} - Array with similar colors replaced
 */
function removeSimilarColors(colors) {
    const minDistance = 80; // Minimum acceptable distance between colors
    const processedColors = [...colors];
    
    for (let i = 0; i < processedColors.length; i++) {
        for (let j = i + 1; j < processedColors.length; j++) {
            const similarity = calculateColorSimilarity(processedColors[i], processedColors[j]);
            
            if (similarity < minDistance) {
                console.log(`Colors too similar (distance: ${similarity}): ${processedColors[i]} and ${processedColors[j]}`);
                
                // Replace the second color with a different one
                const existingColors = processedColors.filter((_, index) => index !== j);
                processedColors[j] = generateAlternativeColor(processedColors[j], existingColors);
                
                console.log(`Replaced similar color with: ${processedColors[j]}`);
            }
        }
    }
    
    return processedColors;
}

async function generateColors(count, data, type) {
    let colors;
    
    switch(type) {
        case 'issueTypes':
            colors = await Promise.all(Object.keys(data).map(type => 
                getCachedColor(type, 'types')
            ));
            break;
            
        case 'issues':
            colors = await Promise.all(Object.entries(data).map(async ([key]) => {
                const issueKey = key.split(' - ')[0];
                return getCachedColor(issueKey, 'issues');
            }));
            break;
            
        case 'projects':
            colors = await Promise.all(Object.keys(data).map(project => 
                getCachedColor(project, 'projects')
            ));
            break;
            
        default:
            colors = Array(count).fill(0).map(() => 
                `hsl(${Math.random() * 360}, 70%, 50%)`
            );
    }
    
    // Remove similar colors and replace with different ones
    return removeSimilarColors(colors);
}

function toggleChartStyle() {
    currentChartStyle = currentChartStyle === 'bar' ? 'pie' : 'bar';
    const button = document.getElementById('toggleChart');
    button.textContent = currentChartStyle === 'bar' ? '🥧' : '📊';
    if (lastData) renderAnalysisChart(lastData);
}

function renderIssueTypesChart(data) {
    const ctx = document.getElementById('issueTypesChart');
    if (issueTypesChart) issueTypesChart.destroy();
    
    const timeByType = data.reduce((acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + issue.totalTimeSpent;
        return acc;
    }, {});

    const chartData = {
        labels: Object.keys(timeByType),
        datasets: [{
            label: 'Hours Spent',
            data: Object.values(timeByType).map(time => time / 3600),
            backgroundColor: generateColors(Object.keys(timeByType).length)
        }]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: currentChartType === 'pie' ? 'right' : 'top'
            }
        }
    };

    issueTypesChart = new Chart(ctx, {
        type: currentChartType,
        data: chartData,
        options: options
    });
}

async function renderAnalysisChart(data) {
    const ctx = document.getElementById('analysisChart');
    // Always destroy previous Chart if it exists
    try {
        if (window.Chart && typeof window.Chart.getChart === 'function') {
            const existing = window.Chart.getChart(ctx);
            if (existing) existing.destroy();
        }
    } catch(e) {}
    if (window.statsAnalysisChart && typeof window.statsAnalysisChart.destroy === 'function') {
        try { window.statsAnalysisChart.destroy(); } catch(e) {}
    }
    let chartData;
    let options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: currentChartStyle === 'pie' ? 'right' : 'top'
            },
            title: {
                display: true,
                position: 'bottom',
                text: getChartTitle()
            }
        }
    };

    switch (currentChartType) {
        case 'issueTypes': {
            const timeByType = data.reduce((acc, issue) => {
                acc[issue.type] = (acc[issue.type] || 0) + issue.totalTimeSpent;
                return acc;
            }, {});
            const typeColors = await generateColors(Object.keys(timeByType).length, timeByType, 'issueTypes');
            chartData = {
                labels: Object.keys(timeByType),
                datasets: [{
                    label: 'Hours Spent',
                    data: Object.values(timeByType).map(time => time / 3600),
                    backgroundColor: typeColors
                }]
            };
            break;
        }

        case 'issues': {
            const timeByIssue = data.reduce((acc, issue) => {
                const key = `${issue.key} - ${issue.summary}`;
                acc[key] = {
                    time: issue.totalTimeSpent,
                    type: issue.type
                };
                return acc;
            }, {});
            const colors = await generateColors(Object.keys(timeByIssue).length, timeByIssue, 'issues');
            chartData = {
                labels: Object.keys(timeByIssue),
                datasets: [{
                    label: 'Hours Spent',
                    data: Object.values(timeByIssue).map(v => v.time / 3600),
                    backgroundColor: colors
                }]
            };
            break;
        }

        case 'projects': {
            const timeByProject = data.reduce((acc, issue) => {
                const project = issue.key.split('-')[0];
                acc[project] = (acc[project] || 0) + issue.totalTimeSpent;
                return acc;
            }, {});
            const colors = await generateColors(Object.keys(timeByProject).length, timeByProject, 'projects');
            chartData = {
                labels: Object.keys(timeByProject),
                datasets: [{
                    label: 'Hours Spent',
                    data: Object.values(timeByProject).map(time => time / 3600),
                    backgroundColor: colors
                }]
            };
            break;
        }
    }

    window.statsAnalysisChart = new Chart(ctx, {
        type: currentChartStyle,
        data: chartData,
        options: options
    });
}

function getChartTitle() {
    switch (currentChartType) {
        case 'issueTypes':
            return 'Distribution by Issue Type';
        case 'issues':
            return 'Distribution by Issue';
        case 'projects':
            return 'Distribution by Project';
        default:
            return '';
    }
}

function initializeChartControls() {
    const buttons = document.querySelectorAll('.type-button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            currentChartType = button.dataset.type;
            if (lastData) {
                renderAnalysisChart(lastData);
            }
        });
    });

    const chartToggle = document.getElementById('toggleChart');
    if (chartToggle) {
        chartToggle.addEventListener('click', toggleChartStyle);
    }
}

async function initializeStats() {
    // Apply theme first from localStorage
    const savedTheme = localStorage.getItem('themeSelection');
    if (savedTheme) {
        applyTheme(savedTheme);
    }
    
    await initializeProject();
    initializeDateInputs();
    initializeChartControls();
    
    const headerProjectSelect = document.getElementById('headerProjectSelection');
    if (headerProjectSelect) {
        await loadProjects(headerProjectSelect, getCurrentProject());
        
        headerProjectSelect.addEventListener('change', (event) => {
            changeProject(event.target.value);
        });
    }
    
    // Update all filter triggers to preserve expansion state when reloading
    const applyNow = debounce(() => {
        const expandedKeys = new Set(Array.from(document.querySelectorAll('.issue-content:not(.hidden)')).map(e => e.parentElement?.dataset.issueKey));
        loadStats({expandedKeys});
    }, 250);
    document.getElementById('refreshStats').addEventListener('click', loadStats);
    document.getElementById('toggleChart').addEventListener('click', toggleChartStyle);

    // Toggle heatmap class on container
    const heatToggle = document.getElementById('globalHeatmap');
    const listContainer = document.getElementById('timeSpentList');
    if (heatToggle && listContainer) {
        const syncHeatClass = () => {
            if (heatToggle.checked) {
                listContainer.classList.add('heatmap-enabled');
            } else {
                listContainer.classList.remove('heatmap-enabled');
            }
        };
        heatToggle.addEventListener('change', () => {
            syncHeatClass();
            updateHeatmapRendering();
        });
        syncHeatClass();
    }

    // Enable/disable Show sub-tasks based on issue filter selection
    const issueSelect = document.getElementById('issueFilter');
    const subtasksCb = document.getElementById('showSubtasks');
    const syncSubtasksEnabled = () => {
        if (!issueSelect || !subtasksCb) return;
        const hasSelection = Array.from(issueSelect.selectedOptions || []).length > 0;
        subtasksCb.disabled = !hasSelection;
        subtasksCb.parentElement.style.opacity = hasSelection ? '1' : '0.5';
    };
    if (issueSelect && subtasksCb) {
        issueSelect.addEventListener('change', () => { syncSubtasksEnabled(); applyNow(); });
        syncSubtasksEnabled();
    }
    // Auto-apply on checkboxes
    const commentsCb = document.getElementById('globalWithComments');
    if (commentsCb) commentsCb.addEventListener('change', applyNow);
    const subtasksApply = document.getElementById('showSubtasks');
    if (subtasksApply) subtasksApply.addEventListener('change', applyNow);
    
    // Initial load
    await loadStats();

    // Initialize Choices for issue select with remote suggestions
    await initializeIssueChoices();
}

document.addEventListener('DOMContentLoaded', initializeStats);

// Make loadStats available globally
window.loadStats = loadStats;

async function initializeIssueChoices() {
    const select = document.getElementById('issueFilter');
    if (!select) return;
    if (window.issueChoices) return; // prevent re-init
    // Ensure Choices library is loaded
    async function ensureChoices() {
        if (window.Choices) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '/javascripts/choices.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    try {
        await ensureChoices();
        issueChoices = new window.Choices(select, {
            removeItemButton: true,
            duplicateItemsAllowed: false,
            searchResultLimit: 10,
            shouldSort: false,
            placeholderValue: 'Select issues',
            searchPlaceholderValue: 'Search issues...'
        });
        window.issueChoices = issueChoices;
        select.addEventListener('change', () => {
            // Keep subtasks state and auto-apply
            const subtasksCb = document.getElementById('showSubtasks');
            if (subtasksCb) {
                const hasSelection = (issueChoices.getValue(true) || []).length > 0;
                subtasksCb.disabled = !hasSelection;
                subtasksCb.parentElement.style.opacity = hasSelection ? '1' : '0.5';
            }
            // Apply filters immediately, preserving expansion
            const expandedKeys = new Set(Array.from(document.querySelectorAll('.issue-content:not(.hidden)')).map(e => e.parentElement?.dataset.issueKey));
            window.loadStats({expandedKeys});
        });

        const doSearch = debounce(async (term) => {
            if (!term || term.length < 2) return;
            try {
                const project = getCurrentProject();
                const url = new URL('/issues/user', window.location.origin);
                url.searchParams.set('query', term);
                if (project && project !== 'all') url.searchParams.set('project', project);
                const res = await fetch(url.toString());
                const issues = await res.json();
                const existingValues = new Set(issueChoices.getValue(true));
                const existingOptions = new Set(issueChoices._store.choices.map(c => c.value));
                const choices = issues
                    .map(i => ({ value: i.key, label: `${i.key} — ${i.summary}` }))
                    .filter(c => !existingOptions.has(c.value));
                if (choices.length) {
                    issueChoices.setChoices(choices, 'value', 'label', true);
                    existingValues.forEach(v => issueChoices.setChoiceByValue(v));
                }
            } catch (e) {
                console.warn('Issue search failed', e);
            }
        }, 300);

        // Listen to search input
        const container = select.closest('.choices');
        const getInput = () => container ? container.querySelector('input') : null;
        const observer = new MutationObserver(() => {
            const input = getInput();
            if (input && !input._hooked) {
                input._hooked = true;
                input.addEventListener('input', (e) => doSearch(e.target.value));
            }
        });
        observer.observe(select.parentElement, { childList: true, subtree: true });
        // seed initial
        const input = getInput();
        if (input && !input._hooked) {
            input._hooked = true;
            input.addEventListener('input', (e) => doSearch(e.target.value));
        }
    } catch (e) {
        console.warn('Choices initialization failed', e);
    }
}

function applyCommentHeat(el, intensity) {
    // Increase contrast range: 0...100 saturation (was 0...60)
    const dark = document.documentElement.classList.contains('dark-theme') || document.body.classList.contains('dark-theme');
    const sat = Math.round((intensity || 0) * 100);
    const light = dark ? 22 : 92;
    el.setAttribute('data-heat', '1');
    el.style.backgroundColor = `hsl(210, ${sat}%, ${light}%)`;
}

function updateHeatmapRendering() {
    const list = document.getElementById('timeSpentList');
    if (!list) return;
    const heatEnabled = document.getElementById('globalHeatmap')?.checked;
    // For each issue content block, recompute min/max and apply
    list.querySelectorAll('.issue-content').forEach(block => {
        const items = Array.from(block.querySelectorAll('.comment-item'));
        const durations = items.map(i => parseInt(i.dataset.duration || '0', 10));
        const max = durations.reduce((m, v) => Math.max(m, v), 0) || 1;
        const min = durations.reduce((m, v) => Math.min(m, v), max);
        items.forEach((i, idx) => {
            const d = durations[idx];
            const frac = max === min ? 0 : (d - min) / (max - min);
            if (heatEnabled) {
                applyCommentHeat(i, frac);
            } else {
                i.style.backgroundColor = '';
                i.removeAttribute('data-heat');
            }
        });
    });
}