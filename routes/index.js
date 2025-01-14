const express = require('express');
const router = express.Router();

const jiraController= require('../controllers/jiraController');
const jiraAPIController = require('../controllers/jiraAPIController');


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
    jiraController.getSingleEvent(req, req.query.issueId, req.params.worklogId).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});

router.get('/events', function(req, res, next) {
  try {
    jiraController.getUsersWorkLogsAsEvent(req, req.query.start, req.query.end).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
  
  
});

router.get('/issues/user', function(req, res, next) {
  try {
    jiraController.suggestIssues(req, req.query.start, req.query.end, req.query.query).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
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

router.put('/worklog/:worklogId', async function(req, res, next) {
  try {
    await jiraController.updateWorkLog(req, req.body.issueId, req.params.worklogId, req.body.comment, req.body.startTime, req.body.endTime, req.body.issueKeyColor).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});

router.post('/worklog', function(req, res, next) {  
  try {
    jiraController.createWorkLog(req, req.body.issueId, req.body.startTime, req.body.endTime, req.body.comment).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
  }
});

router.delete('/worklog/:worklogId', function(req, res, next) {
  try {
    jiraController.deleteWorkLog(req, req.query.issueId, req.params.worklogId).then(result => {
      res.json(result);
    });
  } catch (error) {
    console.log(error);
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

module.exports = router;
