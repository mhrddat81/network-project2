const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb'); // Import MongoClient and ObjectId

const app = express();
const port = 3000;
const server = http.createServer(app);
const io = socketIo(server);

let onlineUsers = [];
let ongoingGames = [];

// MongoDB connection URI
const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

client.connect(err => {
    if (err) {
        console.error('MongoDB connection failed:', err);
        return;
    }
    console.log('MongoDB Connected...');
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({
    secret: '123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
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

// Example register route using MongoDB
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const db = client.db('tictactoe_db');
        const playersCollection = db.collection('players');

        // Check if username already exists
        const existingUser = await playersCollection.findOne({ username });
        if (existingUser) {
            console.log('Username already exists:', username);
            return res.status(400).send('Username already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        const insertResult = await playersCollection.insertOne({ username, password: hashedPassword });
        console.log('User registered successfully:', username);
        res.status(200).send('User registered');
    } catch (err) {
        console.error('MongoDB error:', err);
        res.status(500).send('Database error');
    }
});

// Example login route using MongoDB
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const db = client.db('tictactoe_db');
        const playersCollection = db.collection('players');

        // Find user by username
        const user = await playersCollection.findOne({ username });
        if (!user) {
            console.log('User not found:', username);
            return res.status(400).send('User not found');
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Invalid password for user:', username);
            return res.status(400).send('Invalid password');
        }

        // Store user data in session
        req.session.user = { id: user._id, username: user.username };

        // Add user to online users list
        onlineUsers.push({ id: user._id, username: user.username });
        logOnlineUsers(); // Log online users

        console.log('User logged in successfully:', username);
        res.status(200).send('User logged in');
    } catch (err) {
        console.error('MongoDB error:', err);
        res.status(500).send('Database error');
    }
});

// Route to fetch online users
app.get('/online_users', (req, res) => {
    if (req.session.user) {
        // Send the list of online users (excluding current user)
        const onlineUsernames = onlineUsers.filter(user => user.username !== req.session.user.username);
        res.json(onlineUsernames);
    } else {
        res.status(401).send('Unauthorized');
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
    
        if (!fromUserSocket) {
            console.error(`Socket for user ${from} not found.`);
            return; // Exit early if sender's socket is not found
        }
    
        fromUserSocket.emit('matchRequestResponse', { to, response });
    
        if (response === 'accept') {
            const targetUserSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === to);
            
            if (!targetUserSocket) {
                console.error(`Socket for user ${to} not found.`);
                // Inform the sender that the target user is not available
                fromUserSocket.emit('matchRequestFailed', { to });
                return; // Exit early if target user's socket is not found
            }
    
            // Start a new game
            const gameId = ongoingGames.length + 1;
            ongoingGames.push({ id: gameId, player1: from, player2: to, moves: Array(9).fill(null), turn: from });
            logOngoingGames(); // Log ongoing games
    
            // Remove players from online users list
            onlineUsers = onlineUsers.filter(user => user.username !== from && user.username !== to);
            io.to('gameLobby').emit('updateUserList', onlineUsers);
            io.to('gameLobby').emit('updateOngoingGames', ongoingGames);
    
            // Notify both players to start the game
            fromUserSocket.emit('startGame', { gameId, opponent: to, symbol: 'X', turn: from });
            targetUserSocket.emit('startGame', { gameId, opponent: from, symbol: 'O', turn: from });
    
            // Join game room
            fromUserSocket.join(`game-${gameId}`);
            targetUserSocket.join(`game-${gameId}`);
    
            console.log(`Game started between ${from} and ${to}`);
        }
    });
    

    socket.on('joinGame', (data) => {
        const { gameId, username } = data;
        socket.join(`game-${gameId}`);
        const game = ongoingGames.find(game => game.id === gameId);
        if (game) {
            const turn = game.turn;
            const symbol = game.player1 === username ? 'X' : 'O';
            socket.emit('gameStart', { gameId, turn, symbol });
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
