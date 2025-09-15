const fs = require('fs').promises;
const path = require('path');
const configController = require('./configController');
const { log } = require('../utils/logger');

/**
 * Get the path to the objectives file
 * @param {Object} req - Express request object
 * @param {string} sprintId - Optional sprint ID for sprint-specific objectives
 * @returns {Promise<string>} - Path to the objectives file
 */
async function getObjectivesFilePath(req, sprintId = null) {
    try {
        const configDir = await configController.ensureConfigDirExists(req);
        
        if (sprintId) {
            // Sprint-specific objectives
            return path.join(configDir, `objectives-sprint-${sprintId}.json`);
        } else {
            // Global objectives
            return path.join(configDir, 'objectives-global.json');
        }
    } catch (error) {
        log.error('Error getting objectives file path:', error);
        // Fallback to a default directory if possible
        try {
            const fallbackDir = path.join(__dirname, '..', 'config', 'users', 'default');
            await fs.mkdir(fallbackDir, { recursive: true });
            return sprintId ? 
                path.join(fallbackDir, `objectives-sprint-${sprintId}.json`) :
                path.join(fallbackDir, 'objectives-global.json');
        } catch (dirError) {
            log.error('Error creating fallback directory:', dirError);
            throw new Error('Unable to create objectives storage directory');
        }
    }
}

/**
 * Load objectives from file
 * @param {Object} req - Express request object
 * @param {string} sprintId - Optional sprint ID for sprint-specific objectives
 * @returns {Promise<Array>} - Array of objectives
 */
async function loadObjectives(req, sprintId = null) {
    try {
        const filePath = await getObjectivesFilePath(req, sprintId);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            // File doesn't exist, return empty array
            return [];
        }
        
        const fileContent = await fs.readFile(filePath, 'utf8');
        const objectives = JSON.parse(fileContent);
        
        log.debug('Loaded objectives', { count: objectives.length, sprintId });
        
        return objectives;
    } catch (error) {
        log.error('Error loading objectives:', error);
        throw error;
    }
}

/**
 * Save objectives to file
 * @param {Object} req - Express request object
 * @param {Array} objectives - Array of objectives to save
 * @param {string} sprintId - Optional sprint ID for sprint-specific objectives
 * @returns {Promise<Array>} - Saved objectives
 */
async function saveObjectives(req, objectives, sprintId = null) {
    try {
        const filePath = await getObjectivesFilePath(req, sprintId);
        
        // Ensure directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        // Add metadata
        const objectivesData = {
            objectives: objectives,
            lastModified: new Date().toISOString(),
            sprintId: sprintId
        };
        
        await fs.writeFile(filePath, JSON.stringify(objectivesData, null, 2), 'utf8');
        
        log.info('Objectives saved successfully', { count: objectives.length, sprintId });
        
        return objectivesData;
    } catch (error) {
        log.error('Error saving objectives:', error);
        throw error;
    }
}

/**
 * Load global objectives
 * @param {Object} req - Express request object
 * @returns {Promise<Array>} - Array of global objectives
 */
async function loadGlobalObjectives(req) {
    return await loadObjectives(req, null);
}

/**
 * Save global objectives
 * @param {Object} req - Express request object
 * @param {Array} objectives - Array of objectives to save
 * @returns {Promise<Object>} - Saved objectives data
 */
async function saveGlobalObjectives(req, objectives) {
    return await saveObjectives(req, objectives, null);
}

/**
 * Load sprint-specific objectives
 * @param {Object} req - Express request object
 * @param {string} sprintId - Sprint ID
 * @returns {Promise<Array>} - Array of sprint objectives
 */
async function loadSprintObjectives(req, sprintId) {
    return await loadObjectives(req, sprintId);
}

/**
 * Save sprint-specific objectives
 * @param {Object} req - Express request object
 * @param {string} sprintId - Sprint ID
 * @param {Array} objectives - Array of objectives to save
 * @returns {Promise<Object>} - Saved objectives data
 */
async function saveSprintObjectives(req, sprintId, objectives) {
    return await saveObjectives(req, objectives, sprintId);
}

module.exports = {
    loadGlobalObjectives,
    saveGlobalObjectives,
    loadSprintObjectives,
    saveSprintObjectives,
    loadObjectives,
    saveObjectives
};
