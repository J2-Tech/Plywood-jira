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
        
        if (!fsSync.existsSync(this.configDir)) {
            fsSync.mkdirSync(this.configDir, { recursive: true });
        }
    }

    async initialize() {
        await this.loadDefaults();
        await this.migrateOldConfig();
    }

    async loadDefaults() {
        try {
            if (fsSync.existsSync(this.defaultsPath)) {
                const data = await fs.readFile(this.defaultsPath, 'utf8');
                return { ...minimalDefaults, ...JSON.parse(data) };
            }
            return { ...minimalDefaults };
        } catch (error) {
            console.error('Error loading defaults:', error);
            return { ...minimalDefaults };
        }
    }

    async getSettings(userId) {
        const mutex = this._getUserMutex(userId);
        if (mutex.isLocked()) {
            return { ...minimalDefaults };
        }
        
        const release = await mutex.acquire();
        try {
            const userConfigPath = this._getUserConfigPath(userId);
            
            try {
                // Check if user config exists
                const exists = await fs.access(userConfigPath).then(() => true).catch(() => false);
                if (!exists) {
                    // Only use defaults for new users
                    const defaults = await this.loadDefaults();
                    await fs.writeFile(userConfigPath, JSON.stringify(defaults, null, 2), 'utf8');
                    return { ...defaults };
                }

                // Load existing user config
                const data = await fs.readFile(userConfigPath, 'utf8');
                return { ...minimalDefaults, ...JSON.parse(data) };
            } catch (error) {
                console.error(`Error reading settings for user ${userId}:`, error);
                return { ...minimalDefaults };
            }
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
            await fs.writeFile(userConfigPath, JSON.stringify(settings, null, 2), 'utf8');
            return settings;
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
        this.cache = new Map(); // Add settings cache per user
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes TTL
        this.initialized = false;
        this.initPromise = null;
    }

    async initialize() {
        if (!this.initialized) {
            if (!this.initPromise) {
                this.initPromise = this.store.initialize();
            }
            await this.initPromise;
            this.initialized = true;
        }
    }

    async getSettings(req) {
        await this.initialize();
        const userId = this._getUserId(req);
        if (!userId) {
            return minimalDefaults;
        }

        // Check cache first
        const cached = this.cache.get(userId);
        if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
            return cached.settings;
        }

        // Get from store and cache
        const settings = await this.store.getSettings(userId);
        this.cache.set(userId, {
            settings,
            timestamp: Date.now()
        });
        return settings;
    }

    async setSetting(req, key, value) {
        await this.initialize();
        const userId = this._getUserId(req);
        if (!userId) {
            throw new Error('No user identified');
        }
        return await this.store.setSetting(userId, key, value);
    }

    async updateSettings(req, settings) {
        await this.initialize();
        const userId = this._getUserId(req);
        if (!userId) {
            throw new Error('No user identified');
        }
        const newSettings = await this.store.updateSettings(userId, settings);
        
        // Update cache
        this.cache.set(userId, {
            settings: newSettings,
            timestamp: Date.now()
        });
        return newSettings;
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