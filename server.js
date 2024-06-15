const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const app = express();
const port = 3000;
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
    secret: '123', // Replace with a random string for security your_secret_key
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
