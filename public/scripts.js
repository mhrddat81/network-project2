document.getElementById('registerForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;

    fetch('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => {
        if (response.ok) {
            window.location.href = `/game_lobby.html?username=${encodeURIComponent(username)}`;
        } else {
            response.text().then(text => alert(text));
        }
    })
    .catch(error => console.error('Error:', error));
});

document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => {
        if (response.ok) {
            window.location.href = `/game_lobby.html?username=${encodeURIComponent(username)}`;
        } else {
            response.text().then(text => alert(text));
        }
    })
    .catch(error => console.error('Error:', error));
});

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');

    // Fetch online users from server
    fetch('/online_users')
        .then(response => response.json())
        .then(data => {
            const userList = document.getElementById('userList');
            userList.innerHTML = ''; // Clear previous list

            data.forEach(user => {
                if (user.username !== username) {
                    const usernameElement = document.createElement('div');
                    usernameElement.textContent = user.username;
                    userList.appendChild(usernameElement);
                }
            });
        })
        .catch(error => console.error('Error fetching online users:', error));

    // Socket.io connection
    const socket = io();

    // Retrieve game information from sessionStorage
    const opponent = sessionStorage.getItem('opponent');
    const symbol = sessionStorage.getItem('symbol');

    // Display player and opponent information
    const playerInfo = document.getElementById('playerInfo');
    const opponentInfo = document.getElementById('opponentInfo');

    playerInfo.textContent = `You (${symbol}) - ${username}`;
    opponentInfo.textContent = `${opponent} (${symbol === 'X' ? 'O' : 'X'})`;
});
