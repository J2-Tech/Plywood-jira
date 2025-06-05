const fs = require('fs').promises;
const path = require('path');
const settingsService = require('./settingsService');
const configController = require('./configController');

// Store global notes in a JSON file in the user's config directory
const GLOBAL_NOTES_FILENAME = 'global-notes.json';

/**
 * Get the file path for the user's global notes
 */
async function getGlobalNotesFilePath(req) {
    try {
        if (!req) {
            throw new Error('Request object is required for getGlobalNotesFilePath');
        }
        
        const configDir = await configController.ensureConfigDirExists(req);
        
        if (!configDir) {
            throw new Error('Config directory path is undefined');
        }
        
        return path.join(configDir, GLOBAL_NOTES_FILENAME);
    } catch (error) {
        console.error('Error getting global notes file path:', error);
        // Fallback to a default directory if possible
        const userId = req && settingsService._getUserId(req) || 'anonymous';
        const fallbackDir = path.join(__dirname, '..', 'config', 'users', userId);
        
        // Create the fallback directory
        try {
            await fs.mkdir(fallbackDir, { recursive: true });
        } catch (dirError) {
            console.error('Error creating fallback directory:', dirError);
        }
        
        return path.join(fallbackDir, GLOBAL_NOTES_FILENAME);
    }
}

/**
 * Load global notes for the user
 */
exports.getGlobalNotes = async function(req) {
    try {
        const filePath = await getGlobalNotesFilePath(req);
        
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist yet, return empty notes
                return { content: '' };
            }
            throw error;
        }
    } catch (error) {
        console.error('Error loading global notes:', error);
        throw error;
    }
};

/**
 * Save global notes content
 */
exports.saveGlobalNotes = async function(req, content) {
    try {
        const filePath = await getGlobalNotesFilePath(req);
        
        const notes = {
            content: content,
            updated: new Date().toISOString()
        };
        
        // Save the updated notes
        await fs.writeFile(filePath, JSON.stringify(notes, null, 2), 'utf8');
        
        return notes;
    } catch (error) {
        console.error('Error saving global notes:', error);
        throw error;
    }
};
