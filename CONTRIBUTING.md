# Contributing to Paperback

Thank you for your interest in contributing to Paperback! We welcome all contributions, from bug fixes and documentation to new features and design updates.

To help you get started, this guide explains how to open issues, submit Pull Requests (including rules for AI-assisted contributions), and support the project.

---

## How to Create Issues

Issues are the best way to report bugs, suggest features, or ask questions.

### Opening a Bug Report
If you find something in Paperback that is not working as expected, please open a Bug Report issue and include:
1. **Clear Summary**: A concise title explaining the problem.
2. **Steps to Reproduce**: Detailed list of steps to trigger the bug.
3. **Expected vs. Actual Behavior**: What should have happened vs. what actually happened.
4. **Environment Info**: Your browser version (Chrome, Safari, Firefox), OS (Windows, macOS, Linux, Android, iOS), and whether you were on mobile or desktop.
5. **Screenshots or Logs**: Console error messages or screenshots if the issue is visual.

### Suggesting Features
Have an idea to make Paperback better? Create a Feature Request issue and explain:
- What problem this feature solves.
- How you visualize the feature working in the user interface.
- Any alternative solutions you have considered.

---

## How to Submit Pull Requests (PRs)

We welcome your code contributions! To make the review process smooth, please follow these steps:

### 1. Preparing your Changes
- Fork the repository and create your branch from `main` (e.g. `git checkout -b feature/my-new-feature`).
- Make your code changes, ensuring that you preserve existing comments and structure.
- Test your changes locally to ensure the web application runs without errors (`npm start`).

### 2. Submitting the PR
- Push your branch to your fork on GitHub and open a Pull Request against our `main` branch.
- In your PR description, explain what changes were made, why they are needed, and how you verified them.

### 3. Rules for AI-Assisted PRs
If you used an AI coding assistant (such as Gemini, ChatGPT, Claude, Antigravity, etc.) to write, optimize, or debug the code in your pull request, you **must** comply with the following rules:
- **Title Tag**: You must append `AI assisted` to your Pull Request title. E.g.:
  `feat: implement local storage fallback for user rooms AI assisted`
- **AI Explanation**: In your Pull Request description, include a dedicated section detailing how the AI was used. E.g.:
  > **AI Assisted Usage Info:**
  > - Gemini 1.5 Pro was used to scaffold the local storage query parser.
  > - Copilot was used to autocomplete the CSS transition styles.
  > - Antigravity was used to refactor the database migration script.

This ensures transparency in our open-source codebase and helps maintainers review code effectively.

---

## Support and Donate

Paperback is a completely free, open-source project. If you want to support its maintenance and active development, you can buy the creator a coffee!

<a href="https://buymeacoffee.com/gabrielngal" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="200" height="50" style="height: 50px !important; width: 200px !important;" />
</a>

---
Made by <a href="https://github.com/GabrielBaiano">Gabriel Baiano</a>
