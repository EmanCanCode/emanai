# EmanAI - AI Chat Desktop Application

A beautiful, local-first AI chat application with syntax highlighting, streaming responses, and support for Ollama models.

## Features

✨ **Modern UI** - Dark theme with smooth animations
🎨 **Syntax Highlighting** - Colorful code blocks with one-click copy
💬 **Conversation Management** - Save and load chat history
⚡ **Real-time Streaming** - See responses as they're generated
🔧 **Model Switching** - Use any Ollama model
🖥️ **Desktop App** - Runs as a native Windows application

---

## Installation for Your Brother

### Prerequisites

1. **Node.js** (v18 or higher)
   - Download from: https://nodejs.org/
   - During installation, make sure "Add to PATH" is checked

2. **Git** (to clone the repository)
   - Download from: https://git-scm.com/

---

## Quick Start

### Step 1: Clone the Repository

```bash
git clone https://github.com/EmanCanCode/emanai.git
cd emanai
```

### Step 2: Run Setup

Double-click `setup.bat` or run in PowerShell/CMD:

```bash
setup.bat
```

This will:
- Install all dependencies
- Create a `.env` configuration file
- Set up the application

### Step 3: Run the App

**Option A: Desktop Application (Recommended)**
```bash
npm run electron
```

**Option B: Web Browser**
```bash
npm start
```
Then open http://localhost:3000 in your browser

---

## Building a Windows Installer

To create a standalone `.exe` installer:

### 1. Install Build Dependencies

```bash
npm install
```

### 2. Build the Installer

```bash
npm run dist
```

This will create two files in the `dist` folder:

1. **EmanAI Setup.exe** - Full installer with Start Menu and Desktop shortcuts
2. **EmanAI Portable.exe** - Portable version that doesn't require installation

### 3. Install

Double-click `EmanAI Setup.exe` and follow the installation wizard.

After installation:
- Desktop shortcut will be created
- Start Menu entry will be added
- Just launch "EmanAI" from Start Menu or Desktop

---

## Configuration

Edit the `.env` file to customize settings:

```env
# Your Ollama server URL
OLLAMA_BASE_URL=https://ollama.emancancode.online

# Default model to use
OLLAMA_MODEL=huihui_ai/deepseek-r1-abliterated:32b-qwen-distill

# Port (will be randomized in Electron app)
PORT=3000
```

---

## Usage Tips

### Switching Models

Click the dropdown at the top to select different AI models.

### Managing Conversations

- **New Chat** - Click the "+ New Chat" button in the sidebar
- **Load Chat** - Click any conversation in the sidebar to continue it
- **Delete Chat** - Hover over a conversation and click "Delete"

### Copying Code

Click the "Copy" button in any code block header to copy the entire code.

### Keyboard Shortcuts

- `Enter` - Send message
- `Shift + Enter` - New line in message
- `Ctrl + R` - Hard refresh (clears cache)

---

## Troubleshooting

### "Loading models..." stuck

**Solution**: Check your internet connection and verify the Ollama server is accessible:

```powershell
Invoke-RestMethod -Uri "https://ollama.emancancode.online/api/tags"
```

### Port already in use

**Solution**: The Electron app automatically finds an available port. If running `npm start`, change the PORT in `.env`:

```env
PORT=8080
```

### App won't start

**Solution**:
1. Make sure Node.js is installed: `node --version`
2. Reinstall dependencies: `npm install`
3. Check console for errors

### Conversations not saving

**Solution**: The `convo-history` folder stores all conversations. Make sure it exists and has write permissions.

---

## Development

### Project Structure

```
emanai/
├── app.js              # Backend server (Node.js)
├── client.html         # Frontend UI
├── electron-main.js    # Electron wrapper
├── package.json        # Dependencies & build config
├── setup.bat           # Setup script
├── .env                # Configuration
└── convo-history/      # Saved conversations
```

### Running in Development

```bash
# Start backend server
npm start

# Start Electron app
npm run electron
```

---

## License

ISC

---

## Support

If you encounter any issues, please check the Troubleshooting section or contact the developer.

**Enjoy using EmanAI!** 🚀
