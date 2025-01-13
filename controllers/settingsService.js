const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { Mutex } = require('async-mutex');

// Minimal fallback defaults in case file can't be loaded
const minimalDefaults = {
    showIssueTypeIcons: true,
    themeSelection: 'auto',
    roundingInterval: 15,  
    issueColors: {},
    selectedProject: 'all'
};

class FileSettingsStore {
    constructor() {
        this.mutexes = new Map();
        this.configDir = path.join(__dirname, '..', 'config', 'users');
        this.oldConfigPath = path.join(__dirname, '..', 'config', 'settings.json');
        this.defaultsPath = path.join(__dirname, '..', 'config', 'defaults.json');
        this.cachedDefaults = null;
        
        if (!fsSync.existsSync(this.configDir)) {
            fsSync.mkdirSync(this.configDir, { recursive: true });
        }
        
        this.loadDefaults();
        this.migrateOldConfig();
    }

    async loadDefaults() {
        try {
            if (fsSync.existsSync(this.defaultsPath)) {
                const data = await fs.readFile(this.defaultsPath, 'utf8');
                this.cachedDefaults = JSON.parse(data);
            } else {
                this.cachedDefaults = minimalDefaults;
                // Create defaults.json with minimal defaults
                await fs.writeFile(
                    this.defaultsPath, 
                    JSON.stringify(minimalDefaults, null, 2), 
                    'utf8'
                );
            }
        } catch (error) {
            console.error('Error loading defaults:', error);
            this.cachedDefaults = minimalDefaults;
        }
    }

    async getSettings(userId) {
        const mutex = this._getUserMutex(userId);
        if (mutex.isLocked()) {
            return { ...this.cachedDefaults };
        }
        
        const release = await mutex.acquire();
        try {
            const userConfigPath = this._getUserConfigPath(userId);
            
            // Load user config if exists
            const exists = await fs.access(userConfigPath).then(() => true).catch(() => false);
            if (!exists) {
                return { ...this.cachedDefaults };
            }
            
            const data = await fs.readFile(userConfigPath, 'utf8');
            const userConfig = JSON.parse(data);
            
            // Merge with defaults
            return {
                ...this.cachedDefaults,
                ...userConfig,
                issueColors: {
                    ...this.cachedDefaults.issueColors,
                    ...userConfig.issueColors
                }
            };
        } catch (error) {
            console.error(`Error reading settings for user ${userId}:`, error);
            return { ...this.cachedDefaults };
        } finally {
            release();
            this._cleanupMutex(userId);
        }
    }

    async setSetting(userId, key, value) {
        const mutex = this._getUserMutex(userId);
        if (mutex.isLocked()) {
            throw new Error('Settings are currently being updated');
        }

        const release = await mutex.acquire();
        try {
            const userConfigPath = this._getUserConfigPath(userId);
            const currentConfig = await this.getSettings(userId);
            currentConfig[key] = value;
            await fs.writeFile(userConfigPath, JSON.stringify(currentConfig, null, 2), 'utf8');
            return currentConfig;
        } finally {
            release();
            this._cleanupMutex(userId);
        }
    }

    async updateSettings(userId, settings) {
        const mutex = this._getUserMutex(userId);
        if (mutex.isLocked()) {
            throw new Error('Settings are currently being updated');
        }

        const release = await mutex.acquire();
        try {
            const userConfigPath = this._getUserConfigPath(userId);
            const currentConfig = await this.getSettings(userId);
            
            // Properly merge settings, especially for nested objects
            const newConfig = {
                ...currentConfig,
                ...settings,
                issueColors: {
                    ...currentConfig.issueColors,
                    ...settings.issueColors
                }
            };

            await fs.writeFile(
                userConfigPath, 
                JSON.stringify(newConfig, null, 2), 
                'utf8'
            );
            return newConfig;
        } finally {
            release();
            this._cleanupMutex(userId);
        }
    }

    async migrateOldConfig() {
        try {
            if (fsSync.existsSync(this.oldConfigPath)) {
                const oldConfig = JSON.parse(fsSync.readFileSync(this.oldConfigPath, 'utf8'));
                // Save old config as defaults if defaults don't exist
                if (!fsSync.existsSync(this.defaultsPath)) {
                    fsSync.writeFileSync(this.defaultsPath, JSON.stringify(oldConfig, null, 2), 'utf8');
                }
                const backupPath = this.oldConfigPath + '.bak';
                fsSync.renameSync(this.oldConfigPath, backupPath);
            }
        } catch (error) {
            console.error('Error migrating old config:', error);
        }
    }

    _getUserMutex(userId) {
        if (!this.mutexes.has(userId)) {
            this.mutexes.set(userId, new Mutex());
        }
        return this.mutexes.get(userId);
    }

    _cleanupMutex(userId) {
        const mutex = this.mutexes.get(userId);
        if (mutex && !mutex.isLocked()) {
            this.mutexes.delete(userId);
        }
    }

    _getUserConfigPath(userId) {
        const safeUserId = userId.replace(/[^a-zA-Z0-9]/g, '_');
        return path.join(this.configDir, `${safeUserId}.json`);
    }
}

class SettingsService {
    constructor() {
        this.store = new FileSettingsStore();
    }

    async getSettings(req) {
        const userId = this._getUserId(req);
        if (!userId) {
            return minimalDefaults;
        }
        return await this.store.getSettings(userId);
    }

    async setSetting(req, key, value) {
        const userId = this._getUserId(req);
        if (!userId) {
            throw new Error('No user identified');
        }
        return await this.store.setSetting(userId, key, value);
    }

    async updateSettings(req, settings) {
        const userId = this._getUserId(req);
        if (!userId) {
            throw new Error('No user identified');
        }
        return await this.store.updateSettings(userId, settings);
    }

    _getUserId(req) {
        if (process.env.JIRA_AUTH_TYPE === "OAUTH") {
            if (!req?.user?.email) {
                return null;
            }
            return req.user.email;
        }
        return process.env.JIRA_BASIC_AUTH_USERNAME;
    }
}

module.exports = new SettingsService();