function showRegisterForm() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
}

function showLoginForm() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
}

function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    // Here you would add your authentication logic
    if (username && password) {
        window.location.href = 'game-lobby.html';
    }
}

function register() {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    // Here you would add your registration logic
    if (username && password) {
        window.location.href = 'game-lobby.html';
    }
}

function startGame(playerName) {
    window.location.href = 'game.html';
}

function makeMove(cell) {
    if (!cell.textContent) {
        cell.textContent = 'X'; // For now, we are just marking 'X'. Later, we will add game logic.
    }
}
