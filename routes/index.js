const express = require('express');
const router = express.Router();

const jiraController= require('../controllers/jiraController');
const jiraAPIController = require('../controllers/jiraAPIController');
const sprintNotesController = require('../controllers/sprintNotesController');
const globalNotesController = require('../controllers/globalNotesController');
const getUsersWorkLogsModule = require('../controllers/getUsersWorkLogsAsEvent');

// Get access to the clearWorklogCache function 
const { clearWorklogCache } = getUsersWorkLogsModule;


if (process.env.JIRA_AUTH_TYPE == "OAUTH") { 
  const authMiddleware = require('../middlewares/authenticationMiddleware');
  router.use(authMiddleware);  
}

/* GET home page. */
router.get(['/', '/index'], function(req, res, next) {
  res.render('index', { title: 'Jira Time', jiraUrl: process.env.JIRA_URL});
});

router.get('/events/:worklogId', function(req, res, next) {
  try {
    jiraController.getSingleEvent(req, req.query.issueId, req.params.worklogId)
      .then(result => {
        res.json(result);
      })
      .catch(error => {
        console.log(error);
        if (error.authFailure) {
          return res.status(401).json({ error: 'Authentication required', redirect: '/auth/login' });
        }
        res.status(500).json({ error: 'Failed to fetch worklog' });
      });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/events', function(req, res, next) {
  try {
    // Set strong no-cache headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': Date.now().toString() // Force ETag to change every time
    });
    
    // Special handling for the HEAD request with clearWorklogCache flag 
    if (req.method === 'HEAD' && req.query._clearWorklogCache) {
      console.log('Received explicit request to clear worklog cache for issue:', req.query.issueKey || 'all issues');
      // Just clear the cache and return empty response
      clearWorklogCache();
      return res.end();
    }
    
    // Check if this is a force refresh request
    const shouldRefreshColors = req.query._forceRefresh || req.query._forceClearCache || req.query._clearWorklogCache;
      // If force refresh requested, refresh all colors first
    const getEvents = shouldRefreshColors 
      ? jiraController.forceRefreshIssueColors(req).then(() => 
          getUsersWorkLogsModule.getUsersWorkLogsAsEvent(req, req.query.start, req.query.end)
        )
      : getUsersWorkLogsModule.getUsersWorkLogsAsEvent(req, req.query.start, req.query.end);
    
    getEvents.then(result => {
        // Add timestamp to ensure cache busting
        result._timestamp = Date.now();
        // Maintain compatibility with FullCalendar
        res.json(result);
      })
      .catch(error => {
        console.log(error);
        if (error.authFailure) {
          return res.status(401).json({ error: 'Authentication required', redirect: '/auth/login' });
        }
        res.status(500).json({ error: 'Failed to fetch events' });
      });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/issues/user', function(req, res, next) {
  try {
    jiraController.suggestIssues(req, req.query.start, req.query.end, req.query.query)
      .then(result => {
        res.json(result);
      })
      .catch(error => {
        console.error('Error in /issues/user:', error);
        if (error.authFailure) {
          return res.status(401).json({ error: 'Authentication required', redirect: '/auth/login' });
        }
        res.status(500).json({ error: 'Failed to search issues' });
      });
  } catch (error) {
    console.error('Error in /issues/user route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/issues/:issueId', function(req, res, next) { 
  try {
    jiraAPIController.getIssue(req, req.params.issueId).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});

router.get('/issues/:issueId/color', async function(req, res) {
    try {
        const color = await jiraAPIController.getIssueColor(req, req.params.issueId);
        res.json({ color });
    } catch (error) {
        console.error('Error getting issue color:', error);
        res.status(500).json({ error: 'Failed to get issue color' });
    }
});

router.get('/worklog/:worklogId', function(req, res, next) {
  try {
    jiraAPIController.getWorkLog(req, req.query.issueId, req.params.worklogId).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});

router.get('/projects', async function(req, res, next) {
    try {
        const projects = await jiraAPIController.getProjects(req);
        res.json(projects);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

router.get('/projects/sprints', async function(req, res, next) {
    try {
        const sprints = await jiraAPIController.getSprints(req);
        res.json(sprints);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Failed to fetch sprints' });
    }
});

router.get('/projects/:projectKey/avatar', async function(req, res) {
    try {
        const color = await jiraAPIController.getProjectAvatar(req, req.params.projectKey);
        res.json({ color });
    } catch (error) {
        console.error('Error fetching project avatar:', error);
        res.status(500).json({ error: 'Failed to fetch project avatar' });
    }
});

router.get('/issuetypes/:issueTypeId/avatar', async function(req, res) {
    try {
        const avatarData = await jiraAPIController.getIssueTypeAvatar(req, req.params.issueTypeId);
        res.json(avatarData);
    } catch (error) {
        console.error('Error fetching issue type avatar:', error);
        res.status(500).json({ error: 'Failed to fetch issue type avatar' });
    }
});

router.get('/avatars/issuetype/:issueTypeId', async function(req, res) {
    try {
        const { issueTypeId } = req.params;
        const size = req.query.size || 'medium';
        const fallback = req.query.fallback === 'true';
        
        let avatarResult = null;
        
        // Try to proxy the actual avatar first (unless fallback is explicitly requested)
        if (!fallback) {
            console.log(`Proxying avatar for issue type ${issueTypeId}, size: ${size}`);
            avatarResult = await jiraAPIController.proxyIssueTypeAvatarImage(req, issueTypeId, size);
            
            if (avatarResult && avatarResult.buffer) {
                console.log(`Successfully proxied avatar for issue type ${issueTypeId}`);
                
                // Set appropriate headers for proxied image
                res.setHeader('Content-Type', avatarResult.contentType);
                res.setHeader('Cache-Control', 'public, max-age=1800'); // Cache for 30 minutes
                res.setHeader('Content-Length', avatarResult.buffer.length);
                
                return res.send(avatarResult.buffer);
            } else {
                console.log(`No avatar data proxied for issue type ${issueTypeId}, will generate fallback`);
            }
        }
        
        // Generate fallback if proxy failed or was requested
        console.log(`Generating fallback avatar for issue type ${issueTypeId}`);
        
        // Try to get issue type name for a better fallback
        let issueTypeName = 'Unknown';
        try {
            const avatarData = await jiraAPIController.getIssueTypeAvatar(req, issueTypeId);
            if (avatarData && avatarData.name) {
                issueTypeName = avatarData.name;
            }
        } catch (error) {
            console.warn(`Could not get issue type name for fallback: ${error.message}`);
        }
        
        const sizeMap = { 'xsmall': 16, 'small': 24, 'medium': 32, 'large': 48 };
        const pixelSize = sizeMap[size] || 32;
        
        const fallbackBuffer = jiraAPIController.generateFallbackIssueTypeIcon(issueTypeName, pixelSize);
        
        // Set appropriate headers for SVG fallback
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache fallbacks longer
        res.setHeader('Content-Length', fallbackBuffer.length);
        res.setHeader('Content-Disposition', `inline; filename="issuetype-${issueTypeId}-${size}-fallback.svg"`);
        
        res.send(fallbackBuffer);
        
    } catch (error) {
        console.error('Error serving issue type avatar:', error);
        
        // Generate a generic fallback as last resort
        try {
            const sizeMap = { 'xsmall': 16, 'small': 24, 'medium': 32, 'large': 48 };
            const pixelSize = sizeMap[req.query.size] || 32;
            const emergencyBuffer = jiraAPIController.generateFallbackIssueTypeIcon('?', pixelSize);
            
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'public, max-age=300'); // Shorter cache for errors
            res.send(emergencyBuffer);
        } catch (fallbackError) {
            console.error('Even fallback generation failed:', fallbackError);
            res.status(500).json({ error: 'Failed to serve avatar' });
        }
    }
});

router.get('/cached-icons/info', async function(req, res) {
    try {
        const info = jiraAPIController.getCachedIconsInfo();
        res.json({
            totalCached: info.length,
            icons: info
        });
    } catch (error) {
        console.error('Error getting cached icons info:', error);
        res.status(500).json({ error: 'Failed to get cache info' });
    }
});

router.post('/cached-icons/cleanup', async function(req, res) {
    try {
        await jiraAPIController.cleanupIconCache();
        res.json({ success: true, message: 'Cache cleanup completed' });
    } catch (error) {
        console.error('Error cleaning up icon cache:', error);
        res.status(500).json({ error: 'Failed to cleanup cache' });
    }
});

router.get('/issues/:issueId/icon', async function(req, res) {
    try {
        // Get issue details to extract issue type icon
        const issue = await jiraAPIController.getIssue(req, req.params.issueId);
        
        if (!issue || !issue.fields || !issue.fields.issuetype) {
            return res.status(404).json({ error: 'Issue or issue type not found' });
        }
        
        const issueType = issue.fields.issuetype;
        
        // Get avatar data which includes our proxy URLs
        const avatarData = await jiraAPIController.getIssueTypeAvatar(req, issueType.id);
        
        res.json({
            issueTypeId: issueType.id,
            issueTypeName: issueType.name,
            originalIconUrl: issueType.iconUrl,
            localIconUrl: avatarData.avatarUrls ? avatarData.avatarUrls['24x24'] : null,
            avatarUrls: avatarData.avatarUrls, // Include all proxy URLs
            cached: true // Since we're using our proxy system
        });
        
    } catch (error) {
        console.error('Error getting issue icon:', error);
        res.status(500).json({ error: 'Failed to get issue icon' });
    }
});

router.put('/worklog/:worklogId', async function(req, res, next) {
  try {
    if (!req.body.issueId || !req.body.startTime || !req.body.endTime) {
      return res.status(400).json({ 
        error: 'Missing required fields: issueId, startTime, or endTime' 
      });
    }
    
    // Validate dates
    const startDate = new Date(req.body.startTime);
    const endDate = new Date(req.body.endTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    
    const result = await jiraController.updateWorkLog(
      req, 
      req.body.issueId, 
      req.params.worklogId, 
      req.body.comment, 
      req.body.startTime, 
      req.body.endTime, 
      req.body.issueKeyColor
    );
    
    // Check if the result contains JIRA API errors
    if (result.errorMessages && result.errorMessages.length > 0) {
      return res.status(400).json({ 
        error: result.errorMessages.join(', '),
        jiraError: true 
      });
    }
    
    if (result.errors && Object.keys(result.errors).length > 0) {
      return res.status(400).json({ 
        error: Object.values(result.errors).join(', '),
        jiraError: true 
      });
    }
    
    console.log('Worklog updated successfully:', result);
    
    // Clear cache but don't force full color refresh
    clearWorklogCache();
    
    // Return comprehensive data for client-side updates including the times
    const responseData = {
      ...result,
      worklogId: req.params.worklogId,
      issueId: req.body.issueId,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      comment: req.body.comment,
      issueKeyColor: req.body.issueKeyColor,
      success: true
    };
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Error updating worklog:', error);
    
    // Forward JIRA API errors properly
    if (error.message && (error.message.includes('403') || error.message.includes('Forbidden'))) {
      return res.status(403).json({ 
        error: 'You do not have permission to update worklogs for this issue',
        jiraError: true 
      });
    }
    
    if (error.message && error.message.includes('404')) {
      return res.status(404).json({ 
        error: 'Worklog or issue not found',
        jiraError: true 
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      jiraError: error.jiraError || false
    });
  }
});

router.post('/worklog', async function(req, res, next) {  
  try {
    console.log('Creating worklog for issue:', req.body.issueId);
    console.log('Request body:', req.body);
    
    // Validate required fields
    if (!req.body.issueId || !req.body.startTime || !req.body.endTime) {
      return res.status(400).json({ 
        error: 'Missing required fields: issueId, startTime, or endTime',
        received: req.body
      });
    }
    
    // Validate dates
    const startDate = new Date(req.body.startTime);
    const endDate = new Date(req.body.endTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    
    const result = await jiraController.createWorkLog(
      req,
      req.body.issueId,
      req.body.startTime,
      req.body.endTime,
      req.body.comment,
      req.body.issueKeyColor
    );
    
    // Check if the result contains JIRA API errors
    if (result.errorMessages && result.errorMessages.length > 0) {
      return res.status(400).json({ 
        error: result.errorMessages.join(', '),
        jiraError: true 
      });
    }
    
    if (result.errors && Object.keys(result.errors).length > 0) {
      return res.status(400).json({ 
        error: Object.values(result.errors).join(', '),
        jiraError: true 
      });
    }
    
    console.log('Worklog created successfully:', result);
    
    // Clear cache
    clearWorklogCache();
    
    const responseData = {
      ...result,
      issueId: req.body.issueId,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      comment: req.body.comment,
      issueKeyColor: req.body.issueKeyColor,
      success: true
    };
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Error creating worklog:', error);
    
    // Forward JIRA API errors properly
    if (error.message && (error.message.includes('403') || error.message.includes('Forbidden'))) {
      return res.status(403).json({ 
        error: 'You do not have permission to create worklogs for this issue',
        jiraError: true 
      });
    }
    
    if (error.message && error.message.includes('404')) {
      return res.status(404).json({ 
        error: 'Issue not found',
        jiraError: true 
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      jiraError: error.jiraError || false
    });
  }
});

router.delete('/worklog/:worklogId', async function(req, res, next) {
  try {
    const issueId = req.query.issueId;
    
    if (!issueId) {
      return res.status(400).json({ error: 'Missing required parameter: issueId' });
    }
    
    console.log(`Deleting worklog ${req.params.worklogId} for issue ${issueId}`);
    
    const result = await jiraController.deleteWorkLog(req, issueId, req.params.worklogId);
    
    // Check if the result contains JIRA API errors
    if (result && result.errorMessages && result.errorMessages.length > 0) {
      return res.status(400).json({ 
        error: result.errorMessages.join(', '),
        jiraError: true 
      });
    }
    
    if (result && result.errors && Object.keys(result.errors).length > 0) {
      return res.status(400).json({ 
        error: Object.values(result.errors).join(', '),
        jiraError: true 
      });
    }
    
    console.log('Worklog deleted successfully');
    
    // Clear cache
    clearWorklogCache();
    
    res.json({ 
      success: true,
      message: 'Worklog deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting worklog:', error);
    
    // Forward JIRA API errors properly
    if (error.message && (error.message.includes('403') || error.message.includes('Forbidden'))) {
      return res.status(403).json({ 
        error: 'You do not have permission to delete this worklog',
        jiraError: true 
      });
    }
    
    if (error.message && error.message.includes('404')) {
      return res.status(404).json({ 
        error: 'Worklog not found',
        jiraError: true 
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      jiraError: error.jiraError || false
    });
  }
});

router.get('/stats', function(req, res) {
  res.render('sprintStats', { 
      title: 'Sprint Statistics',
      jiraUrl: process.env.JIRA_URL,
      user: req.user  // Pass user data if needed
  });
});


router.get('/stats/data', async function(req, res, next) {
    try {
        const { start, end, project } = req.query;
        if (!start || !end) {
            return res.status(400).json({ error: 'Start and end dates are required' });
        }
        const statsData = await jiraController.getWorklogStats(req, start, end, project);
        res.json(statsData);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Routes for sprints
router.get('/sprints', async function(req, res) {
    try {
        const sprints = await jiraAPIController.getSprints(req);
        res.json(sprints);
    } catch (error) {
        console.error('Error fetching sprints:', error);
        res.status(500).json({ error: 'Failed to fetch sprints' });
    }
});

router.get('/sprints/current', async function(req, res) {
    try {
        // Get all sprints
        const sprintsResult = await jiraAPIController.getSprints(req);
        const sprints = sprintsResult.values || [];
        
        // Find active sprints (should usually be just one)
        const activeSprints = sprints.filter(sprint => sprint.state === 'active');
        const currentSprint = activeSprints.length > 0 ? activeSprints[0] : null;
        
        if (currentSprint) {
            // Get detailed sprint info
            const sprintDetails = await jiraAPIController.getSprintById(req, currentSprint.id);
            res.json(sprintDetails);
        } else {
            // No active sprint found
            res.json(null);
        }
    } catch (error) {
        console.error('Error fetching current sprint:', error);
        res.status(500).json({ error: 'Failed to fetch current sprint' });
    }
});

router.get('/sprints/:sprintId', async function(req, res) {
    try {
        const sprintDetails = await jiraAPIController.getSprintById(req, req.params.sprintId);
        res.json(sprintDetails);
    } catch (error) {
        console.error(`Error fetching sprint ${req.params.sprintId}:`, error);
        res.status(500).json({ error: 'Failed to fetch sprint details' });
    }
});

// Routes for sprint notes
router.get('/sprints/notes/all', async function(req, res) {
    try {
        const notes = await sprintNotesController.getAllSprintNotes(req);
        res.json(notes);
    } catch (error) {
        console.error('Error fetching all sprint notes:', error);
        res.status(500).json({ error: 'Failed to fetch sprint notes' });
    }
});

router.get('/sprints/:sprintId/notes', async function(req, res) {
    try {
        const notes = await sprintNotesController.getSprintNotes(req, req.params.sprintId);
        res.json(notes);
    } catch (error) {
        console.error(`Error fetching notes for sprint ${req.params.sprintId}:`, error);
        res.status(500).json({ error: 'Failed to fetch sprint notes' });
    }
});

router.post('/sprints/:sprintId/notes', async function(req, res) {
    try {
        // Save the entire note content
        const note = await sprintNotesController.saveSprintNotes(req, req.params.sprintId, req.body.content);
        res.json(note);
    } catch (error) {
        console.error(`Error saving notes for sprint ${req.params.sprintId}:`, error);
        res.status(500).json({ error: 'Failed to save sprint notes' });
    }
});

router.get('/sprint/notes', function(req, res) {
  res.render('sprintNotes', { 
      title: 'Sprint Notes',
      jiraUrl: process.env.JIRA_URL,
      user: req.user  // Pass user data if needed
  });
});

// Routes for global notes
router.get('/notes/global', async function(req, res) {
    try {
        const notes = await globalNotesController.getGlobalNotes(req);
        res.json(notes);
    } catch (error) {
        console.error('Error fetching global notes:', error);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

router.post('/notes/global', async function(req, res) {
    try {
        // Save the entire note content
        const note = await globalNotesController.saveGlobalNotes(req, req.body.content);
        res.json(note);
    } catch (error) {
        console.error('Error saving global notes:', error);
        res.status(500).json({ error: 'Failed to save notes' });
    }
});

module.exports = router;
