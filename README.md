# Inventory Management System

A student-level web application for managing inventory items with a simple dashboard, user authentication, stock analytics, and a small differentiating feature called the Health Feature / Restock Mission.

## Features

- User registration and login with `express-session` and `bcrypt`
- Separate inventory lists for each user in `users.json`
- Local file-backed sessions in `sessions.json` so logins can survive a server restart
- Add, edit, search, filter, and delete inventory items
- Dashboard cards for total items, low stock, and out of stock
- Chart.js bar chart for live inventory totals
- Health Feature / Restock Mission for quick restock priorities
- Dark mode toggle

## Tech Stack

- Node.js
- Express
- HTML
- CSS
- JavaScript
- JSON file storage

## Project Structure

```text
server.js
public/
  index.html
  login.html
  script.js
  style.css
filled-deliverables/
```

## How To Run

```bash
npm install
node server.js
```

Then open:

```text
http://localhost:3000/login.html
```

## Notes

- This project uses JSON files instead of a database to keep the implementation simple and readable for coursework.
