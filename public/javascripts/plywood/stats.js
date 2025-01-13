import { showLoading, hideLoading, getCurrentProject, changeProject, initializeProject, applyTheme } from './ui.js';
import { loadProjects } from './config.js';

let currentChartType = 'issueTypes'; // 'issueTypes', 'issues', or 'projects'
let currentChartStyle = 'pie'; // Start with pie charts
let currentChart = null;
let lastData = null; // Store the last data to rerender chart

function renderTimeSpentList(data) {
    const container = document.getElementById('timeSpentList');
    container.innerHTML = '';
    
    // Calculate max time for relative sizing
    const maxTime = Math.max(...data.map(issue => issue.totalTimeSpent));
    
    // Sort data by total time spent descending
    data.sort((a, b) => b.totalTimeSpent - a.totalTimeSpent);
    
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

function generateColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(`hsl(${(i * 360) / count}, 70%, 50%)`);
    }
    return colors;
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

function renderAnalysisChart(data) {
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
        case 'issueTypes':
            const timeByType = data.reduce((acc, issue) => {
                acc[issue.type] = (acc[issue.type] || 0) + issue.totalTimeSpent;
                return acc;
            }, {});
            chartData = {
                labels: Object.keys(timeByType),
                datasets: [{
                    label: 'Hours Spent',
                    data: Object.values(timeByType).map(time => time / 3600),
                    backgroundColor: generateColors(Object.keys(timeByType).length)
                }]
            };
            break;

        case 'issues':
            const timeByIssue = data.reduce((acc, issue) => {
                acc[`${issue.key} - ${issue.summary}`] = issue.totalTimeSpent;
                return acc;
            }, {});
            chartData = {
                labels: Object.keys(timeByIssue),
                datasets: [{
                    label: 'Hours Spent',
                    data: Object.values(timeByIssue).map(time => time / 3600),
                    backgroundColor: generateColors(Object.keys(timeByIssue).length)
                }]
            };
            break;

        case 'projects':
            const timeByProject = data.reduce((acc, issue) => {
                const project = issue.key.split('-')[0];
                acc[project] = (acc[project] || 0) + issue.totalTimeSpent;
                return acc;
            }, {});
            chartData = {
                labels: Object.keys(timeByProject),
                datasets: [{
                    label: 'Hours Spent',
                    data: Object.values(timeByProject).map(time => time / 3600),
                    backgroundColor: generateColors(Object.keys(timeByProject).length)
                }]
            };
            break;
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