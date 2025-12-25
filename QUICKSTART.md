# EmanAI - Quick Start Guide

Hey! Here's how to get EmanAI running on your computer in 3 easy steps.

## What You Need

1. **Node.js** - Download from https://nodejs.org/ (get the LTS version)
2. **Git** - Download from https://git-scm.com/

Install both, then restart your computer.

---

## Installation (3 Steps)

### Step 1: Download the Code

Open PowerShell or Command Prompt and run:

```bash
git clone https://github.com/EmanCanCode/emanai.git
cd emanai
```

### Step 2: Run Setup

Double-click the **`setup.bat`** file in the folder, OR run:

```bash
setup.bat
```

Wait for it to finish installing everything.

### Step 3: Launch the App

Run this command:

```bash
npm run electron
```

The app will open in a new window! 🎉

---

## Next Steps

### Want a Desktop Shortcut?

Build the installer:

```bash
npm run dist
```

Then go to the `dist` folder and run **`EmanAI Setup.exe`**. This will install EmanAI properly with:
- Desktop shortcut
- Start Menu entry
- Uninstaller

After that, you can delete the `emanai` folder - the app is now installed!

---

## Using the App

1. **Start a new chat** - Click "+ New Chat"
2. **Type your message** - Ask anything!
3. **Copy code** - Click the copy button on code blocks
4. **Switch models** - Use the dropdown at the top
5. **View old chats** - Click them in the sidebar

---

## Having Issues?

### App won't start?

Make sure you installed Node.js and ran `setup.bat`.

Check if Node.js works:
```bash
node --version
```

Should show something like `v20.x.x`

### Need Help?

Text me and I'll help you out!

---

Enjoy! 🚀
