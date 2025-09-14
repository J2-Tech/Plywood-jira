# Plywood
A modern calendar-based interface for managing Jira worklogs.

*work logs... timesheets... wood sheets... plywood... you get it :)*

## Overview

Plywood transforms Jira worklog management with a visual calendar interface. Drag, drop, and resize work entries directly on the calendar instead of manually entering time through Jira's interface.

## Key Features

- **📅 Visual Calendar**: Drag, drop, and resize worklogs on a calendar view
- **⏱️ Built-in Timer**: Track time with automatic worklog creation
- **🎨 Customizable Colors**: Set colors by issue type, key, or hierarchy
- **📝 Notes System**: Global and sprint-specific notes with auto-save
- **🔐 Secure Authentication**: OAuth2 (recommended) or API token support
- **🌙 Multiple Themes**: Light, dark, and auto themes
- **📱 Responsive Design**: Works on desktop and mobile

## Quick Setup

### Prerequisites
- Node.js (v14+)
- Jira Cloud or Server instance
- OAuth2 app credentials (recommended)

### Installation

1. **Install Node.js** from [nodejs.org](https://nodejs.org/)

2. **Download and extract** this application

3. **Configure authentication** by copying `example.env` to `.env`:

   **OAuth2 (Recommended)**
   ```env
   JIRA_AUTH_TYPE=OAUTH
   JIRA_OAUTH_CLIENT_ID=your-oauth-client-id
   JIRA_OAUTH_CLIENT_SECRET=your-oauth-client-secret
   ```

   **Basic Auth (Legacy)**
   ```env
   JIRA_AUTH_TYPE=BASIC
   JIRA_URL=your-domain.atlassian.net
   JIRA_BASIC_AUTH_USERNAME=your-email@domain.com
   JIRA_BASIC_AUTH_API_TOKEN=your-api-token
   ```

4. **Install dependencies**: `npm install`

5. **Start the application**:
   - Windows: Double-click `start.bat`
   - Mac/Linux: `npm start`

6. **Open browser**: Navigate to `http://localhost:3000`

### OAuth2 Setup

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console)
2. Create a new OAuth 2.0 app
3. Set redirect URI: `http://localhost:3000/auth/callback`
4. Copy Client ID and Client Secret to `.env`

## Usage

- **Create Worklog**: Click and drag on calendar to select time range
- **Edit Worklog**: Click on any existing worklog entry
- **Timer**: Use timer button for real-time tracking
- **Settings**: Click gear icon to customize colors and themes
- **Notes**: Press `Ctrl+N` (or `Cmd+N` on Mac) for notes panel

## Screenshots

![Light mode](/docs/light.png)
![Dark mode](/docs/dark.png)
![Stats](/docs/stats.png)
## Troubleshooting

- **Authentication Issues**: Verify OAuth2 credentials or API token
- **Connection Problems**: Check Jira URL and network connectivity
- **Performance Issues**: Clear browser cache or use cache cleanup in settings
- **Error Messages**: Check browser console (F12) for details

For additional support, check the GitHub repository for issues and documentation.