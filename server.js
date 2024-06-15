const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const port = 3000;

// Create HTTP server and bind Socket.io to it
const server = http.createServer(app);
const io = socketIo(server);
let onlineUsers = [];

// MySQL connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root', // Replace with your MySQL username
    password: 'admin', // Replace with your MySQL password
    database: 'tictactoe_db'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed: ', err);
        return;
    }
    console.log('MySQL Connected...');
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({
    secret: '123', // Replace with a random string for security
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 1 day
    }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Function to log online users
function logOnlineUsers() {
    console.log('Online Users:');
    onlineUsers.forEach(user => {
        console.log(`- ${user.username}`);
    });
    console.log('----------------------');
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;

    console.log('Register request received:', username);

    db.query('SELECT * FROM players WHERE username = ?', [username], (err, results) => {
        if (err) {
            console.error('Database error on SELECT:', err);
            return res.status(500).send('Database error');
        }
        if (results.length > 0) {
            console.log('Username already exists:', username);
            return res.status(400).send('Username already exists');
        }

        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                console.error('Bcrypt error:', err);
                return res.status(500).send('Server error');
            }
            db.query('INSERT INTO players (username, password) VALUES (?, ?)', [username, hash], (err, result) => {
                if (err) {
                    console.error('Database error on INSERT:', err);
                    return res.status(500).send('Database error');
                }
                console.log('User registered successfully:', username);
                res.status(200).send('User registered');
            });
        });
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    console.log('Login request received:', username);

    db.query('SELECT * FROM players WHERE username = ?', [username], (err, results) => {
        if (err) {
            console.error('Database error on SELECT:', err);
            return res.status(500).send('Database error');
        }
        if (results.length === 0) {
            console.log('User not found:', username);
            return res.status(400).send('User not found');
        }

        const user = results[0];
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                console.error('Bcrypt error:', err);
                return res.status(500).send('Server error');
            }
            if (!isMatch) {
                console.log('Invalid password for user:', username);
                return res.status(400).send('Invalid password');
            }

            // Store user data in session
            req.session.user = {
                id: user.id,
                username: user.username
            };

            console.log('User logged in successfully:', username);
            res.status(200).send('User logged in');
        });
    });
});

// Handle socket connections
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('joinGameLobby', (username) => {
        if (!onlineUsers.some(user => user.username === username)) {
            onlineUsers.push({ username, socketId: socket.id });
        }
        io.emit('updateUserList', onlineUsers);
        logOnlineUsers();
    });

    socket.on('sendMatchRequest', (data) => {
        const { from, to } = data;
        const recipient = onlineUsers.find(user => user.username === to);
        if (recipient) {
            io.to(recipient.socketId).emit('receiveMatchRequest', { from });
        }
    });

    socket.on('respondMatchRequest', (data) => {
        const { from, to, response } = data;
        const requester = onlineUsers.find(user => user.username === from);
        if (requester) {
            io.to(requester.socketId).emit('matchRequestResponse', { to, response });
        }
    });

    socket.on('logout', () => {
        onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
        io.emit('updateUserList', onlineUsers);
        logOnlineUsers();
    });

    socket.on('disconnect', () => {
        onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
        io.emit('updateUserList', onlineUsers);
        console.log('A user disconnected');
        logOnlineUsers();
    });
});

// Route to fetch online users
app.get('/online_users', (req, res) => {
    if (req.session.user) {
        // Send the list of online users (excluding current user)
        const onlineUsernames = onlineUsers.filter(user => user.username !== req.session.user.username);
        res.json(onlineUsernames);
    } else {
        res.status(401).send('Unauthorized'); // Example: Handle unauthorized access
    }
});

// Example protected route
app.get('/game_lobby', (req, res) => {
    if (req.session.user) {
        // Serve game lobby page
        res.sendFile(path.join(__dirname, 'public', 'game_lobby.html'));
    } else {
        res.redirect('/');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    if (req.session.user) {
        // Find the user's socket
        const user = onlineUsers.find(user => user.username === req.session.user.username);
        if (user) {
            io.to(user.socketId).emit('logout');
        }
    }
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Server error');
        }
        res.redirect('/');
    });
});

// Listen on the HTTP server instead of app
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
