# J Chess

A web-based chess learning application that combines the power of Stockfish engine with an intuitive interface for chess improvement.

## Features

- Interactive chess board with move validation
- Real-time position analysis using Stockfish
- Move suggestions and evaluation
- Learning insights and mistake analysis
- Custom puzzle generation

## Setup

1. Install Python 3.8 or higher
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Install Stockfish chess engine (download from https://stockfishchess.org/download/)
4. Set up environment variables:
   - Create a `.env` file
   - Add `STOCKFISH_PATH=/path/to/stockfish/executable`

## Running the Application

1. Start the Flask server:
   ```bash
   python app.py
   ```
2. Open your browser and navigate to `http://localhost:5000`

## Project Structure

- `app.py` - Main Flask application
- `static/` - Frontend assets (JS, CSS, images)
- `templates/` - HTML templates
- `chess_engine/` - Chess logic and Stockfish integration
- `learning/` - Learning module components

## Technologies Used

- Backend: Flask, python-chess, Stockfish
- Frontend: chessboard.js, chess.js, Bootstrap
- Real-time updates: Flask-SocketIO 