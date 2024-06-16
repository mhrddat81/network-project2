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
let ongoingGames = [];

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

// Function to log ongoing games
function logOngoingGames() {
    console.log('Ongoing Games:');
    ongoingGames.forEach(game => {
        console.log(`- Game ID: ${game.id}, Players: ${game.player1}, ${game.player2}`);
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

            // Add user to online users list
            onlineUsers.push({ id: user.id, username: user.username });
            logOnlineUsers(); // Log online users
            
            console.log('User logged in successfully:', username);
            res.status(200).send('User logged in');
        });
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

app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

app.get('/bingo', (req, res) => {
    res.send('Bingo!');
});

// Logout route
app.get('/logout', (req, res) => {
    if (req.session.user) {
        // Remove user from online users list on logout
        onlineUsers = onlineUsers.filter(user => user.username !== req.session.user.username);
        logOnlineUsers(); // Log online users
    }
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Server error');
        }
        res.redirect('/');
    });
});

// Socket.io event handling
io.on('connection', (socket) => {
    socket.on('joinGameLobby', (username) => {
        socket.username = username;
        socket.join('gameLobby');
        io.to('gameLobby').emit('updateUserList', onlineUsers);
        io.to('gameLobby').emit('updateOngoingGames', ongoingGames);
    });

    socket.on('sendMatchRequest', (data) => {
        const { from, to } = data;
        const targetUserSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === to);
        if (targetUserSocket) {
            targetUserSocket.emit('receiveMatchRequest', { from });
        }
    });

    socket.on('respondMatchRequest', (data) => {
        const { from, to, response } = data;
        const fromUserSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === from);
        if (fromUserSocket) {
            fromUserSocket.emit('matchRequestResponse', { to, response });
            if (response === 'accept') {
                // Start a new game
                const player1 = onlineUsers.find(user => user.username === from);
                const player2 = onlineUsers.find(user => user.username === to);
                const gameId = ongoingGames.length + 1;
                ongoingGames.push({ id: gameId, player1: from, player2: to });
                logOngoingGames(); // Log ongoing games
                // Remove players from online users list
                onlineUsers = onlineUsers.filter(user => user.username !== from && user.username !== to);
                io.to('gameLobby').emit('updateUserList', onlineUsers);
                io.to('gameLobby').emit('updateOngoingGames', ongoingGames);

                fromUserSocket.emit('startGame', { gameId, opponent: to, symbol: 'X', turn: from });
                socket.emit('startGame', { gameId, opponent: from, symbol: 'O', turn: from });
            }
        }
    });

    socket.on('joinGame', (data) => {
        const { gameId, username } = data;
        socket.join(`game-${gameId}`);
        const game = ongoingGames.find(game => game.id === gameId);
        if (game) {
            const turn = game.player1 === username ? game.player1 : game.player2;
            const symbol = game.player1 === username ? 'X' : 'O';
            socket.emit('gameStart', { turn, symbol });
        }
    });

    socket.on('makeMove', (data) => {
        const { gameId, username, cellIndex } = data;
        socket.to(`game-${gameId}`).emit('moveMade', { cellIndex, symbol: username });
    });

    socket.on('gameOver', (data) => {
        const { gameId, winner, loser } = data;
        const gameIndex = ongoingGames.findIndex(game => game.id === gameId);
        if (gameIndex !== -1) {
            ongoingGames.splice(gameIndex, 1);
            logOngoingGames(); // Log ongoing games
            io.to('gameLobby').emit('updateOngoingGames', ongoingGames);

            // Save game result in the database
            const gameDate = new Date();
            db.query(
                'INSERT INTO games (player1_id, player2_id, winner_id, loser_id, game_date) VALUES ((SELECT id FROM players WHERE username = ?), (SELECT id FROM players WHERE username = ?), (SELECT id FROM players WHERE username = ?), (SELECT id FROM players WHERE username = ?), ?)',
                [data.winner, data.loser, data.winner === '0' ? null : data.winner, data.loser === '0' ? null : data.loser, gameDate],
                (err, result) => {
                    if (err) {
                        console.error('Database error on INSERT:', err);
                    } else {
                        console.log('Game result saved:', result.insertId);
                    }
                }
            );

            io.in(`game-${gameId}`).emit('gameOver', { message: winner === '0' ? 'The game is a tie!' : `${winner} wins!`, winner });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers = onlineUsers.filter(user => user.username !== socket.username);
            logOnlineUsers(); // Log online users
            io.to('gameLobby').emit('updateUserList', onlineUsers);
        }
    });
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
