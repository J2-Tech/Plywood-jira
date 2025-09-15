// Objectives functionality for the notes panel

// Import logger (assuming it's available globally)
const log = window.log || console;

class ObjectivesManager {
    constructor() {
        this.objectives = [];
        this.isExpanded = false;
        this.searchTimeout = null;
        this.currentSearchResults = [];
        this.selectedIssue = null;
    }

    init() {
        this.setupEventListeners();
        this.loadObjectives();
    }

    setupEventListeners() {
        // Toggle objectives area - make entire header clickable
        const objectivesHeader = document.querySelector('.objectives-header');
        const objectivesContent = document.getElementById('objectivesContent');
        
        if (objectivesHeader && objectivesContent) {
            objectivesHeader.addEventListener('click', () => {
                this.toggleObjectives();
            });
        }

        // Issue search functionality
        const searchInput = document.getElementById('objectiveIssueSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearchInput(e.target.value);
            });

            searchInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    await this.addSelectedIssue();
                }
            });
        }

        // Add objective button
        const addBtn = document.getElementById('addObjective');
        if (addBtn) {
            addBtn.addEventListener('click', async () => {
                await this.addSelectedIssue();
            });
        }
    }

    toggleObjectives() {
        const toggleBtn = document.getElementById('toggleObjectives');
        const objectivesContent = document.getElementById('objectivesContent');
        
        this.isExpanded = !this.isExpanded;
        
        if (this.isExpanded) {
            objectivesContent.classList.add('expanded');
            objectivesContent.classList.remove('collapsed');
            if (toggleBtn) toggleBtn.textContent = '▲';
        } else {
            objectivesContent.classList.remove('expanded');
            objectivesContent.classList.add('collapsed');
            if (toggleBtn) toggleBtn.textContent = '▼';
        }
    }

    async handleSearchInput(query) {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        this.searchTimeout = setTimeout(async () => {
            if (query.length >= 3) {
                try {
                    this.currentSearchResults = await window.searchIssues(query);
                    this.showSearchResults();
                } catch (error) {
                    console.error('Error searching issues:', error);
                }
            } else {
                this.hideSearchResults();
            }
        }, 300);
    }

    showSearchResults() {
        // Create or update search results dropdown
        let dropdown = document.getElementById('objectiveSearchDropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'objectiveSearchDropdown';
            dropdown.className = 'objective-search-dropdown';
            
            const searchContainer = document.querySelector('.objective-input-group');
            searchContainer.appendChild(dropdown);
        }

        if (this.currentSearchResults.length === 0) {
            dropdown.innerHTML = '<div class="search-no-results">No issues found</div>';
        } else {
            dropdown.innerHTML = this.currentSearchResults.map((issue, index) => `
                <div class="search-result-item" data-index="${index}">
                    <span class="issue-key">${issue.customProperties.key}</span>
                    <span class="issue-summary">${issue.customProperties.summary}</span>
                </div>
            `).join('');

            // Add click handlers
            dropdown.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const index = parseInt(item.dataset.index);
                    this.selectIssue(this.currentSearchResults[index]);
                });
            });
        }

        dropdown.style.display = 'block';
    }

    hideSearchResults() {
        const dropdown = document.getElementById('objectiveSearchDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }

    selectIssue(issue) {
        this.selectedIssue = issue;
        const searchInput = document.getElementById('objectiveIssueSearch');
        if (searchInput) {
            searchInput.value = `${issue.customProperties.key} - ${issue.customProperties.summary}`;
        }
        this.hideSearchResults();
    }

    async addSelectedIssue() {
        if (!this.selectedIssue) {
            const searchInput = document.getElementById('objectiveIssueSearch');
            const query = searchInput.value.trim();
            
            if (query.length < 3) {
                alert('Please search for an issue first');
                return;
            }

            // Try to parse issue key from the input
            const issueKeyMatch = query.match(/^([A-Z]+-\d+)/);
            if (issueKeyMatch) {
                // Create a basic issue object from the input
                this.selectedIssue = {
                    customProperties: {
                        key: issueKeyMatch[1],
                        summary: query.replace(issueKeyMatch[1] + ' - ', ''),
                        issueId: issueKeyMatch[1]
                    }
                };
            } else {
                alert('Please select an issue from the search results');
                return;
            }
        }

        // Prompt for objective note/title
        const note = prompt('Add a note or title for this objective:', '');
        if (note === null) return; // User cancelled

        const objective = {
            id: Date.now().toString(),
            issueKey: this.selectedIssue.customProperties.key,
            issueSummary: this.selectedIssue.customProperties.summary || '',
            issueId: this.selectedIssue.customProperties.issueId || '',
            note: note || '',
            completed: false,
            createdAt: new Date().toISOString()
        };

        this.objectives.push(objective);
        this.renderObjectives();
        await this.saveObjectives();

        // Clear the search
        const searchInput = document.getElementById('objectiveIssueSearch');
        searchInput.value = '';
        this.selectedIssue = null;
        this.hideSearchResults();
    }

    renderObjectives() {
        const objectivesList = document.getElementById('objectivesList');
        if (!objectivesList) return;

        if (this.objectives.length === 0) {
            objectivesList.innerHTML = '<div class="no-objectives">No objectives yet. Add one above!</div>';
            return;
        }

        objectivesList.innerHTML = this.objectives.map(objective => `
            <div class="objective-item ${objective.completed ? 'completed' : ''}" data-id="${objective.id}">
                <input type="checkbox" class="objective-checkbox" ${objective.completed ? 'checked' : ''}>
                <div class="objective-content">
                    <div class="objective-issue">
                        <span class="objective-issue-key" data-issue-key="${objective.issueKey}">${objective.issueKey}</span>
                        ${objective.issueSummary ? `<span class="objective-issue-title" data-issue-key="${objective.issueKey}"> - ${objective.issueSummary}</span>` : ''}
                    </div>
                    <div class="objective-note">${objective.note}</div>
                </div>
                <div class="objective-actions">
                    <button class="edit-objective" title="Edit">✏️</button>
                    <button class="delete-objective" title="Delete">🗑️</button>
                    <button class="move-up" title="Move Up">↑</button>
                    <button class="move-down" title="Move Down">↓</button>
                </div>
            </div>
        `).join('');

        // Add event listeners
        objectivesList.querySelectorAll('.objective-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                const objectiveId = e.target.closest('.objective-item').dataset.id;
                await this.toggleObjectiveCompletion(objectiveId);
            });
        });

        objectivesList.querySelectorAll('.edit-objective').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const objectiveId = e.target.closest('.objective-item').dataset.id;
                await this.editObjective(objectiveId);
            });
        });

        objectivesList.querySelectorAll('.delete-objective').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const objectiveId = e.target.closest('.objective-item').dataset.id;
                await this.deleteObjective(objectiveId);
            });
        });

        objectivesList.querySelectorAll('.move-up').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const objectiveId = e.target.closest('.objective-item').dataset.id;
                await this.moveObjective(objectiveId, -1);
            });
        });

        objectivesList.querySelectorAll('.move-down').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const objectiveId = e.target.closest('.objective-item').dataset.id;
                await this.moveObjective(objectiveId, 1);
            });
        });

        // Add click listeners for issue key and title
        objectivesList.querySelectorAll('.objective-issue-key, .objective-issue-title').forEach(element => {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                const issueKey = element.getAttribute('data-issue-key');
                this.openIssueInJira(issueKey);
            });
        });
    }

    async toggleObjectiveCompletion(objectiveId) {
        const objective = this.objectives.find(obj => obj.id === objectiveId);
        if (objective) {
            objective.completed = !objective.completed;
            this.renderObjectives();
            await this.saveObjectives();
        }
    }

    async editObjective(objectiveId) {
        const objective = this.objectives.find(obj => obj.id === objectiveId);
        if (objective) {
            const newNote = prompt('Edit objective note:', objective.note);
            if (newNote !== null) {
                objective.note = newNote;
                this.renderObjectives();
                await this.saveObjectives();
            }
        }
    }

    async deleteObjective(objectiveId) {
        if (confirm('Are you sure you want to delete this objective?')) {
            this.objectives = this.objectives.filter(obj => obj.id !== objectiveId);
            this.renderObjectives();
            await this.saveObjectives();
        }
    }

    async moveObjective(objectiveId, direction) {
        const index = this.objectives.findIndex(obj => obj.id === objectiveId);
        if (index === -1) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.objectives.length) return;

        // Swap elements
        [this.objectives[index], this.objectives[newIndex]] = [this.objectives[newIndex], this.objectives[index]];
        this.renderObjectives();
        await this.saveObjectives();
    }

    async saveObjectives() {
        try {
            // Save to server
            await this.saveObjectivesToServer();
            
            // Also save to localStorage as backup
            const key = this.getStorageKey();
            localStorage.setItem(key, JSON.stringify(this.objectives));
        } catch (error) {
            log.error('Error saving objectives:', error);
            // Fallback to localStorage only
            try {
                const key = this.getStorageKey();
                localStorage.setItem(key, JSON.stringify(this.objectives));
            } catch (localError) {
                log.error('Error saving objectives to localStorage:', localError);
            }
        }
    }

    async loadObjectives() {
        try {
            // Try to load from server first
            await this.loadObjectivesFromServer();
        } catch (error) {
            log.warn('Error loading objectives from server, falling back to localStorage:', error);
            // Fallback to localStorage
            try {
                const key = this.getStorageKey();
                const saved = localStorage.getItem(key);
                if (saved) {
                    this.objectives = JSON.parse(saved);
                    this.renderObjectives();
                }
            } catch (localError) {
                log.error('Error loading objectives from localStorage:', localError);
                this.objectives = [];
            }
        }
    }

    async saveObjectivesToServer() {
        const isGlobalNotes = window.isGlobalNotes !== false;
        const currentSprintId = window.currentSprintId;
        
        let url;
        if (!isGlobalNotes && currentSprintId) {
            url = `/sprints/${currentSprintId}/objectives`;
        } else {
            url = '/objectives/global';
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ objectives: this.objectives })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        log.debug('Objectives saved to server successfully');
        return result;
    }

    async loadObjectivesFromServer() {
        const isGlobalNotes = window.isGlobalNotes !== false;
        const currentSprintId = window.currentSprintId;
        
        let url;
        if (!isGlobalNotes && currentSprintId) {
            url = `/sprints/${currentSprintId}/objectives`;
        } else {
            url = '/objectives/global';
        }
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Handle both old format (array) and new format (object with objectives array)
        if (Array.isArray(data)) {
            this.objectives = data;
        } else if (data.objectives && Array.isArray(data.objectives)) {
            this.objectives = data.objectives;
        } else {
            this.objectives = [];
        }
        
        this.renderObjectives();
        log.debug('Objectives loaded from server successfully', { count: this.objectives.length });
    }

    getStorageKey() {
        // Use the same context as notes (global or sprint-specific)
        // Access the global variables from the notes module
        const isGlobalNotes = window.isGlobalNotes !== false;
        const currentSprintId = window.currentSprintId;
        
        if (isGlobalNotes || !currentSprintId) {
            return 'objectives-global';
        } else {
            return `objectives-sprint-${currentSprintId}`;
        }
    }

    openIssueInJira(issueKey) {
        if (!issueKey) return;
        
        // Get Jira URL from meta tag (same pattern as worklog links)
        const jiraUrlMeta = document.querySelector('meta[name="jira-url"]');
        if (jiraUrlMeta) {
            const jiraUrl = jiraUrlMeta.getAttribute('content');
            const issueUrl = `https://${jiraUrl}/browse/${issueKey}`;
            window.open(issueUrl, '_blank');
        } else {
            console.warn('Jira URL meta tag not found');
        }
    }

    // Method to update context when notes context changes
    async updateContext(isGlobal, sprintId) {
        // Reload objectives with new context
        await this.loadObjectives();
    }
}

// Initialize objectives manager
const objectivesManager = new ObjectivesManager();

// Export for use in other modules
export { objectivesManager };

// Make it globally available
window.objectivesManager = objectivesManager;
