# Plywood
A modern NodeJS application for managing Jira worklogs with a calendar-based interface.

*work logs... timesheets... wood sheets... plywood... you get it :)*

## Overview

Plywood provides a visual, calendar-based interface for managing your Jira worklogs. Instead of manually entering time through Jira's interface, you can drag and drop, resize, and easily manage your work entries directly on a calendar view.

The application supports both OAuth2 (recommended) and Basic Authentication, works with Jira Cloud and Server instances, and provides features like timers, project filtering, and customizable themes.

## Features

### Core Features
- **Visual Calendar Interface**: Drag, drop, and resize worklogs directly on the calendar
- **Timer Functionality**: Built-in timer with automatic worklog creation
- **Project Filtering**: Filter calendar view by specific Jira projects
- **Multiple Themes**: Light, dark, and auto (system-based) themes
- **Issue Integration**: Full integration with Jira issues, including subtasks and hierarchy

### Advanced Features
- **Sprint Management**: View current sprint information and manage sprint notes
- **Notes System**: Global and sprint-specific note-taking with auto-save
- **Color Management**: Customizable colors by issue type, key, or hierarchy
- **Issue Type Icons**: Display actual issue type icons from your Jira instance
- **Multi-user Support**: Per-user configuration and data isolation
- **Responsive Design**: Works on desktop and mobile devices

### Authentication & Security
- **OAuth2 Support**: Secure authentication with automatic token refresh (recommended)
- **Basic Auth Support**: Legacy support for API token authentication
- **Session Management**: Encrypted sessions with secure data isolation
- **Error Handling**: Automatic retry logic and graceful error recovery

## Instructions

### Prerequisites
- Node.js (v14 or higher)
- Jira Cloud or Server instance with API access
- OAuth2 app credentials (recommended) or API token (legacy)

### Quick Setup

1. **Install Node.js** from [nodejs.org](https://nodejs.org/)

2. **Download and Extract** this application to your desired folder

3. **Configure Authentication** by copying `example.env` to `.env`:

   **Option A: OAuth2 (Recommended)**
   ```env
   JIRA_AUTH_TYPE=OAUTH
   JIRA_OAUTH_CLIENT_ID=your-oauth-client-id
   JIRA_OAUTH_CLIENT_SECRET=your-oauth-client-secret
   ```

   **Option B: Basic Auth (Legacy)**
   ```env
   JIRA_AUTH_TYPE=BASIC
   JIRA_URL=your-domain.atlassian.net
   JIRA_BASIC_AUTH_USERNAME=your-email@domain.com
   JIRA_BASIC_AUTH_API_TOKEN=your-api-token
   ```

4. **Install Dependencies**: Run `npm install` in the application folder

5. **Start the Application**: 
   - Windows: Double-click `start.bat`
   - Mac/Linux: Run `npm start`

6. **Open in Browser**: Navigate to `http://localhost:3000`

### OAuth2 Setup (Recommended)

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console)
2. Create a new OAuth 2.0 app
3. Set redirect URI to: `http://localhost:3000/auth/callback`
4. Copy the Client ID and Client Secret to your `.env` file
5. Users will authenticate through Atlassian's secure login

### Basic Usage

- **Create Worklog**: Click and drag on the calendar to select a time range
- **Edit Worklog**: Click on any existing worklog entry
- **Timer**: Use the timer button to track time in real-time
- **Configuration**: Click the gear icon to customize colors, themes, and settings
- **Notes**: Press `Ctrl+N` (or `Cmd+N` on Mac) to open the notes panel

### Troubleshooting

- **Authentication Issues**: Ensure your OAuth2 credentials or API token are correct
- **Connection Problems**: Verify your Jira URL and network connectivity
- **Performance Issues**: Try clearing the browser cache or using the cache cleanup in settings
- **Error Messages**: Check the browser console (F12) for detailed error information

For additional support, check the GitHub repository for issues and documentation.