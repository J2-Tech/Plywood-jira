// Custom Tiptap extension for issue references
import { Node, mergeAttributes } from 'https://esm.sh/@tiptap/core';

export const IssueReference = Node.create({
    name: 'issueReference',

    group: 'inline',

    inline: true,

    atom: true,

    content: '',

    marks: '',

    addAttributes() {
        return {
            issueKey: {
                default: null,
                parseHTML: element => element.getAttribute('data-issue-key'),
                renderHTML: attributes => {
                    if (!attributes.issueKey) {
                        return {};
                    }
                    return {
                        'data-issue-key': attributes.issueKey,
                    };
                },
            },
            issueSummary: {
                default: null,
                parseHTML: element => element.getAttribute('data-issue-summary'),
                renderHTML: attributes => {
                    if (!attributes.issueSummary) {
                        return {};
                    }
                    return {
                        'data-issue-summary': attributes.issueSummary,
                    };
                },
            },
            issueId: {
                default: null,
                parseHTML: element => element.getAttribute('data-issue-id'),
                renderHTML: attributes => {
                    if (!attributes.issueId) {
                        return {};
                    }
                    return {
                        'data-issue-id': attributes.issueId,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-issue-key]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        // Debug logging
        console.log('IssueReference renderHTML:', HTMLAttributes);
        
        // Extract attributes from HTMLAttributes
        const issueKey = HTMLAttributes['data-issue-key'] || '';
        const issueSummary = HTMLAttributes['data-issue-summary'] || '';
        const issueId = HTMLAttributes['data-issue-id'] || '';
        
        return [
            'span',
            mergeAttributes(
                {
                    class: 'issue-reference',
                    'data-issue-key': issueKey,
                    'data-issue-summary': issueSummary,
                    'data-issue-id': issueId,
                    title: issueSummary ? `${issueKey}: ${issueSummary}` : issueKey,
                },
                HTMLAttributes
            ),
            issueKey || 'ISSUE',
        ];
    },

    addCommands() {
        return {
            setIssueReference: (attributes) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        issueKey: attributes.issueKey || '',
                        issueSummary: attributes.issueSummary || '',
                        issueId: attributes.issueId || '',
                    },
                });
            },
        };
    },
});

// CSS styles for issue references
const issueReferenceStyles = `
.issue-reference {
    background: var(--primary-color-light, #e3f2fd);
    color: var(--primary-color, #1976d2) !important;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
    font-size: 0.85em;
    border: 1px solid var(--primary-color-light, #e3f2fd);
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 50px;
    min-height: 18px;
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    text-align: center;
}

.issue-reference:hover {
    background: var(--primary-color, #1976d2);
    color: white !important;
    border-color: var(--primary-color, #1976d2);
}

.issue-reference:focus {
    outline: 2px solid var(--primary-color, #1976d2);
    outline-offset: 1px;
}

/* Visual indication when modal with issue selection is open */
body.modal-with-issue-selection-open .issue-reference {
    animation: pulse-highlight 1.5s ease-in-out infinite;
    cursor: pointer;
}

body.modal-with-issue-selection-open .issue-reference:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(25, 118, 210, 0.4);
}

@keyframes pulse-highlight {
    0%, 100% {
        box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.5);
    }
    50% {
        box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.1);
    }
}
`;

// Inject styles into the document
if (typeof document !== 'undefined') {
    const styleElement = document.createElement('style');
    styleElement.textContent = issueReferenceStyles;
    document.head.appendChild(styleElement);
    
    // Add click functionality for issue references
    document.addEventListener('click', (e) => {
        const issueRef = e.target.closest('.issue-reference');
        if (issueRef) {
            e.preventDefault();
            const issueKey = issueRef.getAttribute('data-issue-key');
            
            if (issueKey) {
                const issueId = issueRef.getAttribute('data-issue-id');
                
                // If a modal with issue selection is open, copy issue to dropdown
                if (document.body.classList.contains('modal-with-issue-selection-open')) {
                    // Try to find which dropdown is open and populate it
                    const createModal = document.querySelector('.modal-create');
                    const timerModal = document.getElementById('timerModal');
                    
                    let targetChoices = null;
                    let targetSelectId = null;
                    
                    if (createModal && createModal.style.display === 'block') {
                        targetChoices = window.choicesCreate;
                        targetSelectId = 'issue-create';
                    } else if (timerModal && timerModal.style.display === 'block') {
                        targetChoices = window.choicesTimer;
                        targetSelectId = 'issue-timer';
                    }
                    
                    if (targetChoices && issueId) {
                        // First check if the issue is already in the choices
                        const existingChoices = targetChoices._currentState?.choices || targetChoices._store?.choices || [];
                        const foundChoice = existingChoices.find(c => c.value === issueId);
                        
                        if (foundChoice) {
                            // Issue is already loaded, select it
                            targetChoices.setChoiceByValue(issueId);
                            console.log(`Copied issue ${issueKey} to ${targetSelectId}`);
                        } else {
                            // Issue is not loaded, need to add it first
                            const issueKeyFromRef = issueRef.getAttribute('data-issue-key');
                            const issueSummary = issueRef.getAttribute('data-issue-summary') || '';
                            
                            // Add the issue to choices
                            targetChoices.setChoices([{
                                value: issueId,
                                label: `${issueKeyFromRef} - ${issueSummary}`,
                                customProperties: {
                                    key: issueKeyFromRef,
                                    issueKey: issueKeyFromRef,
                                    issueId: issueId,
                                    summary: issueSummary
                                }
                            }], 'value', 'label', false);
                            
                            // Then select it
                            targetChoices.setChoiceByValue(issueId);
                            console.log(`Added and selected issue ${issueKeyFromRef} in ${targetSelectId}`);
                        }
                    }
                } else {
                    // Normal behavior: open in Jira
                    const jiraUrlMeta = document.querySelector('meta[name="jira-url"]');
                    if (jiraUrlMeta) {
                        const jiraUrl = jiraUrlMeta.getAttribute('content');
                        const issueUrl = `https://${jiraUrl}/browse/${issueKey}`;
                        window.open(issueUrl, '_blank');
                    } else {
                        // Fallback if meta tag not found
                        console.warn('Jira URL meta tag not found');
                    }
                }
            }
        }
    });
}

export default IssueReference;
