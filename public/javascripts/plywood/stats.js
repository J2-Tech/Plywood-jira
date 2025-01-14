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

async function generateColors(count, data, type) {
    switch(type) {
        case 'issueTypes':
            return Promise.all(Object.keys(data).map(type => 
                getCachedColor(type, 'types')
            ));
            
        case 'issues':
            return Promise.all(Object.entries(data).map(async ([key]) => {
                const issueKey = key.split(' - ')[0];
                return getCachedColor(issueKey, 'issues');
            }));
            
        case 'projects':
            return Promise.all(Object.keys(data).map(project => 
                getCachedColor(project, 'projects')
            ));
            
        default:
            return Array(count).fill(0).map(() => 
                `hsl(${Math.random() * 360}, 70%, 50%)`
            );
    }
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