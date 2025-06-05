import { showLoading, hideLoading, getCurrentProject, changeProject, initializeProject, applyTheme } from './ui.js';
import { loadProjects } from './config.js';

let currentChartType = 'issueTypes'; // 'issueTypes', 'issues', or 'projects'
let currentChartStyle = 'pie'; // Start with pie charts
let currentChart = null;
let lastData = null; // Store the last data to rerender chart

function renderTimeSpentList(data) {
    const container = document.getElementById('timeSpentList');
    const pageSize = 20;
    let currentPage = 0;

    // Calculate max time first
    const maxTime = Math.max(...data.map(issue => issue.totalTimeSpent));

    function renderPage(page) {
        const start = page * pageSize;
        const end = start + pageSize;
        const pageData = data.slice(start, end);
        
        // Only clear if it's the first page
        if (page === 0) {
            container.innerHTML = '';
        }

        pageData.forEach(issue => {
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
            
            if (issue.comments && issue.comments.length > 0) {
                // Sort comments by time spent
                const sortedComments = issue.comments
                    .sort((a, b) => b.timeSpent - a.timeSpent)
                    .map(comment => createCommentElement(comment, false));
                    
                content.append(...sortedComments);
            } else {
                // Add "no comments" message
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
                button.textContent = content.classList.contains('hidden') ? '▼' : '▶';
                content.classList.toggle('hidden');
            });
        });

        // Add load more button if there's more data
        if (end < data.length) {
            const loadMore = document.createElement('button');
            loadMore.className = 'load-more';
            loadMore.textContent = 'Load More';
            loadMore.onclick = () => {
                loadMore.remove();
                renderPage(page + 1);
            };
            container.appendChild(loadMore);
        }
    }

    renderPage(0);
}

function createCommentElement(comment, showIssueInfo = true) {
    const div = document.createElement('div');
    div.className = 'comment-item';
    
    const hours = Math.floor(comment.timeSpent / 3600);
    const minutes = Math.floor((comment.timeSpent % 3600) / 60);
    
    div.innerHTML = `
        ${showIssueInfo ? `<div><strong>${comment.issueKey}</strong> - ${comment.issueSummary}</div>` : ''}
        <div class="comment-author">${comment.author}</div>
        <div class="comment-text">${comment.comment}</div>
        <div class="comment-time">
            ${new Date(comment.created).toLocaleDateString()} 
            (${hours}h ${minutes}m)
        </div>
    `;
    return div;
}

function initializeDateInputs() {
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 30); // Default to last 30 days
    
    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    document.getElementById('endDate').value = today.toISOString().split('T')[0];
}

async function loadStats() {
    showLoading();
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const project = getCurrentProject(); // This should now have the correct value
    
    try {
        const response = await fetch(`/stats/data?start=${start}&end=${end}&project=${project}`);
        const data = await response.json();
        lastData = data;
        
        renderTimeSpentList(data);
        renderAnalysisChart(data);
    } catch (error) {
        console.error('Error loading stats:', error);
    } finally {
        hideLoading();
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
    if (currentChart) currentChart.destroy();
    
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

    currentChart = new Chart(ctx, {
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
    
    document.getElementById('refreshStats').addEventListener('click', loadStats);
    document.getElementById('toggleChart').addEventListener('click', toggleChartStyle);
    
    // Initial load
    await loadStats();
}

document.addEventListener('DOMContentLoaded', initializeStats);

// Make loadStats available globally
window.loadStats = loadStats;