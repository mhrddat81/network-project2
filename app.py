from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash  

app = Flask(__name__)

# Configure database connection (replace with your credentials)
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql://root:admin@localhost:3306/tictactoe_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False  # Disable modification tracking

db = SQLAlchemy(app)

# Database models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    online = db.Column(db.Boolean, default=False)  # User online status

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def verify_password(self, password):
        return check_password_hash(self.password_hash, password)

class MatchRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(255), nullable=False)  # 'pending', 'accepted', 'rejected'

# Registration route
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    # Validate username and password (optional)

    if User.query.filter_by(username=username).first():
        return jsonify({'message': 'Username already exists'}), 400  # Bad request

    user = User(username=username)
    user.set_password(password)  # Hash password before storing

    db.session.add(user)
    db.session.commit()

    return jsonify({'message': 'Registration successful!'}), 201  # Created

# Login route
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()
    if not user or not user.verify_password(password):
        return jsonify({'message': 'Invalid username or password'}), 401  # Unauthorized

    user.online = True  # Update user's online status
    db.session.commit()

    return jsonify({'message': 'Login successful!'}), 200  # OK

# Logout route
@app.route('/logout', methods=['POST'])
def logout():
    data = request.get_json()
    username = data.get('username')

    user = User.query.filter_by(username=username).first()
    if user:
        user.online = False  # Update user's online status
        db.session.commit()

    return jsonify({'message': 'Logout successful!'}), 200  # OK

# ... (other routes for matchmaking functionality, using User and MatchRequest models)

if __name__ == '__main__':
    db.create_all()  # Create database tables if they don't exist
    app.run(debug=True)
