const fs = require('fs').promises;
const path = require('path');
const configController = require('./configController');
const { log } = require('../utils/logger');

/**
 * Get the path to the notes file
 * @param {Object} req - Express request object
 * @returns {Promise<string>} - Path to the notes file
 */
async function getNotesFilePath(req) {
    // Make sure we await the config loading
    await configController.ensureConfigDirExists(req);
    const configDir = await configController.getConfigDir(req);
    return path.join(configDir, 'global-notes.json');
}

/**
 * Load global notes from file
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} - Notes data
 */
async function getGlobalNotes(req) {
    try {
        // Await the file path resolution
        const notesPath = await getNotesFilePath(req);
        
        // Check if file exists
        try {
            await fs.access(notesPath);
        } catch (error) {
            // File doesn't exist, return empty notes structure
            return {
                content: '',
                lastModified: null
            };
        }
        
        const data = await fs.readFile(notesPath, 'utf8');
        const notes = JSON.parse(data);
        
        log.trace('Loaded raw notes data');
        
        // Handle different data formats for backward compatibility
        let content = '';
        let lastModified = notes.updated || notes.lastModified || null;
        
        if (typeof notes.content === 'string') {
            // Old format: plain text content
            content = notes.content;
        } else if (notes.content && typeof notes.content === 'object') {
            // New format: EditorJS data structure
            content = notes.content;
        } else if (typeof notes === 'string') {
            // Very old format: just a string
            content = notes;
        }
        
        log.debug('Processed notes content');
        
        return {
            content,
            lastModified
        };
    } catch (error) {
        log.error('Error loading global notes:', error);
        throw new Error('Failed to load global notes');
    }
}

/**
 * Save global notes to file
 * @param {Object} req - Express request object
 * @param {Object|string} content - Editor content (can be EditorJS data object or plain text)
 * @returns {Promise<Object>} - Saved notes data
 */
async function saveGlobalNotes(req, content) {
    try {
        // Await the file path resolution
        const notesPath = await getNotesFilePath(req);
        
        const notesData = {
            content: content,
            updated: new Date().toISOString(), // Keep 'updated' for backward compatibility
            lastModified: new Date().toISOString()
        };
        
        log.trace('Saving notes data');
        
        await fs.writeFile(notesPath, JSON.stringify(notesData, null, 2), 'utf8');
        
        log.info('Global notes saved successfully');
        return notesData;
    } catch (error) {
        log.error('Error saving global notes:', error);
        throw new Error('Failed to save global notes');
    }
}

module.exports = {
    getGlobalNotes,
    saveGlobalNotes
};
