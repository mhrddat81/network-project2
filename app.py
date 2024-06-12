from flask import Flask, request, jsonify
from flask_mysqldb import MySQL
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)

# Configure MySQL
app.config['MYSQL_HOST'] = 'localhost'
app.config['MYSQL_USER'] = 'root'
app.config['MYSQL_PASSWORD'] = 'admin'
app.config['MYSQL_DB'] = 'tictactoe_db'

mysql = MySQL(app)

@app.route('/')
def index():
    return "Welcome to the Tic-Tac-Toe Game!"

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    
    hashed_password = generate_password_hash(password, method='sha256')
    
    cursor = mysql.connection.cursor()
    try:
        cursor.execute("INSERT INTO players (username, password) VALUES (%s, %s)", (username, hashed_password))
        mysql.connection.commit()
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cursor.close()
    
    return jsonify({"message": "User registered successfully"}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    
    cursor = mysql.connection.cursor()
    cursor.execute("SELECT * FROM players WHERE username = %s", (username,))
    user = cursor.fetchone()
    cursor.close()
    
    if user and check_password_hash(user[2], password):
        return jsonify({"message": "Login successful"}), 200
    else:
        return jsonify({"error": "Invalid username or password"}), 401

if __name__ == "__main__":
    app.run(debug=True)
