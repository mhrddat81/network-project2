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

// Function to check for a winner
function checkWinner(moves) {
    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6]             // diagonals
    ];

    for (let combination of winningCombinations) {
        const [a, b, c] = combination;
        if (moves[a] && moves[a] === moves[b] && moves[a] === moves[c]) {
            return moves[a];
        }
    }
    return moves.includes(null) ? null : 'tie';
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
    if (req.session.user) {
        res.sendFile(path.join(__dirname, 'public', 'game.html'));
    } else {
        res.redirect('/');
    }
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
            socket.emit('matchRequestSent', { to });
        }
        console.log(`Match request sent from ${from} to ${to}`);
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
                ongoingGames.push({ id: gameId, player1: from, player2: to, moves: Array(9).fill(null), turn: from });
                logOngoingGames(); // Log ongoing games
                // Remove players from online users list
                onlineUsers = onlineUsers.filter(user => user.username !== from && user.username !== to);
                io.to('gameLobby').emit('updateUserList', onlineUsers);
                io.to('gameLobby').emit('updateOngoingGames', ongoingGames);

                fromUserSocket.emit('startGame', { gameId, opponent: to, symbol: 'X', turn: from });
                const toUserSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === to);
                if (toUserSocket) {
                    toUserSocket.emit('startGame', { gameId, opponent: from, symbol: 'O', turn: from });
                }
                console.log(`Game started between ${from} and ${to}`);
            }
        }
    });

    socket.on('joinGame', (data) => {
        const { gameId, username } = data;
        socket.join(`game-${gameId}`);
        const game = ongoingGames.find(game => game.id === gameId);
        if (game) {
            const turn = game.turn;
            const symbol = game.player1 === username ? 'X' : 'O';
            socket.emit('gameStart', { turn, symbol });
        }
    });

    socket.on('makeMove', (data) => {
        const { gameId, username, cellIndex } = data;
        const game = ongoingGames.find(game => game.id === gameId);
        if (game && game.moves[cellIndex] === null && game.turn === username) {
            const symbol = game.player1 === username ? 'X' : 'O';
            game.moves[cellIndex] = symbol;

            // Notify all clients in the game room about the move
            io.in(`game-${gameId}`).emit('moveMade', { cellIndex, symbol });

            // Log the move
            console.log(`Move made by ${username} in game ${gameId} at cell ${cellIndex}`);

            // Check for winner or tie
            const winner = checkWinner(game.moves);
            if (winner) {
                io.in(`game-${gameId}`).emit('gameOver', { winner });
                // Save game result to database
                db.query('INSERT INTO game_results (player1, player2, winner) VALUES (?, ?, ?)', 
                         [game.player1, game.player2, winner === 'tie' ? 'tie' : (winner === 'X' ? game.player1 : game.player2)],
                         (err, result) => {
                             if (err) {
                                 console.error('Database error on INSERT game result:', err);
                             } else {
                                 console.log('Game result saved successfully');
                             }
                         });
                // Remove the game from ongoing games
                ongoingGames = ongoingGames.filter(g => g.id !== gameId);
                logOngoingGames(); // Log ongoing games
                console.log(`Game over. Winner: ${winner}`);
            } else {
                // Switch turn
                game.turn = game.turn === game.player1 ? game.player2 : game.player1;
                io.in(`game-${gameId}`).emit('updateTurn', { turn: game.turn });
                console.log(`Turn switched to ${game.turn}`);
            }
        }
    });

    socket.on('disconnect', () => {
        onlineUsers = onlineUsers.filter(user => user.username !== socket.username);
        logOnlineUsers(); // Log online users
        io.to('gameLobby').emit('updateUserList', onlineUsers);
        console.log(`${socket.username} disconnected`);
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
