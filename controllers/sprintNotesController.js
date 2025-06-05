const fs = require('fs').promises;
const path = require('path');
const settingsService = require('./settingsService');
const configController = require('./configController');

// Store notes in a JSON file in the user's config directory
const NOTES_FILENAME = 'sprint-notes.json';

/**
 * Get the file path for the user's sprint notes
 */
async function getNotesFilePath(req) {
    try {
        if (!req) {
            throw new Error('Request object is required for getNotesFilePath');
        }
        
        const configDir = await configController.ensureConfigDirExists(req);
        
        if (!configDir) {
            throw new Error('Config directory path is undefined');
        }
        
        return path.join(configDir, NOTES_FILENAME);
    } catch (error) {
        console.error('Error getting sprint notes file path:', error);
        // Fallback to a default directory if possible
        const userId = req && settingsService._getUserId(req) || 'anonymous';
        const fallbackDir = path.join(__dirname, '..', 'config', 'users', userId);
        
        // Create the fallback directory
        try {
            await fs.mkdir(fallbackDir, { recursive: true });
        } catch (dirError) {
            console.error('Error creating fallback directory:', dirError);
        }
        
        return path.join(fallbackDir, NOTES_FILENAME);
    }
}

/**
 * Load all sprint notes for the user
 */
exports.getAllSprintNotes = async function(req) {
    try {
        const filePath = await getNotesFilePath(req);
        
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist yet, return empty notes
                return { sprints: {} };
            }
            throw error;
        }
    } catch (error) {
        console.error('Error loading sprint notes:', error);
        throw error;
    }
};

/**
 * Get notes for a specific sprint
 */
exports.getSprintNotes = async function(req, sprintId) {
    try {
        const allNotes = await exports.getAllSprintNotes(req);
        return allNotes.sprints[sprintId] || { content: '' };
    } catch (error) {
        console.error(`Error loading notes for sprint ${sprintId}:`, error);
        throw error;
    }
};

/**
 * Save sprint notes content
 */
exports.saveSprintNotes = async function(req, sprintId, content) {
    try {
        const filePath = await getNotesFilePath(req);
        const allNotes = await exports.getAllSprintNotes(req);
        
        // Ensure the sprint entry exists
        if (!allNotes.sprints[sprintId]) {
            allNotes.sprints[sprintId] = {};
        }
        
        // Update the content
        allNotes.sprints[sprintId].content = content;
        allNotes.sprints[sprintId].updated = new Date().toISOString();
        
        // Save the updated notes
        await fs.writeFile(filePath, JSON.stringify(allNotes, null, 2), 'utf8');
        
        return allNotes.sprints[sprintId];
    } catch (error) {
        console.error(`Error saving notes for sprint ${sprintId}:`, error);
        throw error;
    }
};
