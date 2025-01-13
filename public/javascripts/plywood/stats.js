import { showLoading, hideLoading, getCurrentProject, changeProject } from './ui.js';
import { loadProjects } from './config.js';

let currentSortMode = 'date'; // 'date' or 'issue'

async function loadSprints() {
    const response = await fetch('/projects/sprints');
    const data = await response.json();
    const selector = document.getElementById('sprintSelector');
    
    data.values.forEach(sprint => {
        const option = document.createElement('option');
        option.value = sprint.id;
        option.textContent = sprint.name;
        selector.appendChild(option);
    });
    
    selector.addEventListener('change', loadSprintStats);
}

async function loadSprintStats() {
    const sprintId = document.getElementById('sprintSelector').value;
    if (!sprintId) return;
    
    const response = await fetch(`/sprint-stats/data?sprintId=${sprintId}`);
    const data = await response.json();
    
    renderTimeSpentList(data);
    renderCommentsList(data);
}

function renderTimeSpentList(data) {
    const container = document.getElementById('timeSpentList');
    container.innerHTML = '';
    
    // Sort data by total time spent descending
    data.sort((a, b) => b.totalTimeSpent - a.totalTimeSpent);
    
    data.forEach(issue => {
        const hours = Math.floor(issue.totalTimeSpent / 3600);
        const minutes = Math.floor((issue.totalTimeSpent % 3600) / 60);
        
        const div = document.createElement('div');
        div.className = 'issue-stats';
        div.innerHTML = `
            <h3>${issue.key} - ${issue.summary}</h3>
            <div class="issue-time">
                Time spent: ${hours}h ${minutes}m | Type: ${issue.type} | Status: ${issue.status}
            </div>
        `;
        container.appendChild(div);
    });
}

function renderCommentsList(data) {
    const container = document.getElementById('commentsList');
    container.innerHTML = '';
    
    let comments;
    
    if (currentSortMode === 'date') {
        // Flatten all comments and sort by date
        comments = data.reduce((acc, issue) => {
            return acc.concat(issue.comments.map(comment => ({
                ...comment,
                issueKey: issue.key,
                issueSummary: issue.summary
            })));
        }, []).sort((a, b) => new Date(b.created) - new Date(a.created));
        
        comments.forEach(comment => {
            container.appendChild(createCommentElement(comment));
        });
    } else {
        // Group by issue and sort issues by total time spent
        data.sort((a, b) => b.totalTimeSpent - a.totalTimeSpent)
            .forEach(issue => {
                if (issue.comments.length > 0) {
                    // Add issue header
                    const issueHeader = document.createElement('div');
                    issueHeader.className = 'issue-header';
                    issueHeader.innerHTML = `<h3>${issue.key} - ${issue.summary}</h3>`;
                    container.appendChild(issueHeader);
                    
                    // Sort comments by date within each issue
                    issue.comments
                        .sort((a, b) => new Date(b.created) - new Date(a.created))
                        .forEach(comment => {
                            container.appendChild(createCommentElement(comment, false));
                        });
                }
            });
    }
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
    const project = getCurrentProject();
    
    try {
        const response = await fetch(`/stats/data?start=${start}&end=${end}&project=${project}`);
        const data = await response.json();
        
        renderTimeSpentList(data);
        renderCommentsList(data);
    } catch (error) {
        console.error('Error loading stats:', error);
    } finally {
        hideLoading();
    }
}

function toggleCommentsSort() {
    currentSortMode = currentSortMode === 'date' ? 'issue' : 'date';
    const button = document.getElementById('toggleSort');
    button.textContent = currentSortMode === 'date' ? '📅 Sort by Issue' : '📑 Sort by Date';
    loadStats();
}

async function initializeStats() {
    initializeDateInputs();
    
    // Initialize project selector with saved value first
    const headerProjectSelect = document.getElementById('headerProjectSelection');
    if (headerProjectSelect) {
        // Get project from localStorage or config
        const savedProject = localStorage.getItem('currentProject') || 'all';
        await loadProjects(headerProjectSelect, savedProject);
        headerProjectSelect.value = savedProject;
        
        headerProjectSelect.addEventListener('change', (event) => {
            changeProject(event.target.value);
        });
        
        // Initial sync with saved project
        await changeProject(savedProject);
    }
    
    // Add sort toggle button
    const header = document.querySelector('.stats-section:nth-child(2) h2');
    const sortButton = document.createElement('button');
    sortButton.id = 'toggleSort';
    sortButton.className = 'sort-toggle';
    sortButton.textContent = '📅 Sort by Issue';
    sortButton.onclick = toggleCommentsSort;
    header.appendChild(sortButton);
    
    document.getElementById('refreshStats').addEventListener('click', loadStats);
}

document.addEventListener('DOMContentLoaded', initializeStats);

// Make loadStats available globally
window.loadStats = loadStats;