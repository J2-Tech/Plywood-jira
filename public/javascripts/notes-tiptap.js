import { Editor } from 'https://esm.sh/@tiptap/core'
import StarterKit from 'https://esm.sh/@tiptap/starter-kit'
import { TextStyle } from 'https://esm.sh/@tiptap/extension-text-style'
import { Color } from 'https://esm.sh/@tiptap/extension-color'
import { Highlight } from 'https://esm.sh/@tiptap/extension-highlight'
import { Link } from 'https://esm.sh/@tiptap/extension-link'
import { TaskList } from 'https://esm.sh/@tiptap/extension-task-list'
import { TaskItem } from 'https://esm.sh/@tiptap/extension-task-item'
import { Underline } from 'https://esm.sh/@tiptap/extension-underline'
import { IssueReference } from './plywood/issueReferenceExtension.js'
class TiptapNotesManager {
    constructor() {
        this.editor = null;
        this.saveTimeout = null;
        this.currentContext = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        try {
            console.log('Initializing Tiptap editor...');
            
            const editorElement = document.getElementById('tiptapEditor');
            if (!editorElement) {
                console.error('Tiptap editor element not found');
                return;
            }

            // Create the editor with ESM imports
            this.editor = new Editor({
                element: editorElement,
                extensions: [
                    StarterKit,
                    TextStyle,
                    Color,
                    Highlight,
                    Underline,
                    Link.configure({
                        openOnClick: false,
                    }),
                    TaskList,
                    TaskItem.configure({
                        nested: true,
                    }),
                    IssueReference,
                ],
                content: '<p>Start writing your notes...</p>',
                onUpdate: ({ editor }) => {
                    this.scheduleAutoSave();
                },
                onCreate: ({ editor }) => {
                    console.log('Tiptap editor created successfully');
                    this.setupToolbar();
                    this.isInitialized = true;
                }
            });

            // Load initial content
            await this.loadNotes();

        } catch (error) {
            console.error('Failed to initialize Tiptap editor:', error);
        }
    }

    setupToolbar() {
        const toolbar = document.getElementById('tiptapToolbar');
        if (!toolbar) return;

        toolbar.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button || !this.editor) return;

