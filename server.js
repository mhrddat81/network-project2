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
    user: 'root', 
    password: 'admin', 
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

function logMove(gameId, player, cellIndex) {
    console.log(`Game ${gameId}: Player ${player} moved to cell ${cellIndex}`);
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

            // Add user to online users list if not already present
            if (!onlineUsers.some(u => u.username === user.username)) {
                onlineUsers.push({ id: user.id, username: user.username });
                logOnlineUsers(); // Log online users
            }

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

app.get('/view_game', (req, res) => {
    if (req.session.user) {
        res.sendFile(path.join(__dirname, 'public', 'view_game.html'));
    } else {
        res.redirect('/');
    }
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
        const opponentSocket = [...io.sockets.sockets.values()].find(s => s.username === to);
        if (opponentSocket) {
            opponentSocket.emit('receiveMatchRequest', { from });
        }
    });

    socket.on('respondMatchRequest', (data) => {
        const { from, to, response } = data;
        const requestingSocket = [...io.sockets.sockets.values()].find(s => s.username === from);
        if (requestingSocket) {
            requestingSocket.emit('matchRequestResponse', { to, response });
            if (response === 'accept') {
                const gameId = Date.now().toString();
                ongoingGames.push({ id: gameId, player1: from, player2: to, moves: Array(9).fill(null), turn: from });
                logOngoingGames(); // Log ongoing games
                io.to('gameLobby').emit('updateOngoingGames', ongoingGames);
                requestingSocket.emit('startGame', { gameId, opponent: to, symbol: 'X', turn: from });
                socket.emit('startGame', { gameId, opponent: from, symbol: 'O', turn: from });
            }
        }
    });

    // Updated joinGame event handler
    socket.on('joinGame', (data) => {
        const { gameId } = data;
        socket.join(gameId);

        // Send current game state to the new viewer
        const game = ongoingGames.find(g => g.id === gameId);
        if (game) {
            for (let i = 0; i < game.moves.length; i++) {
                if (game.moves[i] !== null) {
                    socket.emit('moveMade', { cellIndex: i, symbol: game.moves[i] });
                }
            }
        }
    });

    // Updated makeMove event handler
    socket.on('makeMove', (data) => {
        const { gameId, cellIndex, symbol } = data;
        const game = ongoingGames.find(g => g.id === gameId);
        if (game && game.moves[cellIndex] === null) {
            game.moves[cellIndex] = symbol;
            const winner = checkWinner(game.moves);
            game.turn = game.turn === game.player1 ? game.player2 : game.player1;
            io.to(gameId).emit('moveMade', { cellIndex, symbol, turn: game.turn });
            if (winner) {
                io.to(gameId).emit('gameOver', { winner: winner === 'tie' ? 'tie' : (winner === 'X' ? game.player1 : game.player2) });
                ongoingGames = ongoingGames.filter(g => g.id !== gameId);
                io.to('gameLobby').emit('updateOngoingGames', ongoingGames);
            }
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers = onlineUsers.filter(user => user.username !== socket.username);
            io.to('gameLobby').emit('updateUserList', onlineUsers);
            logOnlineUsers(); // Log online users
        }
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
