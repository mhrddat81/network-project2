const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginMessage = document.getElementById('login-message');
const registerMessage = document.getElementById('register-message');

// Login form submission handling
loginForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  // Send login request to Flask route using AJAX
  fetch('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Redirect to game lobby on successful login
        window.location.href = '/lobby';
      } else {
        loginMessage.textContent = data.message;
      }
    })
    .catch(error => {
      console.error(error);
      loginMessage.textContent = 'An error occurred. Please try again.';
    });
});

// Registration form submission handling
registerForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  // Validation (check if passwords match, etc.)
  if (password !== confirmPassword) {
    registerMessage.textContent = 'Passwords do not match.';
    return; // Prevent further processing if validation fails
  }

  // Send registration request to Flask route using AJAX
  fetch('/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Handle successful registration (e.g., display success message, redirect to login)
        registerMessage.textContent = 'Registration successful! Please log in.';
      } else {
        registerMessage.textContent = data.message;
      }
    })
    .catch(error => {
      console.error(error);
      registerMessage.textContent = 'An error occurred. Please try again.';
    });
});