            const action = button.dataset.action;
            this.handleToolbarAction(action, button);
        });
    }

    handleToolbarAction(action, button) {
        if (!this.editor) return;

        switch (action) {
            case 'bold':
                this.editor.chain().focus().toggleBold().run();
                break;
            case 'italic':
                this.editor.chain().focus().toggleItalic().run();
                break;
            case 'underline':
                this.editor.chain().focus().toggleUnderline().run(); 
                break;
            case 'strike':
                this.editor.chain().focus().toggleStrike().run();
                break;
            case 'heading1':
                this.editor.chain().focus().toggleHeading({ level: 1 }).run();
                break;
            case 'heading2':
                this.editor.chain().focus().toggleHeading({ level: 2 }).run();
                break;
            case 'heading3':
                this.editor.chain().focus().toggleHeading({ level: 3 }).run();
                break;
            case 'bulletList':
                this.editor.chain().focus().toggleBulletList().run();
                break;
            case 'orderedList':
                this.editor.chain().focus().toggleOrderedList().run();
                break;
            case 'taskList':
                this.editor.chain().focus().toggleTaskList().run();
                break;
            case 'blockquote':
                this.editor.chain().focus().toggleBlockquote().run();
                break;
            case 'codeBlock':
                this.editor.chain().focus().toggleCodeBlock().run();
                break;
            case 'link':
                this.insertLink();
                break;
            case 'removeLink':
                this.removeLink();
                break;
            case 'issueReference':
                this.insertIssueReference();
                break;
            case 'undo':
                this.editor.chain().focus().undo().run();
                break;
            case 'redo':
                this.editor.chain().focus().redo().run();
                break;
        }

        // Update button active states
        this.updateToolbarStates();
    }

    updateToolbarStates() {
        if (!this.editor) return;

        const toolbar = document.getElementById('tiptapToolbar');
        if (!toolbar) return;

        // Remove all active states
        toolbar.querySelectorAll('button').forEach(btn => {
            btn.classList.remove('active');
        });

        // Add active states based on current selection
        const activeButtons = [
            { action: 'bold', isActive: this.editor.isActive('bold') },
            { action: 'italic', isActive: this.editor.isActive('italic') },
            { action: 'underline', isActive: this.editor.isActive('underline') },
            { action: 'strike', isActive: this.editor.isActive('strike') },
            { action: 'heading1', isActive: this.editor.isActive('heading', { level: 1 }) },
            { action: 'heading2', isActive: this.editor.isActive('heading', { level: 2 }) },
            { action: 'heading3', isActive: this.editor.isActive('heading', { level: 3 }) },
            { action: 'bulletList', isActive: this.editor.isActive('bulletList') },
            { action: 'orderedList', isActive: this.editor.isActive('orderedList') },
            { action: 'taskList', isActive: this.editor.isActive('taskList') },
            { action: 'codeBlock', isActive: this.editor.isActive('codeBlock') },
            { action: 'link', isActive: this.editor.isActive('link') },
            { action: 'issueReference', isActive: this.editor.isActive('issueReference') },
        ];

        activeButtons.forEach(({ action, isActive }) => {
            if (isActive) {
                const button = toolbar.querySelector(`[data-action="${action}"]`);
                if (button) button.classList.add('active');
            }
        });
    }

    insertLink() {
        if (!this.editor) return;

        // Check if text is selected
        const { from, to } = this.editor.state.selection;
        
        if (from !== to) {
            // Text is selected, check if it contains a URL
            const selectedText = this.editor.state.doc.textBetween(from, to);
            const urlRegex = /(https?:\/\/[^\s]+)/i;
            const urlMatch = selectedText.match(urlRegex);
            
            if (urlMatch) {
                // Found URL in selected text, use it automatically
                const url = urlMatch[1];
                this.editor.chain().focus().setLink({ href: url }).run();
                return;
            }
        }

        // No URL found in selection or no text selected, prompt for URL
        const url = prompt('Enter URL:');
        if (url) {
            if (from === to) {
                // No text selected, insert URL as link text
                this.editor.chain().focus().setLink({ href: url }).insertContent(url).run();
            } else {
                // Text is selected, make it a link
                this.editor.chain().focus().setLink({ href: url }).run();
            }
        }
    }

    removeLink() {
        if (!this.editor) return;

        // Check if cursor is on a link
        const { from, to } = this.editor.state.selection;
        
        // If text is selected, check if it's a link
        if (from !== to) {
            const selectedText = this.editor.state.doc.textBetween(from, to);
            // Check if the selected text is part of a link
            const linkMark = this.editor.state.doc.rangeHasMark(from, to, this.editor.schema.marks.link);
            if (linkMark) {
                this.editor.chain().focus().unsetLink().run();
                return;
            }
        }
        
        // If no text is selected, check if cursor is on a link
        const linkMark = this.editor.state.doc.nodeAt(from)?.marks?.find(mark => mark.type.name === 'link');
        if (linkMark) {
            // Find the start and end of the link
            const linkStart = from;
            const linkEnd = from + this.editor.state.doc.nodeAt(from)?.nodeSize || from + 1;
            this.editor.chain().focus().setTextSelection({ from: linkStart, to: linkEnd }).unsetLink().run();
            return;
        }
        
        // If no link is found, show a message
        alert('No link found at cursor position. Please select text that contains a link or place your cursor on a link.');
    }

    async insertIssueReference() {
        if (!this.editor) return;

        // Check if text is selected
        const { from, to } = this.editor.state.selection;
        let issueKey = '';
        
        if (from !== to) {
            // Text is selected, use it as potential issue key
            issueKey = this.editor.state.doc.textBetween(from, to).trim();
            console.log('Using selected text as issue key:', issueKey);
        }
        
        // If no text selected or selected text is empty, prompt for issue key
        if (!issueKey) {
            issueKey = prompt('Enter issue key (e.g., PROJ-123):');
            if (!issueKey) return;
        }

        // Try to search for the issue to get more details
        try {
            const searchResults = await window.searchIssues(issueKey);
            const matchingIssue = searchResults.find(issue => 
                issue.customProperties.key.toLowerCase() === issueKey.toLowerCase()
            );

            if (matchingIssue) {
                // Insert issue reference with full details
                const attrs = {
                    issueKey: matchingIssue.customProperties.key || issueKey.toUpperCase(),
                    issueSummary: matchingIssue.customProperties.summary || '',
                    issueId: matchingIssue.customProperties.issueId || ''
                };
                console.log('Inserting issue reference with matching issue:', attrs);
                this.editor.chain().focus().setIssueReference(attrs).run();
            } else {
                // Issue not found in search results
                if (from !== to) {
                    // If text was selected but no matching issue found, ask user
                    const confirmUse = confirm(`No issue found for "${issueKey}". Use it as issue reference anyway?`);
                    if (!confirmUse) {
                        // User cancelled, prompt for different issue key
                        const newIssueKey = prompt('Enter issue key (e.g., PROJ-123):');
                        if (newIssueKey) {
                            // Recursively call with new issue key
                            this.editor.chain().focus().setTextSelection({ from, to }).run();
                            setTimeout(() => this.insertIssueReference(), 100);
                            return;
                        } else {
                            return;
                        }
                    }
                }
                
                // Insert basic issue reference
                const attrs = {
                    issueKey: issueKey.toUpperCase(),
                    issueSummary: '',
                    issueId: ''
                };
                console.log('Inserting issue reference without matching issue:', attrs);
                this.editor.chain().focus().setIssueReference(attrs).run();
            }
        } catch (error) {
            console.error('Error searching for issue:', error);
            // Insert basic issue reference as fallback
            const attrs = {
                issueKey: issueKey.toUpperCase(),
                issueSummary: '',
                issueId: ''
            };
            console.log('Inserting issue reference as fallback:', attrs);
            this.editor.chain().focus().setIssueReference(attrs).run();
        }
    }

    async loadNotes() {
        try {
            const response = await fetch('/notes/global');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Loaded notes data:', data);
            
            if (data && data.content) {
                this.setContent(data.content);
            }
        } catch (error) {
            console.error('Error loading global notes:', error);
            this.showSaveStatus('Error loading notes', 'error');
        }
    }

    setContent(content) {
        if (!this.editor) return;

        try {
            if (typeof content === 'string') {
                this.editor.commands.setContent(content);
            } else if (content && typeof content === 'object') {
                // If it's HTML or JSON data, try to set it
                this.editor.commands.setContent(content);
            }
        } catch (error) {
            console.error('Error setting content:', error);
            // Fallback to plain text
            this.editor.commands.setContent(`<p>${String(content)}</p>`);
        }
    }

    getContent() {
        if (!this.editor) return '';
        return this.editor.getHTML();
    }

    scheduleAutoSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.saveNotes();
        }, 2000);
    }

    async saveNotes() {
        try {
            const content = this.getContent();
            
            this.showSaveStatus('Saving...', 'saving');
            
            const response = await fetch('/notes/global', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Notes saved successfully:', result);
            this.showSaveStatus('Saved', 'saved');
            
        } catch (error) {
            console.error('Error saving notes:', error);
            this.showSaveStatus('Save failed', 'error');
        }
    }

    showSaveStatus(message, type = 'info') {
        const indicator = document.getElementById('saveIndicator');
        if (indicator) {
            indicator.textContent = message;
            indicator.className = `save-indicator ${type}`;
            indicator.classList.remove('hidden');
            
            if (type === 'saved' || type === 'error') {
                setTimeout(() => {
                    indicator.classList.add('hidden');
                }, 3000);
            }
        }
    }

    destroy() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        if (this.editor) {
            this.editor.destroy();
            this.editor = null;
        }
        
        this.isInitialized = false;
    }
}

// Initialize the Tiptap notes manager
const tiptapNotesManager = new TiptapNotesManager();

// Make it globally available
window.tiptapNotesManager = tiptapNotesManager;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing Tiptap notes manager');
    tiptapNotesManager.init();
});

export { tiptapNotesManager };
