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
    // Fetch online users from server
    fetch('/online_users')
        .then(response => response.json())
        .then(data => {
            const userList = document.getElementById('userList');
            data.forEach(user => {
                const usernameElement = document.createElement('div');
                usernameElement.textContent = user.username;
                userList.appendChild(usernameElement);
            });
        })
        .catch(error => console.error('Error fetching online users:', error));
});