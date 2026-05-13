const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

ensureJsonFile(USERS_FILE, []);
ensureJsonFile(SESSIONS_FILE, {});

class FileSessionStore extends session.Store {
    constructor(filePath) {
        super();
        this.filePath = filePath;
    }

    get(sessionId, callback) {
        try {
            const sessions = this.readSessions();
            const record = sessions[sessionId];

            callback(null, record ? record.session : null);
        } catch (error) {
            callback(error);
        }
    }

    set(sessionId, sessionData, callback) {
        try {
            const sessions = this.readSessions();
            sessions[sessionId] = {
                session: sessionData,
                expiresAt: getSessionExpiry(sessionData)
            };
            this.writeSessions(sessions);
            callback?.(null);
        } catch (error) {
            callback?.(error);
        }
    }

    destroy(sessionId, callback) {
        try {
            const sessions = this.readSessions();
            delete sessions[sessionId];
            this.writeSessions(sessions);
            callback?.(null);
        } catch (error) {
            callback?.(error);
        }
    }

    touch(sessionId, sessionData, callback) {
        this.set(sessionId, sessionData, callback);
    }

    readSessions() {
        try {
            const content = fs.readFileSync(this.filePath, 'utf8');
            const parsed = JSON.parse(content || '{}');
            const sessions = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
            let removedExpiredSessions = false;

            Object.entries(sessions).forEach(([sessionId, record]) => {
                if (isExpiredSession(record)) {
                    delete sessions[sessionId];
                    removedExpiredSessions = true;
                }
            });

            if (removedExpiredSessions) {
                this.writeSessions(sessions);
            }

            return sessions;
        } catch (error) {
            return {};
        }
    }

    writeSessions(sessions) {
        fs.writeFileSync(this.filePath, JSON.stringify(sessions, null, 2));
    }
}

app.use(express.json());
app.use(
    session({
        store: new FileSessionStore(SESSIONS_FILE),
        secret: 'inventory-system-student-project',
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax'
        }
    })
);

app.get('/', requirePageAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/index.html', requirePageAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/edit.html', requirePageAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'edit.html'));
});

app.get('/about.html', requirePageAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'about.html'));
});

app.get('/contact.html', requirePageAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'contact.html'));
});

app.get('/login.html', redirectLoggedInUser, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.post('/register', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    const users = readUsers();
    const existingUser = users.find((user) => user.username.toLowerCase() === username.toLowerCase());

    if (existingUser) {
        return res.status(409).json({ message: 'That username is already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    users.push({
        id: `user-${Date.now()}`,
        username,
        password: passwordHash,
        items: []
    });

    writeUsers(users);
    res.status(201).json({ message: 'Registration successful. You can log in now.' });
});

app.post('/login', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const rememberMe = Boolean(req.body.rememberMe);
    const users = readUsers();
    const user = users.find((savedUser) => savedUser.username.toLowerCase() === username.toLowerCase());

    if (!user) {
        return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const matches = await bcrypt.compare(password, user.password);

    if (!matches) {
        return res.status(401).json({ message: 'Invalid username or password.' });
    }

    req.session.regenerate((error) => {
        if (error) {
            return res.status(500).json({ message: 'Could not start a session. Please try again.' });
        }

        req.session.username = user.username;

        if (rememberMe) {
            req.session.cookie.maxAge = THIRTY_DAYS_MS;
        } else {
            req.session.cookie.expires = false;
            req.session.cookie.maxAge = null;
        }

        req.session.save((saveError) => {
            if (saveError) {
                return res.status(500).json({ message: 'Could not save your login session. Please try again.' });
            }

            res.json({ message: 'Login successful.' });
        });
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((error) => {
        res.clearCookie('connect.sid');

        if (error) {
            return res.status(500).json({ message: 'Could not log out cleanly.' });
        }

        res.json({ message: 'Logged out.' });
    });
});

app.get('/items', requireApiAuth, (req, res) => {
    const currentUser = req.currentUser;
    const items = currentUser.user.items.map(normalizeItem);

    res.json(items);
});

app.post('/items', requireApiAuth, (req, res) => {
    const currentUser = req.currentUser;
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim() || 'General';
    const quantity = Number(req.body.quantity);

    if (!name || Number.isNaN(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Please enter a valid item name and quantity.' });
    }

    currentUser.user.items.push({
        id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name,
        quantity,
        category
    });

    writeUsers(currentUser.users);
    res.status(201).json({ message: 'Item added.' });
});

app.patch('/items/:id', requireApiAuth, (req, res) => {
    const currentUser = req.currentUser;
    const item = currentUser.user.items.find((savedItem) => savedItem.id === req.params.id);
    const quantity = Number(req.body.quantity);

    if (!item) {
        return res.status(404).json({ message: 'Item not found.' });
    }

    if (Number.isNaN(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Quantity must be zero or higher.' });
    }

    item.quantity = quantity;
    writeUsers(currentUser.users);
    res.json({ message: 'Item updated.' });
});

app.delete('/items/:id', requireApiAuth, (req, res) => {
    const currentUser = req.currentUser;
    const startingLength = currentUser.user.items.length;

    currentUser.user.items = currentUser.user.items.filter((savedItem) => savedItem.id !== req.params.id);

    if (currentUser.user.items.length === startingLength) {
        return res.status(404).json({ message: 'Item not found.' });
    }

    writeUsers(currentUser.users);
    res.json({ message: 'Item deleted.' });
});

app.use(express.static(PUBLIC_DIR));

app.listen(PORT, () => {
    console.log(`Inventory Management System running on http://localhost:${PORT}`);
});

function ensureJsonFile(filePath, defaultValue) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    }
}

function readUsers() {
    try {
        const content = fs.readFileSync(USERS_FILE, 'utf8');
        const parsed = JSON.parse(content || '[]');

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getCurrentUser(req) {
    if (!req.session.username) {
        return null;
    }

    const users = readUsers();
    const user = users.find((savedUser) => savedUser.username === req.session.username);

    if (!user) {
        return null;
    }

    if (!Array.isArray(user.items)) {
        user.items = [];
    }

    const originalItems = JSON.stringify(user.items);
    user.items = user.items.map(normalizeItem);

    if (JSON.stringify(user.items) !== originalItems) {
        writeUsers(users);
    }

    return { users, user };
}

function normalizeItem(item) {
    return {
        id: item.id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: String(item.name || 'Unnamed Item'),
        quantity: Number(item.quantity ?? item.qty ?? 0),
        category: String(item.category || 'General')
    };
}

function requirePageAuth(req, res, next) {
    if (!getCurrentUser(req)) {
        clearSession(req, res);
        return res.redirect('/login.html');
    }

    next();
}

function redirectLoggedInUser(req, res, next) {
    if (getCurrentUser(req)) {
        return res.redirect('/');
    }

    clearSession(req, res);
    next();
}

function requireApiAuth(req, res, next) {
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
        clearSession(req, res);
        return res.status(401).json({ message: 'Not authenticated.' });
    }

    req.currentUser = currentUser;
    next();
}

function getSessionExpiry(sessionData) {
    const expires = sessionData?.cookie?.expires;

    if (!expires) {
        return null;
    }

    const timestamp = new Date(expires).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

function isExpiredSession(record) {
    if (!record?.expiresAt) {
        return false;
    }

    return record.expiresAt <= Date.now();
}

function clearSession(req, res) {
    if (!req.session) {
        return;
    }

    req.session.destroy(() => {});
    res.clearCookie('connect.sid');
}
